# -*- mode: python ; coding: utf-8 -*-

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, copy_metadata

# Lazy imports and the downloaded SeedVR2 worker require package data as well
# as Python modules. Keep all native inference libraries; never prune CUDA/HIP.
packages = [
    'engineio', 'socketio', 'diffusers', 'transformers', 'huggingface_hub',
    'accelerate', 'safetensors', 'peft', 'chatterbox', 's3tokenizer', 'perth',
    'qwen_vl_utils', 'realesrgan', 'basicsr', 'imageio_ffmpeg', 'mediapipe',
    'rotary_embedding_torch', 'omegaconf', 'einops', 'gguf',
]
if sys.platform == 'darwin':
    packages += ['mlx', 'mlx_lm', 'mlx_vlm']
package_data, package_binaries, package_imports = [], [], []
for package in packages:
    data, binaries, imports = collect_all(package)
    package_data += data
    package_binaries += binaries
    package_imports += imports
# transformers checks dependency versions via distribution metadata.
for distribution in ['torch', 'torchvision', 'torchaudio', 'transformers', 'diffusers', 'accelerate', 'peft']:
    package_data += copy_metadata(distribution)
local_imports = [p.stem for p in Path('src/server').glob('*.py') if p.stem != 'diffuser']

a = Analysis(
    ['src/server/diffuser.py'],
    pathex=['src/server'],
    binaries=package_binaries,
    datas=package_data,
    hiddenimports=package_imports + local_imports + ['finger_frame_workflow', 'mediapipe', 'minimax_h3_gguf', 'h3_quantized', 'h3_numerics', 'h3_weight_stream', 'inference_memory', 'wan_residency', 'chatterbox.mtl_tts', 's3tokenizer', 'video_enhance', 'seedvr2_worker', 'rotary_embedding_torch', 'omegaconf', 'einops', 'gguf'],
    hookspath=['scripts/pyinstaller-hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='diffuser',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='diffuser',
)
