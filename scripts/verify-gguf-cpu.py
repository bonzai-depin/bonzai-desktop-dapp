"""Check the packaged backend API directly, without relying on async CLI logs."""
import ctypes
import os
from pathlib import Path
import sys


def verify(directory):
    directory = Path(directory).resolve()
    with os.add_dll_directory(str(directory)):
        runtime = ctypes.CDLL(str(directory / "ggml.dll"))
        base = ctypes.CDLL(str(directory / "ggml-base.dll"))
        runtime.ggml_backend_load_all.argtypes = []
        runtime.ggml_backend_load_all.restype = None
        runtime.ggml_backend_reg_by_name.argtypes = [ctypes.c_char_p]
        runtime.ggml_backend_reg_by_name.restype = ctypes.c_void_p
        base.ggml_backend_reg_dev_count.argtypes = [ctypes.c_void_p]
        base.ggml_backend_reg_dev_count.restype = ctypes.c_size_t
        runtime.ggml_backend_load_all()
        cpu = runtime.ggml_backend_reg_by_name(b"CPU")
        if not cpu or base.ggml_backend_reg_dev_count(cpu) < 1:
            raise RuntimeError("Packaged CPU backend did not register a device")
        print("Verified packaged CPU backend through the native registry API")


if __name__ == "__main__":
    verify(sys.argv[1])
