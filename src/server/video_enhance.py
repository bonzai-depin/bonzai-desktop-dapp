"""Local video restoration: pinned SeedVR2 runtime, bounded memory, playable output.

No model/network imports at module load; downloads belong to BonzAI's preflight.
"""
from collections import deque
from dataclasses import dataclass, replace
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
from r2_models import model_file
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

SEEDVR2_REVISION = "4490bd1f482e026674543386bb2a4d176da245b9"
SEEDVR2_MODEL_REVISION = "09ced71023636e9bc8cdf9cdecfb2625d1e691e8"
SEEDVR2_DIT = "seedvr2_ema_3b_fp16.safetensors"
SEEDVR2_VAE = "ema_vae_fp16.safetensors"
SEEDVR2_ARCHIVE = f"seedvr2-{SEEDVR2_REVISION}.zip"
SEEDVR2_FILES = [
    dict(name=SEEDVR2_DIT, size=6783018808,
         sha256="2fd0e03a3dad24e07086750360727ca437de4ecd456f769856e960ae93e2b304"),
    dict(name=SEEDVR2_VAE, size=501324814,
         sha256="20678548f420d98d26f11442d3528f8b8c94e57ee046ef93dbb7633da8612ca1"),
    dict(name=SEEDVR2_ARCHIVE, size=4864981,
         sha256="04c61842bc00fd8673e6bc9a3b1b1935955461f363791070ed14d67d2a2e77fb"),
]
for _file in SEEDVR2_FILES:
    _file["url"] = (
        f"https://codeload.github.com/numz/ComfyUI-SeedVR2_VideoUpscaler/zip/{SEEDVR2_REVISION}"
        if _file["name"] == SEEDVR2_ARCHIVE else
        model_file(_file["name"])["url"]
    )


@dataclass(frozen=True)
class EnhanceOptions:
    backend: str = "seedvr2"
    upscale: bool = True
    interp_factor: int = 1
    resolution: int = 720
    max_resolution: int = 1280
    batch_size: int = 5
    seed: int = 42
    variant: str = "default"
    auto_download: bool = False

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object.")
        values = {k: data[k] for k in cls.__dataclass_fields__ if k in data}
        options = cls(**values)
        if options.backend not in ("seedvr2", "realesrgan"):
            raise ValueError("backend must be seedvr2 or realesrgan.")
        for key in ("upscale", "auto_download"):
            if type(getattr(options, key)) is not bool:
                raise ValueError(f"{key} must be a boolean.")
        for key, lo, hi in (("resolution", 128, 2160), ("max_resolution", 128, 3840),
                            ("batch_size", 1, 17), ("seed", 0, 2**32 - 1), ("interp_factor", 1, 8)):
            value = getattr(options, key)
            if type(value) is not int or not lo <= value <= hi:
                raise ValueError(f"{key} must be an integer between {lo} and {hi}.")
        if options.batch_size % 4 != 1:
            raise ValueError("batch_size must be 1, 5, 9, 13 or 17.")
        if options.interp_factor not in (1, 2, 4, 8):
            raise ValueError("interp_factor must be 1, 2, 4 or 8.")
        if options.max_resolution < options.resolution:
            raise ValueError("max_resolution must be at least resolution.")
        if options.variant not in ("default", "anime"):
            raise ValueError("variant must be default or anime (Real-ESRGAN only).")
        if options.backend == "seedvr2" and options.variant != "default":
            raise ValueError("The anime variant requires backend=realesrgan.")
        return options

    def for_source(self, data, size):
        # Defaults must not reduce an existing HD clip to 720p. Explicit API
        # resolution controls may request a smaller restoration when desired.
        return replace(self,
            resolution=self.resolution if "resolution" in data else max(self.resolution, min(size)),
            max_resolution=self.max_resolution if "max_resolution" in data else max(self.max_resolution, max(size)))


_verified = {}


def verify_asset(path, expected_hash):
    path = Path(path)
    info = path.stat()
    key = (str(path.resolve()), info.st_size, info.st_mtime_ns, expected_hash)
    if key in _verified:
        return
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != expected_hash:
        raise ValueError(f"{path.name} failed integrity verification. Remove it and download it again.")
    _verified[key] = True


def prepare_seedvr2(model_dir):
    """Verify code and weights, then atomically unpack the versioned runtime."""
    model_dir = Path(model_dir)
    for item in SEEDVR2_FILES:
        verify_asset(model_dir / item["name"], item["sha256"])
    root = model_dir / "runtimes"
    root.mkdir(exist_ok=True)
    target = root / f"seedvr2-{SEEDVR2_REVISION}"
    if (target / "inference_cli.py").is_file():
        return target
    prefix = f"ComfyUI-SeedVR2_VideoUpscaler-{SEEDVR2_REVISION}/"
    with tempfile.TemporaryDirectory(dir=root) as temporary:
        staging = Path(temporary) / "runtime"
        staging.mkdir()
        with zipfile.ZipFile(model_dir / SEEDVR2_ARCHIVE) as archive:
            for member in archive.infolist():
                if not member.filename.startswith(prefix):
                    raise ValueError("Unexpected SeedVR2 archive layout.")
                relative = Path(member.filename[len(prefix):])
                if relative.is_absolute() or ".." in relative.parts or stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError("Unsafe SeedVR2 archive entry.")
                destination = staging / relative
                if member.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(member) as source, destination.open("wb") as output:
                        shutil.copyfileobj(source, output)
        if not (staging / "inference_cli.py").is_file():
            raise ValueError("SeedVR2 runtime entry point is missing.")
        staging.rename(target)
    return target


def seedvr2_dependencies():
    return [name for name in ("rotary_embedding_torch", "omegaconf", "cv2", "einops", "gguf")
            if importlib.util.find_spec(name) is None]


def seedvr2_command(runtime, model_dir, input_path, output_path, options, device):
    # A frozen server is an executable, not a Python interpreter. Its early
    # worker entry point bypasses Flask and the server's eager model imports.
    if getattr(sys, "frozen", False):
        command = [sys.executable, "--bonzai-seedvr2-worker"]
    else:
        command = [sys.executable, str(Path(__file__).with_name("seedvr2_worker.py"))]
    command += [str(runtime), str(input_path), "--output", str(output_path),
                "--output_format", "mp4", "--model_dir", str(model_dir),
                "--dit_model", SEEDVR2_DIT, "--resolution", str(options.resolution),
                "--max_resolution", str(options.max_resolution),
                "--batch_size", str(options.batch_size), "--chunk_size", str(options.batch_size),
                "--temporal_overlap", "0" if options.batch_size == 1 else "1",
                "--uniform_batch_size", "--seed", str(options.seed), "--attention_mode", "sdpa",
                "--vae_encode_tiled", "--vae_decode_tiled",
                "--vae_encode_tile_size", "512", "--vae_decode_tile_size", "512",
                "--vae_encode_tile_overlap", "64", "--vae_decode_tile_overlap", "64",
                "--color_correction", "lab", "--cache_dit", "--cache_vae",
                "--dit_offload_device", "cpu", "--vae_offload_device", "cpu"]
    if str(device).startswith("cuda"):
        command += ["--blocks_to_swap", "24"]
    return command


def run_seedvr2(runtime, model_dir, input_path, output_path, options, device, progress=None):
    command = seedvr2_command(runtime, model_dir, input_path, output_path, options, device)
    env = dict(os.environ, HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
               PYTHONUNBUFFERED="1", BONZAI_SEEDVR2_DEVICE=str(device))
    # Upstream disables Metal's allocator limits by default. Keep a real limit
    # so a large request fails rather than exhausting the user's entire Mac.
    env["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "1.0"
    env["PYTORCH_MPS_LOW_WATERMARK_RATIO"] = "0.8"
    tail = deque(maxlen=25)
    with subprocess.Popen(command, cwd=runtime, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True, errors="replace") as process:
        try:
            for line in process.stdout:
                tail.append(line.strip())
                match = re.search(r"Chunk (\d+)/(\d+):", line)
                if match and progress:
                    progress("restoring", int(match[1]) - 1, int(match[2]))
            code = process.wait()
            if code != 0:
                raise RuntimeError(f"SeedVR2 failed (exit {code}): " + "\n".join(tail)[-3000:])
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    if not Path(output_path).is_file():
        raise RuntimeError("SeedVR2 did not produce a video.")


def probe_video(path, *, count_frames=False):
    import av
    with av.open(str(path)) as container:
        if not container.streams.video:
            raise ValueError("The file contains no video stream.")
        stream = container.streams.video[0]
        fps = float(stream.average_rate or stream.guessed_rate or 0)
        frames = sum(1 for _ in container.decode(stream)) if count_frames else int(stream.frames or 0)
        duration = float(stream.duration * stream.time_base) if stream.duration is not None else (
            float(container.duration / av.time_base) if container.duration else 0)
        if not math.isfinite(fps) or fps <= 0 or stream.width <= 0 or stream.height <= 0:
            raise ValueError("The video has invalid dimensions or frame rate.")
        if count_frames and not frames:
            raise ValueError("The video contains no decodable frames.")
        return dict(fps=fps, size=[stream.width, stream.height], frame_count=frames,
                    duration=duration, has_audio=bool(container.streams.audio))


def finish_video(source, restored, output, options, metadata, ffmpeg):
    """Keep the source audio/timing and produce Electron-compatible fast-start MP4."""
    fps = metadata["fps"] * options.interp_factor
    filters = ["pad=ceil(iw/2)*2:ceil(ih/2)*2"]
    if options.interp_factor > 1:
        # Pad the temporal filter's look-ahead, then trim to the source length.
        # Without it minterpolate drops the tail of short clips.
        filters += [f"tpad=stop_mode=clone:stop_duration={3 / metadata['fps']}",
                    f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"]
    command = [ffmpeg, "-nostdin", "-y", "-i", str(restored), "-i", str(source),
               "-map", "0:v:0", "-map", "1:a?", "-vf", ",".join(filters),
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
               "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    if metadata["duration"] > 0:
        command += ["-t", str(metadata["duration"])]
    result = subprocess.run(command + [str(output)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Video encoding failed: " + result.stderr[-2000:])
    actual = probe_video(output, count_frames=True)
    if metadata["frame_count"]:
        expected = metadata["frame_count"] * options.interp_factor
        if abs(actual["frame_count"] - expected) > (0 if options.interp_factor == 1 else 1):
            raise RuntimeError("Enhancement returned an incomplete video.")
    if metadata["has_audio"] and not actual["has_audio"]:
        raise RuntimeError("Enhancement lost the source audio.")
    return actual
