"""Enhancement contract tests; optional real SeedVR2 test uses synthetic media.

BONZAI_SEEDVR2_TEST_MODELS=/absolute/model/directory enables the real GPU test.
"""
import ast
import base64
from dataclasses import replace
import hashlib
import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from flask import Flask
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src/server"))
import video_enhance as enhance
from inference_serialization import install_inference_serialization

TREE = ast.parse((ROOT / "src/server/diffuser.py").read_text())
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def synthetic_video(path, rate="5"):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"testsrc2=size=192x128:rate={rate}",
                    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
                    "-frames:v", "10", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", str(path)], check=True)


class VideoEnhanceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.input = self.root / "input.mp4"
        synthetic_video(self.input)
        self.app = Flask(__name__)
        install_inference_serialization(self.app)
        self.env = dict(app=self.app, MODEL_DIR=self.root, Path=Path, tempfile=tempfile,
                        base64=base64, logger=logging.getLogger(__name__),
                        genbus=Mock(), DeviceManager=Mock(), _ESRGAN_CACHE={},
                        _ensure_files_present_or_start=Mock(return_value=None),
                        _ffmpeg_exe=lambda: FFMPEG)
        from flask import request, jsonify
        self.env.update(request=request, jsonify=jsonify)
        self.env["genbus"].new.return_value = "test"
        self.env["DeviceManager"].get_device.return_value = "mps"
        node = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == "video_enhance")
        exec(compile(ast.Module(body=[node], type_ignores=[]), "endpoint", "exec"), self.env)
        self.client = self.app.test_client()

    def post(self, **options):
        return self.client.post("/video/enhance", json={"video_path": str(self.input), **options})

    def test_defaults_preserve_timing_and_do_not_downsample_existing_hd(self):
        options = enhance.EnhanceOptions.parse({})
        self.assertEqual(options.backend, "seedvr2")
        self.assertEqual(options.interp_factor, 1)
        effective = options.for_source({}, [1920, 1080])
        self.assertEqual((effective.resolution, effective.max_resolution), (1080, 1920))

    def test_invalid_input_never_triggers_downloads(self):
        for data in [None, [], {}, {"video_path": 1}, {"video_path": "/missing.mp4"},
                     {"video_path": str(self.input), "video_base64": "also provided"},
                     {"video_base64": "invalid base64!!"},
                     *({"video_path": str(self.input), **bad} for bad in [
                         {"backend": "unknown"}, {"batch_size": 2}, {"upscale": "false"},
                         {"auto_download": "false"}, {"resolution": 0}, {"interp_factor": 3},
                         {"seed": -1}, {"batch_size": True}, {"max_resolution": 128},
                         {"variant": "anime"}])]:
            with self.subTest(data=data):
                response = self.client.post("/video/enhance", json=data)
                self.assertEqual(response.status_code, 400, response.json)
        self.env["_ensure_files_present_or_start"].assert_not_called()

    def test_download_accepted_is_not_a_generation_and_temp_input_is_cleaned(self):
        self.env["_ensure_files_present_or_start"].return_value = ({"pipeline_id": "download"}, 202)
        with patch.object(enhance, "seedvr2_dependencies", return_value=[]), patch.object(enhance, "run_seedvr2") as run:
            result = self.client.post("/video/enhance", json={
                "video_base64": base64.b64encode(self.input.read_bytes()).decode(), "auto_download": True})
        self.assertEqual(result.status_code, 202)
        run.assert_not_called()
        self.env["genbus"].new.assert_not_called()
        self.assertEqual(list((self.root / "files").iterdir()), [])

    def test_missing_dependency_is_actionable_before_large_download(self):
        with patch.object(enhance, "seedvr2_dependencies", return_value=["rotary_embedding_torch"]):
            result = self.post()
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json["error"], "seedvr2_runtime_missing")
        self.env["_ensure_files_present_or_start"].assert_not_called()

    def test_default_endpoint_keeps_audio_timing_and_original_file(self):
        before = hashlib.sha256(self.input.read_bytes()).hexdigest()
        def restore(_runtime, _models, source, output, *_args, **_kwargs):
            shutil.copyfile(source, output)
        with patch.object(enhance, "seedvr2_dependencies", return_value=[]), \
             patch.object(enhance, "prepare_seedvr2", return_value=self.root), \
             patch.object(enhance, "run_seedvr2", side_effect=restore):
            result = self.post()
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(result.json["backend"], "seedvr2")
        self.assertEqual(result.json["frame_count"], 10)
        self.assertEqual(result.json["output_fps"], 5)
        self.assertTrue(result.json["has_audio"])
        self.assertEqual(before, hashlib.sha256(self.input.read_bytes()).hexdigest())
        content = Path(result.json["video_path"]).read_bytes()
        self.assertLess(content.index(b"moov"), content.index(b"mdat"))
        self.assertEqual(len(list((self.root / "files").iterdir())), 1)
        self.env["_ensure_files_present_or_start"].assert_called_once_with("video_enhance", auto_download=False)

    def test_failure_does_not_publish_or_leave_partial_output(self):
        with patch.object(enhance, "seedvr2_dependencies", return_value=[]), \
             patch.object(enhance, "prepare_seedvr2", return_value=self.root), \
             patch.object(enhance, "run_seedvr2", side_effect=RuntimeError("out of memory")):
            with self.assertLogs(level="ERROR"):
                result = self.post()
        self.assertEqual(result.status_code, 500)
        self.env["genbus"].finish.assert_not_called()
        self.env["genbus"].error.assert_called_once()
        self.assertEqual(list((self.root / "files").iterdir()), [])
        # Also proves a failed request released the inference serialization lock.
        self.assertEqual(self.post(upscale=False).status_code, 200)

    def test_fractional_fps_and_optional_interpolation_preserve_audio(self):
        synthetic_video(self.input, rate="30000/1001")
        source = enhance.probe_video(self.input, count_frames=True)
        for factor in (1, 2, 4):
            with self.subTest(factor=factor):
                output = self.root / f"result-{factor}.mp4"
                result = enhance.finish_video(self.input, self.input, output,
                    enhance.EnhanceOptions(interp_factor=factor), source, FFMPEG)
                self.assertAlmostEqual(result["fps"], (30000/1001) * factor, places=3)
                self.assertTrue(result["has_audio"])
                self.assertLessEqual(abs(result["frame_count"] - 10 * factor), 1)

    def test_incomplete_restoration_is_rejected(self):
        source = enhance.probe_video(self.input, count_frames=True)
        source["frame_count"] = 15
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            enhance.finish_video(self.input, self.input, self.root/"short.mp4", enhance.EnhanceOptions(), source, FFMPEG)

    def test_legacy_backend_uses_its_own_download_requirements(self):
        self.env["_ensure_files_present_or_start"].return_value = ({"pipeline_id": "esrgan"}, 202)
        self.assertEqual(self.post(backend="realesrgan", variant="anime").status_code, 202)
        self.env["_ensure_files_present_or_start"].assert_called_once_with("video_enhance_realesrgan", auto_download=False)

    def test_worker_memory_options_and_packaged_entrypoint(self):
        for device in ("mps", "cuda", "cpu"):
            command = enhance.seedvr2_command(self.root, self.root, self.input, self.root/"out.mp4",
                                              enhance.EnhanceOptions(), device)
            self.assertIn("--chunk_size", command)
            self.assertIn("--vae_decode_tiled", command)
            self.assertEqual("--blocks_to_swap" in command, device == "cuda")
            self.assertNotIn("--compile_dit", command)
        with patch.object(sys, "frozen", True, create=True):
            command = enhance.seedvr2_command(self.root, self.root, self.input, self.root/"out.mp4",
                                              enhance.EnhanceOptions(), "mps")
        self.assertEqual(command[:2], [sys.executable, "--bonzai-seedvr2-worker"])

    def test_pinned_assets_are_lowercase_and_tampered_code_cannot_execute(self):
        for item in enhance.SEEDVR2_FILES:
            self.assertEqual(item["name"], item["name"].lower())
            self.assertNotIn("/main/", item["url"])
        for item in enhance.SEEDVR2_FILES:
            (self.root / item["name"]).write_bytes(b"invalid")
        with self.assertRaisesRegex(ValueError, "integrity"):
            enhance.prepare_seedvr2(self.root)
        self.assertFalse((self.root / "runtimes").exists())

    @unittest.skipUnless(os.environ.get("BONZAI_SEEDVR2_TEST_MODELS"), "real SeedVR2 test is opt-in")
    def test_real_seedvr2_endpoint_with_two_batches_audio_and_spatial_upscale(self):
        import torch
        self.env["MODEL_DIR"] = Path(os.environ["BONZAI_SEEDVR2_TEST_MODELS"]).resolve()
        device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
        self.env["DeviceManager"].get_device.return_value = device
        result = self.post(resolution=256, max_resolution=384)
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(result.json["output_size"], [384, 256])
        self.assertEqual(result.json["frame_count"], 10)
        self.assertEqual(result.json["output_fps"], 5)
        self.assertTrue(result.json["has_audio"])
        print("REAL_SEEDVR2_RESULT", result.json, flush=True)


if __name__ == "__main__":
    unittest.main()
