"""Weight-free frozen-runtime verification, shared by all release platforms."""
import importlib
import json
import subprocess


def main():
    modules = [
        'torch', 'torchvision', 'torchaudio', 'diffusers', 'transformers',
        'flask', 'flask_socketio', 'engineio.async_drivers.threading',
        'accelerate', 'peft', 'gguf', 'av', 'soundfile', 'imageio_ffmpeg',
        'minimax_h3_gguf', 'h3_quantized', 'h3_numerics', 'h3_weight_stream',
        'inference_memory', 'wan_residency', 'video_enhance', 'seedvr2_worker',
        'chatterbox.mtl_tts', 'rotary_embedding_torch', 'omegaconf',
    ]
    for module in modules:
        importlib.import_module(module)
    import torch
    import imageio_ffmpeg
    from diffusers import WanImageToVideoPipeline
    torch.testing.assert_close(torch.ones(2, 2) @ torch.ones(2, 2), torch.full((2, 2), 2.))
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-version'], check=True)
    print(json.dumps({'runtime_check': 'passed', 'torch': torch.__version__, 'modules': modules}))


if __name__ == '__main__':
    main()
