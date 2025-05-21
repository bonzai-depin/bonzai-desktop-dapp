# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['src/server/diffuser.py'],
    pathex=[],
    binaries=[],
    datas=[('bonzai/lib/python3.11/site-packages/diffusers', 'diffusers'),
        ('bonzai/lib/python3.11/site-packages/clip/bpe_simple_vocab_16e6.txt.gz', 'clip'),
        ('bonzai/lib/python3.11/site-packages/audiotools/core/templates', 'audiotools/core/templates'),
        ('bonzai/lib/python3.11/site-packages/dac/nn/layers.py', 'dac/nn')],
    hiddenimports=[],
    hookspath=[],
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
    a.binaries,
    a.datas,
    [],
    name='diffuser',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)