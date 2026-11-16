"""Resolve training export tools in development and packaged installations."""
import os
import platform
import shutil
import sys
from pathlib import Path


def find_converter(model_dir, server_dir=None):
    server = Path(server_dir) if server_dir else Path(__file__).parent
    roots = [server / 'scripts', Path(model_dir) / 'bin', Path.home() / 'llama.cpp']
    if getattr(sys, '_MEIPASS', None):
        roots.insert(0, Path(sys._MEIPASS) / 'scripts')
    for root in roots:
        script = root / 'convert_hf_to_gguf.py'
        if script.is_file():
            return str(script)
    return None


def find_quantizer(model_dir, server_dir=None, system=None, machine=None):
    server = Path(server_dir) if server_dir else Path(__file__).parent
    system = system or platform.system()
    arch = 'arm64' if (machine or platform.machine()).lower() in ('arm64', 'aarch64') else 'x64'
    platform_key = {'Darwin': 'macos', 'Windows': 'windows', 'Linux': 'linux'}.get(system, system.lower())
    names = ['llama-quantize.exe', 'quantize.exe'] if system == 'Windows' else ['llama-quantize', 'quantize']
    roots = [Path(model_dir) / 'bin', server.parent.parent / 'bin' / f'{platform_key}-{arch}',
             Path(sys.executable).parent, Path(sys.executable).parent.parent / 'bin' / f'{platform_key}-{arch}']
    for root in roots:
        for name in names:
            candidate = root / name
            if candidate.is_file() and (system == 'Windows' or os.access(candidate, os.X_OK)):
                return str(candidate)
    return next((path for name in names if (path := shutil.which(name))), None)


def converter_command(script, *args):
    flag = ['--bonzai-convert-hf'] if getattr(sys, 'frozen', False) else []
    return [sys.executable, *flag, str(script), *map(str, args)]


def run_converter():
    import runpy
    script = Path(sys.argv[2]).resolve()
    sys.argv = [str(script), *sys.argv[3:]]
    sys.path.insert(0, str(script.parent))
    sys.path.insert(0, str(script.parent / 'gguf-py'))
    runpy.run_path(str(script), run_name='__main__')
