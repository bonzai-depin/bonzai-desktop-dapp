"""Weight-free frozen-runtime verification, shared by all release platforms."""
import importlib
import json
import os
import subprocess


def main():
    os.environ.setdefault("TORCHVISION_WARN_WHEN_EXTENSION_LOADING_FAILS", "1")
    modules = [
        'torch', 'torchvision', 'torchaudio', 'diffusers', 'transformers',
        'flask', 'flask_socketio', 'engineio.async_drivers.threading',
        'accelerate', 'peft', 'gguf', 'av', 'soundfile', 'imageio_ffmpeg',
        'minimax_h3_gguf', 'h3_quantized', 'h3_numerics', 'h3_weight_stream',
        'inference_memory', 'wan_residency', 'video_enhance', 'seedvr2_worker',
        'chatterbox.mtl_tts', 'rotary_embedding_torch', 'omegaconf',
    ]
    for module in modules:
        print(f"[runtime-check] importing {module}", flush=True)
        importlib.import_module(module)
    import torch
    import torchvision
    # Exercise the native operator, not just Python imports. No GPU or weights needed.
    kept = torchvision.ops.nms(
        torch.tensor([[0., 0., 2., 2.], [0., 0., 2., 2.]]),
        torch.tensor([0.9, 0.8]), 0.5,
    )
    assert kept.tolist() == [0], f"Unexpected torchvision NMS result: {kept}"
    import imageio_ffmpeg
    from diffusers import WanImageToVideoPipeline
    torch.testing.assert_close(torch.ones(2, 2) @ torch.ones(2, 2), torch.full((2, 2), 2.))
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-version'], check=True)
    print(json.dumps({'runtime_check': 'passed', 'torch': torch.__version__, 'modules': modules}))


if __name__ == '__main__':
    main()
