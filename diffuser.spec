# diffuser.spec
# -*- mode: python ; coding: utf-8 -*-

import sys
import os
import site
import platform

from PyInstaller.utils.hooks import (
    collect_submodules,
    collect_data_files,
    collect_binaries,
    copy_metadata,
)

# ─── Platform policy ──────────────────────────────────────────────────────────
IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform.startswith("win")
IS_LIN = sys.platform.startswith("linux")

ONEFILE = IS_MAC            # onefile only on macOS (CPU wheel stays small)
CONSOLE = False             # set True if you want a console during dev
UPX = False                 # safer across platforms

# ─── 1) Locate the venv's site-packages ───────────────────────────────────────
try:
    venv_site = site.getsitepackages()[0]
except Exception:
    venv_site = os.path.join(
        sys.prefix,
        "lib",
        f"python{sys.version_info.major}.{sys.version_info.minor}",
        "site-packages",
    )
if not os.path.isdir(venv_site):
    raise RuntimeError(f"Cannot find site-packages at {venv_site}")

# Ensure pip-installed packages are discovered
sys.path.insert(0, venv_site)

# ─── 2) Collect package data/metadata ────────────────────────────────────────
datas = []

# diffusers, transformers (code + metadata)
datas += collect_data_files("diffusers", include_py_files=True)
datas += copy_metadata("diffusers", recursive=True)
datas += collect_data_files("transformers", include_py_files=True)
datas += copy_metadata("transformers", recursive=True)

# clip vocabulary (non-py)
datas += collect_data_files("clip", include_py_files=False)

# audiotools templates
datas += collect_data_files("audiotools.core.templates", include_py_files=True)

# dac.nn.layers module
datas += collect_data_files("dac.nn.layers", include_py_files=True)

# language_tags JSON
datas += collect_data_files("language_tags", subdir="data/json", include_py_files=False)

# espeak-ng data (if present)
datas += collect_data_files("espeakng_loader", subdir="espeak-ng-data", include_py_files=False)

# Tokenizers/sentencepiece often ship extra assets
datas += collect_data_files("tokenizers", include_py_files=False)
datas += copy_metadata("tokenizers", recursive=True)
# sentencepiece is optional; include if present
try:
    datas += collect_data_files("sentencepiece", include_py_files=False)
    datas += copy_metadata("sentencepiece", recursive=True)
except Exception:
    pass

# safetensors metadata (binary wheel handled as binaries below)
datas += copy_metadata("safetensors", recursive=True)

# ─── 3) Hidden imports for dynamic modules ────────────────────────────────────
hiddenimports = []
for pkg in ("kokoro", "IPython", "diffusers", "transformers", "tokenizers"):
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception:
        pass

# Optional: sentencepiece submodules
try:
    hiddenimports += collect_submodules("sentencepiece")
except Exception:
    pass

# ─── 4) Native / binary wheels that need bundling (onedir esp.) ──────────────
binaries = []
# Rust-backed tokenizers / safetensors / sentencepiece libs
for pkg in ("tokenizers", "safetensors", "sentencepiece"):
    try:
        binaries += collect_binaries(pkg)
    except Exception:
        pass

# Torch has its own PyInstaller hook that gathers torch/lib/*.so* / DLLs.
# No explicit collect_binaries for torch is typically required.

# ─── 5) Build specification ───────────────────────────────────────────────────
block_cipher = None

a = Analysis(
    ["src/server/diffuser.py"],
    pathex=[os.getcwd()],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name="diffuser",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=UPX,
    console=CONSOLE,
    runtime_tmpdir=None,
    # onefile only on macOS; onedir elsewhere (prevents 4 GB single-archive)
    **({"onefile": True} if ONEFILE else {"onefile": False}),
)

# On Linux/Windows we must produce an onedir folder → COLLECT stage.
# On macOS (onefile) this COLLECT is not needed.
if not ONEFILE:
    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=UPX,
        upx_exclude=[],
        name="diffuser",
    )