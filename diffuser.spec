# diffuser.spec
# -*- mode: python ; coding: utf-8 -*-

import sys
import os
import site
from PyInstaller.utils.hooks import (
    collect_submodules,
    collect_data_files,
    copy_metadata
)

# ─── 1) Locate the venv's site-packages ────────────────────────────────
try:
    venv_site = site.getsitepackages()[0]
except Exception:
    venv_site = os.path.join(
        sys.prefix,
        "lib",
        f"python{sys.version_info.major}.{sys.version_info.minor}",
        "site-packages"
    )
if not os.path.isdir(venv_site):
    raise RuntimeError(f"Cannot find site-packages at {venv_site}")

# Prepend so Analysis sees pip-installed packages like kokoro, IPython
sys.path.insert(0, venv_site)                                 

# ─── 2) Collect Python package data ────────────────────────────────────
datas = []

# diffusers package (all files)
datas += collect_data_files('diffusers', include_py_files=True)
datas += copy_metadata('diffusers', recursive=True)

# transformers package (all files)
datas += collect_data_files('transformers', include_py_files=True)
datas += copy_metadata('transformers', recursive=True)

# clip vocabulary (only non-.py files)
datas += collect_data_files('clip', include_py_files=False)

# audiotools templates
datas += collect_data_files('audiotools.core.templates', include_py_files=True)

# dac.nn.layers module
datas += collect_data_files('dac.nn.layers', include_py_files=True)

# language_tags JSON files (correctly mapped into a directory, not as a single-file folder)
datas += collect_data_files(
    'language_tags', 
    subdir='data/json', 
    include_py_files=False
)                           

datas += collect_data_files(
    'espeakng_loader',
    subdir='espeak-ng-data',
    include_py_files=False
)


# ─── 3) Hidden imports for dynamic modules ─────────────────────────────
hiddenimports = []
hiddenimports += collect_submodules('kokoro')
hiddenimports += collect_submodules('IPython')
hiddenimports += collect_submodules('diffusers')
hiddenimports += collect_submodules('transformers')

# ─── 4) Build specification ────────────────────────────────────────────
block_cipher = None

a = Analysis(
    ['src/server/diffuser.py'],
    pathex=[os.getcwd()],      # search your project root
    binaries=[],
    datas=datas,               # includes all JSON as files under .../data/json/
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='diffuser',           # must be non-None to avoid the TypeError 
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,              # or False if you don’t need a console
    runtime_tmpdir=None,
)
