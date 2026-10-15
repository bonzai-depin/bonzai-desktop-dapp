#!/usr/bin/env python3
"""Install BonzAI's Python dependencies and pinned current ML runtimes."""

import argparse
import os
from pathlib import Path
import platform
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
DIFFUSERS_REVISION = "0377f0c1b34e3ff313d41edad1bd79c2ed8bb5ec"
DIFFUSERS_URL = f"git+https://github.com/huggingface/diffusers.git@{DIFFUSERS_REVISION}"
CHATTERBOX_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
CHATTERBOX_URL = f"git+https://github.com/resemble-ai/chatterbox.git@{CHATTERBOX_REVISION}"
TORCH_NIGHTLY_ROOT = "https://download.pytorch.org/whl/nightly"


def run(*args: str) -> None:
    subprocess.run([sys.executable, "-m", "pip", *args], cwd=ROOT, check=True)


def default_torch_index() -> str:
    override = os.environ.get("BONZAI_TORCH_INDEX_URL")
    if override:
        return override
    if platform.system() == "Darwin":
        return f"{TORCH_NIGHTLY_ROOT}/cpu"
    # NVIDIA is the default packaged accelerator on Windows and Linux. ROCm
    # builds pass their matrix-specific index and --skip-torch in CI.
    return f"{TORCH_NIGHTLY_ROOT}/cu130"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-torch", action="store_true")
    parser.add_argument("--torch-index-url", default=default_torch_index())
    args = parser.parse_args()

    if not args.skip_torch:
        run(
            "install",
            "--no-cache-dir",
            "--upgrade",
            "--pre",
            "torch",
            "torchvision",
            "torchaudio",
            "--index-url",
            args.torch_index_url,
        )
    run("install", "--no-cache-dir", "--upgrade", "-r", "requirements.txt")
    run("install", "--no-cache-dir", "--upgrade", "--no-deps", "compel==2.4.0")
    # Source revisions are pinned for reproducible release builds. Their large
    # ML dependencies are owned by this repository so neither package can
    # downgrade the shared nightly PyTorch/Diffusers/Transformers stack.
    run("install", "--no-cache-dir", "--upgrade", "--no-deps", DIFFUSERS_URL)
    run("install", "--no-cache-dir", "--upgrade", "--force-reinstall", "--no-deps", CHATTERBOX_URL)
