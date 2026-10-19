#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BonzAI Media Generation Server
==============================
Clean, consolidated version with:
- Unified video encoding (no duplicate functions)
- Proper progress reporting for all pipelines
- Blend interpolation (no ghosting artifacts)
- LTX-2 video generation with GGUF quantization
"""
from __future__ import annotations

# Note: Using threading mode for Flask-SocketIO (PyInstaller compatible)
# eventlet was removed due to incompatibility with PyInstaller + numpy

import os
import sys

# CI checks the actual frozen runtime without starting services or loading models.
if __name__ == "__main__" and "--bonzai-runtime-check" in sys.argv:
    from runtime_check import main as _runtime_check
    _runtime_check()
    sys.exit(0)

# A frozen executable cannot launch Python source with sys.executable. Enter
# the isolated restoration worker before importing Flask or cached pipelines.
if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--bonzai-seedvr2-worker":
    from seedvr2_worker import main as _seedvr2_worker_main
    sys.argv.pop(1)
    _seedvr2_worker_main()
    sys.exit(0)

import re
import io
import time
import base64
import logging
import math
import threading
import hashlib
import platform
import shutil
import subprocess
import gc
import stat
import json
import tempfile
import types
from io import BytesIO
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Tuple
from fnmatch import fnmatch

import requests
import torch
import functools
import hmac
import secrets

_original_torch_load = torch.load

@functools.wraps(_original_torch_load)
def _patched_torch_load(*args, **kwargs):
    if 'map_location' not in kwargs:
        if torch.cuda.is_available():
            kwargs['map_location'] = 'cuda'
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            kwargs['map_location'] = 'cpu'
        else:
            kwargs['map_location'] = 'cpu'
    return _original_torch_load(*args, **kwargs)

torch.load = _patched_torch_load

import numpy as np

import torchaudio as ta

from PIL import Image

from appdirs import user_data_dir
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room

from huggingface_hub import HfApi, hf_hub_url

try:
    from safetensors.torch import safe_open as _safetensors_open
except Exception:
    _safetensors_open = None

from diffusers import (
    DiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    GGUFQuantizationConfig,
    Flux2KleinPipeline,
    ZImagePipeline,
    ZImageTransformer2DModel,
    LTX2Pipeline,
    LTX2ImageToVideoPipeline,
    LTX2VideoTransformer3DModel,
    AutoencoderKLLTX2Audio,
    WanImageToVideoPipeline,
    WanTransformer3DModel,
    AutoencoderKLWan,
    UniPCMultistepScheduler,
    FlowMatchEulerDiscreteScheduler,
)
from diffusers.utils import load_image, export_to_video
from diffusers.hooks import apply_group_offloading
from finger_frame_workflow import (
    analyze_video as analyze_finger_frame_video,
    composite_video as composite_finger_frame_video,
    materialize_uploaded_video,
    validate_video_path,
)

import wave

# =============================================================================
# CONFIGURATION
# =============================================================================

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bonzai-server")


def get_safe_model_dir() -> Path:
    env_dir = os.environ.get("BONZAI_MODEL_DIR")
    if env_dir:
        safe = Path(env_dir)
    else:
        safe = Path.home() / "bonzai-models"
    safe.mkdir(parents=True, exist_ok=True)
    return safe


MODEL_DIR = get_safe_model_dir()
USER_BIN_DIR = MODEL_DIR / "bin"
USER_BIN_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR = MODEL_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)

# Electron launches the venv interpreter directly, so sibling console tools
# installed by pip (notably Ninja for Quanto's MPS kernels) may not be on PATH.
_python_bin_dir = str(Path(sys.executable).absolute().parent)
if _python_bin_dir not in os.environ.get("PATH", "").split(os.pathsep):
    os.environ["PATH"] = _python_bin_dir + os.pathsep + os.environ.get("PATH", "")

os.environ["HF_HOME"] = str(MODEL_DIR / "hf")
os.environ["TRANSFORMERS_CACHE"] = str(MODEL_DIR / "hf")
os.environ["DIFFUSERS_CACHE"] = str(MODEL_DIR / "hf")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

LOCAL_ONLY = bool(int(os.getenv("BONZAI_LOCAL_ONLY", "1")))
MAX_REPO_BYTES = int(os.getenv("BONZAI_MAX_REPO_BYTES", str(60 * (1 << 30))))

# =============================================================================
# MODEL FILENAME NORMALIZATION
# =============================================================================

def normalize_model_filename(filename: str) -> str:
    """Normalize model filename to lowercase for .gguf and .safetensors files."""
    if not filename:
        return filename
    ext = Path(filename).suffix.lower()
    if ext in (".gguf", ".safetensors"):
        return filename.lower()
    return filename


# Model repositories
SDXL_BASE_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"
SDXL_LORA_NAME = "sdxl-lora.safetensors"
SDXL_LORA_URL = "https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/models/sdxl-lora.safetensors"

# FLUX Klein: retained 4B repository identity and current 9B GGUF Turbo assets
FLUX_KLEIN_REPO = "black-forest-labs/FLUX.2-klein-4b"
FLUX_KLEIN_9B_REPO = "black-forest-labs/FLUX.2-klein-9B"
FLUX_KLEIN_9B_GGUF_NAME = "flux-2-klein-9b-q4_k_m.gguf"
FLUX_KLEIN_9B_GGUF_URL = "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q4_K_M.gguf"
FLUX_KLEIN_9B_LORA_NAME = "flux-2-klein-9b-lora.safetensors"
FLUX_KLEIN_9B_LORA_EXTRA_NAME = "flux-2-klein-9b-lora-extra.safetensors"
FLUX_KLEIN_9B_LOCK = threading.Lock()


Z_REPO = "Tongyi-MAI/Z-Image-Turbo"
Z_GGUF_NAME = "z-image-turbo-q4_k_m.gguf"
Z_GGUF_URL = "https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/resolve/main/z-image-turbo-Q4_K_M.gguf"
Z_LOCAL_CHECKPOINT_NAME = "z_image_turbo-lora.safetensors"

# LTX-2 (19B DiT Model) - /video endpoint supports:
# - Text-to-Video (t2v): Generate video from text prompt only
# - Image-to-Video (i2v): Generate video from image + text prompt
# Uses from_single_file with GGUF quantization (~10GB)
LTX2_REPO = "Lightricks/LTX-2"
LTX2_QUANTO_CACHE_DIR = MODEL_DIR / "ltx2_quanto_cache"

# LTX-2 GGUF (for /video endpoint) - Distilled Q3_K_S quantization
# LTX2_GGUF_REPO = "vantagewithai/LTX-2-GGUF"
LTX2_GGUF_REPO = "https://huggingface.co/3ndetz/LTX2-Rapid-Merges-GGUF"
LTX2_GGUF_NAME = "ltx-2-19b-distilled-q3_k_s.gguf"
LTX2_GGUF_URL = "https://huggingface.co/3ndetz/LTX2-Rapid-Merges-GGUF/resolve/main/nsfw/ltx2-phr00tmerge-nsfw-v62/ltx2-phr00tmerge-nsfw-v62-Q3_K_S.gguf"
# LTX2_GGUF_URL = "https://huggingface.co/vantagewithai/LTX-2-GGUF/resolve/main/distilled/ltx-2-19b-distilled-Q3_K_S.gguf"

# LTX-2 Image2Video Adapter LoRA - improves I2V quality
LTX2_I2V_LORA_REPO = "MachineDelusions/LTX-2_Image2Video_Adapter_LoRa"
LTX2_I2V_LORA_FILENAME = "LTX-2-Image2Vid-Adapter.safetensors"

# Wan2.2 I2V 14B — High-quality image-to-video (GGUF quantized)
# Two-stage denoising: high-noise transformer (coarse structure) +
# low-noise transformer (fine details). With Lightning, boundary_ratio=0.5.
WAN_REPO = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
# Dasiwa GGUFs — pre-merged Wan 2.2 I2V variant with all LoRAs (Lightning
# distillation + animation style) baked into the quantized weights.
# Designed for: 4 steps, CFG 1.0, Sampler/Scheduler Euler/Simple or
# UniPC_BH2/Simple. No separate LoRA loading needed.
#
# Files live in MODEL_DIR and are mirrored under the R2 models/ prefix.
WAN_GGUF_REPO = "dasiwa/local"
WAN_GGUF_HIGH = "wan2.2_high_q5.gguf"
WAN_GGUF_LOW = "wan2.2_low_q5.gguf"
WAN_GGUF_HIGH_URL = "https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/models/wan2.2_high_q5.gguf"
WAN_GGUF_LOW_URL = "https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/models/wan2.2_low_q5.gguf"
WAN_GGUF_HIGH_QUANTSTACK_URL = WAN_GGUF_HIGH_URL
WAN_GGUF_LOW_QUANTSTACK_URL = WAN_GGUF_LOW_URL
WAN_VAE = "wan2.1_vae.safetensors"
WAN_VAE_URL = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/VAE/Wan2.1_VAE.safetensors"
WAN_LORA_CDN = "https://pub-c63241af101045fb837462e5c4c67e33.r2.dev"
# Animation LoRAs (high → transformer, low → transformer_2) — applied on
# top of the QuantStack base GGUF for stylized motion. The legacy
# "general" LoRAs were re-packaged Lightning weights; obsolete now that
# the real Lightning Seko V1 LoRA is loaded explicitly (WAN_LIGHTNING_*).
WAN_LORAS = {
    "animation_low": f"{WAN_LORA_CDN}/wan_lora_animation_low.safetensors",
    "animation_high": f"{WAN_LORA_CDN}/wan_lora_animation_high.safetensors",
}
# Lightning distillation LoRAs — reduce steps from 20-30 to 4, no CFG needed
WAN_LIGHTNING_REPO = "lightx2v/Wan2.2-Lightning"
WAN_LIGHTNING_HIGH = "wan_lightning_high_noise.safetensors"
WAN_LIGHTNING_LOW = "wan_lightning_low_noise.safetensors"
WAN_LIGHTNING_HIGH_URL = f"https://huggingface.co/{WAN_LIGHTNING_REPO}/resolve/main/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors"
WAN_LIGHTNING_LOW_URL = f"https://huggingface.co/{WAN_LIGHTNING_REPO}/resolve/main/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors"

# MiniMax H3 joint video/audio generation. The two large neural components
# stay in GGUF and are loaded in separate phases on memory-constrained
# machines. Unsloth's standalone VAEs avoid downloading the duplicate 10 GB
# FP32 VAE shards from the official repository; the official repository still
# provides the canonical configs, tokenizer, processor, and schedulers.
MINIMAX_H3_REPO = "MiniMaxAI/MiniMax-H3"
MINIMAX_H3_GGUF_REPO = "unsloth/MiniMax-H3-GGUF"
MINIMAX_H3_TRANSFORMER_NAME = "minimax_h3_fl2va_pruned-ud-q2_k_xl.gguf"
MINIMAX_H3_TEXT_ENCODER_NAME = "qwen3vl_32b_minimax_h3-q2_k_m.gguf"
MINIMAX_H3_VIDEO_VAE_NAME = "minimax_h3_video_vae_fp16.safetensors"
MINIMAX_H3_AUDIO_VAE_NAME = "minimax_h3_audio_vae_fp32.safetensors"
MINIMAX_H3_LORA_NAME = "h3_lora.safetensors"
MINIMAX_H3_HYBRID_NAME = "h3_hybrid.safetensors"
# This user-supplied file stays absent from the download plan until BonzAI
# hosts it. It is required by the backend preset and intentionally not exposed
# as a separate UI control.
MINIMAX_H3_LORA_STRENGTH = 0.5
MINIMAX_H3_SAMPLER = "euler_ancestral"
MINIMAX_H3_SCHEDULER = "simple"
MINIMAX_H3_GUIDANCE_SCALE = 1.0
MINIMAX_H3_VIDEO_SHIFT = 12.0
MINIMAX_H3_AUDIO_SHIFT = 3.0
MINIMAX_H3_TRANSFORMER_URL = (
    f"https://huggingface.co/{MINIMAX_H3_GGUF_REPO}/resolve/main/"
    "minimax_h3_fl2va_pruned-UD-Q2_K_XL.gguf"
)
MINIMAX_H3_TEXT_ENCODER_URL = (
    f"https://huggingface.co/{MINIMAX_H3_GGUF_REPO}/resolve/main/"
    "qwen3vl_32b_minimax_h3-Q2_K_M.gguf"
)
MINIMAX_H3_VIDEO_VAE_URL = (
    f"https://huggingface.co/{MINIMAX_H3_GGUF_REPO}/resolve/main/vae/"
    f"{MINIMAX_H3_VIDEO_VAE_NAME}"
)
MINIMAX_H3_AUDIO_VAE_URL = (
    f"https://huggingface.co/{MINIMAX_H3_GGUF_REPO}/resolve/main/vae/"
    f"{MINIMAX_H3_AUDIO_VAE_NAME}"
)

# --- /video/enhance: SeedVR2 restoration, optional Real-ESRGAN/interpolation ---
# Real-ESRGAN x4plus weights for spatial upscaling (~64 MB).
ESRGAN_X4_NAME = "RealESRGAN_x4plus.pth"
ESRGAN_X4_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
# Real-ESRGAN-Animevideo for animation-style outputs.
ESRGAN_X4_ANIME_NAME = "realesr-animevideov3.pth"
ESRGAN_X4_ANIME_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth"

# --- /video/test (Wan 2.2 I2V — FastDM Lightning merge + Q2 GGUF) ---
# Used by wan_i2v_video_test() below. Loads Q2_K GGUF transformer weights from
# QuantStack, applies the FastDM Lightning-merged model's config (diffusers
# architecture metadata) so the pipeline construction works with the merged
# scheduler/config without downloading the full bf16 weights. Per discussion
# thread #1 on the FastDM repo: 4 steps, guidance_scale=1.0, UniPC + flow_shift=8.
WAN_TEST_BASE_REPO = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
WAN_TEST_MERGE_REPO = "FastDM/Wan2.2-I2V-A14B-Merge-Lightning-V1.0-Diffusers"
WAN_TEST_GGUF_REPO = "QuantStack/Wan2.2-I2V-A14B-GGUF"
WAN_TEST_GGUF_HIGH = "HighNoise/Wan2.2-I2V-A14B-HighNoise-Q2_K.gguf"
WAN_TEST_GGUF_LOW = "LowNoise/Wan2.2-I2V-A14B-LowNoise-Q2_K.gguf"

# Kokoro TTS - Fast, lightweight TTS with multiple voices (ONNX)
# Supports male and female voices with style control
KOKORO_REPO = "hexgrad/Kokoro-82M"
KOKORO_VOICES = {
    # Female voices
    "af_heart": {"gender": "female", "style": "warm, emotional"},
    "af_alloy": {"gender": "female", "style": "neutral, professional"},
    "af_aoede": {"gender": "female", "style": "poetic, melodic"},
    "af_bella": {"gender": "female", "style": "friendly, expressive"},
    "af_jessica": {"gender": "female", "style": "clear, articulate"},
    "af_kore": {"gender": "female", "style": "youthful, energetic"},
    "af_nicole": {"gender": "female", "style": "soft, soothing"},
    "af_nova": {"gender": "female", "style": "modern, dynamic"},
    "af_river": {"gender": "female", "style": "calm, flowing"},
    "af_sarah": {"gender": "female", "style": "casual, conversational"},
    "af_sky": {"gender": "female", "style": "bright, uplifting"},
    # Male voices
    "am_adam": {"gender": "male", "style": "warm, mature"},
    "am_echo": {"gender": "male", "style": "resonant, deep"},
    "am_eric": {"gender": "male", "style": "casual, friendly"},
    "am_fenrir": {"gender": "male", "style": "strong, commanding"},
    "am_liam": {"gender": "male", "style": "youthful, energetic"},
    "am_michael": {"gender": "male", "style": "professional, clear"},
    "am_onyx": {"gender": "male", "style": "deep, smooth"},
    "am_puck": {"gender": "male", "style": "playful, mischievous"},
    # British voices
    "bf_emma": {"gender": "female", "style": "British, elegant"},
    "bf_isabella": {"gender": "female", "style": "British, refined"},
    "bm_george": {"gender": "male", "style": "British, distinguished"},
    "bm_lewis": {"gender": "male", "style": "British, casual"},
}
# Default voices by gender
KOKORO_DEFAULT_VOICE = {
    "female": "af_heart",
    "male": "am_adam",
    "neutral": "af_nova",
}

# Shared cross-platform llama.cpp vision model, aligned with BonzAI+.
VISION_GGUF_NAME = "meetara-qwen3.5-0.8b-q4_k_m.gguf"
VISION_GGUF_URL = "https://huggingface.co/meetara-lab/meetara-qwen3.5-0.8b-gguf/resolve/main/meetara-qwen3.5-0.8b-Q4_K_M.gguf"
VISION_MMPROJ_NAME = "meetara-vl-qwen3.5-0.8b.gguf"
VISION_MMPROJ_URL = "https://huggingface.co/meetara-lab/meetara-qwen3.5-0.8b-gguf/resolve/main/meetara-vl-qwen3.5-0.8b.gguf"

# Chatterbox Multilingual V3 - quality TTS and zero-shot voice cloning.
CHATTERBOX_REPO = "ResembleAI/chatterbox"
CHATTERBOX_T3_MODEL = "t3_mtl23ls_v3.safetensors"

# Official Diffusers-format ACE-Step 1.5 XL Turbo pipeline. Keeping ACE-Step
# behind Diffusers avoids installing its full UI/training application and its
# incompatible Transformers ceiling in BonzAI's shared inference environment.
ACE_STEP_REPO = "ACE-Step/acestep-v15-xl-turbo-diffusers"

LLAMA_REPOS = {
    "llama-3.2-1b": "meta-llama/Llama-3.2-1B",
    "llama-3.2-3b": "meta-llama/Llama-3.2-3B",
    "llama-3.1-8b": "meta-llama/Llama-3.1-8B",
}

# Fine-tuning target models (Qwen 3.5 / 3.6)
LLM_FINETUNE_MODELS = {
    "qwen3_5_0_8b": "Qwen/Qwen3.5-0.8B",
    "qwen_3_6_27b": "Qwen/Qwen3.6-27B",
}

# Image fine-tuning targets
ZIMAGE_BASE_REPO = "Tongyi-MAI/Z-Image-Turbo"
IMAGE_FINETUNE_MODELS = {
    "z-image-turbo": ZIMAGE_BASE_REPO,
    "sdxl-base-1.0": SDXL_BASE_REPO,
}

EXPECTED_SIZES = {
    # Exact upstream LFS size, not a rounded download/UI estimate.
    "z-image-turbo-q4_k_m.gguf": 5_017_613_376,
    "umt5-xxl-encoder-q3_k_m.gguf": 5_580_000_000,  # ~5.2GB GGUF text encoder
    "ltx-2-19b-distilled-q3_k_s.gguf": 8_667_234_304, #9_283_503_264,  # 9.28GB Q3_K_S distilled
    "minimax_h3_fl2va_pruned-ud-q2_k_xl.gguf": 8_063_029_344,
    "qwen3vl_32b_minimax_h3-q2_k_m.gguf": 13_102_161_024,
    "minimax_h3_video_vae_fp16.safetensors": 5_207_808_496,
    "minimax_h3_audio_vae_fp32.safetensors": 605_254_808,
}

# =============================================================================
# AUDIO UTILITIES
# =============================================================================



def _decode_image_base64(s: str) -> bytes:
    """Tolerant base64 decode for image payloads.

    Handles three real-world inputs that vanilla `base64.b64decode` rejects:
      - data-URL prefixes (`data:image/png;base64,...`) — split on the comma.
      - whitespace / newlines from JSON pretty-printing or transport.
      - missing `=` padding (length not a multiple of 4).

    Without this helper, regenerated companion videos crash with
    `binascii.Error: Incorrect padding` when the renderer round-trips the
    image through a data URL on its way back to /video/quality.
    """
    if not s:
        raise ValueError("empty base64 string")
    s = s.strip()
    # Strip data URL prefix if present.
    if s.startswith("data:") and "," in s:
        s = s.split(",", 1)[1]
    # Drop any embedded whitespace (newlines from pretty-printed JSON, etc).
    s = "".join(s.split())
    # Pad to multiple of 4.
    pad = (-len(s)) % 4
    if pad:
        s += "=" * pad
    return base64.b64decode(s)


def _load_audio_sf(path, target_sr: int = 24000):
    """Load audio using soundfile (no torchcodec dependency)."""
    import soundfile as sf

    audio, sr = sf.read(str(path), dtype='float32')

    # Convert to mono
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Resample if needed
    if sr != target_sr:
        import torchaudio.functional as F
        audio_tensor = torch.from_numpy(audio).unsqueeze(0)
        audio_tensor = F.resample(audio_tensor, orig_freq=sr, new_freq=target_sr)
        audio = audio_tensor.squeeze(0).numpy()

    return audio.astype(np.float32)


def _encode_audio_to_latents(audio_data: bytes, pipe, target_duration: float, device, dtype):
    """
    Encode audio (WAV bytes) to LTX-2 audio latents for conditioning.

    Args:
        audio_data: Raw audio bytes (WAV format)
        pipe: LTX2 pipeline with audio_vae component
        target_duration: Target duration in seconds (should match video duration)
        device: torch device
        dtype: torch dtype

    Returns:
        torch.Tensor: Audio latents ready for conditioning
    """
    import soundfile as sf
    import torchaudio.functional as F

    # LTX-2 audio VAE expects 24kHz audio
    target_sr = 24000

    # Load audio from bytes
    audio_buffer = io.BytesIO(audio_data)
    audio, sr = sf.read(audio_buffer, dtype='float32')

    # Convert to mono if stereo
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Resample to 24kHz if needed
    if sr != target_sr:
        audio_tensor = torch.from_numpy(audio).unsqueeze(0)
        audio_tensor = F.resample(audio_tensor, orig_freq=sr, new_freq=target_sr)
        audio = audio_tensor.squeeze(0).numpy()

    # Calculate target samples based on video duration
    target_samples = int(target_duration * target_sr)

    # Pad or trim audio to match target duration
    if len(audio) < target_samples:
        # Pad with silence
        padding = np.zeros(target_samples - len(audio), dtype=np.float32)
        audio = np.concatenate([audio, padding])
    elif len(audio) > target_samples:
        # Trim to target duration
        audio = audio[:target_samples]

    # Convert to mel spectrogram
    # LTX-2 audio VAE uses specific mel parameters
    n_fft = 1024
    hop_length = 256
    n_mels = 128

    # Use torchaudio for mel spectrogram
    import torchaudio.transforms as T

    audio_tensor = torch.from_numpy(audio).unsqueeze(0)  # (1, samples)

    mel_transform = T.MelSpectrogram(
        sample_rate=target_sr,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        power=1.0,  # Magnitude spectrogram
    )

    mel = mel_transform(audio_tensor)  # (1, n_mels, time)

    # Convert to log scale (similar to what audio VAE expects)
    mel = torch.log(torch.clamp(mel, min=1e-5))

    # Normalize to roughly [-1, 1] range
    mel = (mel + 5) / 5  # Shift and scale (log values typically in [-10, 0] range)
    mel = mel.clamp(-1, 1)

    # Add batch and channel dimensions: (batch, channels, mels, time)
    mel = mel.unsqueeze(0).to(device=device, dtype=dtype)

    logger.info(f"[LTX-2] Audio mel spectrogram shape: {mel.shape}")

    # Check if pipe has audio_vae
    if not hasattr(pipe, 'audio_vae') or pipe.audio_vae is None:
        logger.warning("[LTX-2] Pipeline does not have audio_vae, loading separately...")
        # Load audio VAE separately
        audio_vae = AutoencoderKLLTX2Audio.from_pretrained(
            LTX2_REPO,
            subfolder="audio_vae",
            torch_dtype=dtype,
        ).to(device)
    else:
        audio_vae = pipe.audio_vae

    # Encode to latent space
    with torch.no_grad():
        # The audio VAE expects input of shape (batch, channels, mels, time)
        latent_dist = audio_vae.encode(mel).latent_dist
        audio_latents = latent_dist.sample()

    logger.info(f"[LTX-2] Audio latents shape: {audio_latents.shape}")

    # Add noise for diffusion (audio_latents parameter expects noisy latents)
    # Use a moderate noise level to allow model flexibility while maintaining voice character
    noise = torch.randn_like(audio_latents)
    noise_scale = 0.5  # Moderate noise - allows model to refine while keeping voice character
    noisy_audio_latents = audio_latents * (1 - noise_scale) + noise * noise_scale

    return noisy_audio_latents


# =============================================================================
# FLASK / SOCKET.IO SETUP
# =============================================================================

app = Flask(__name__)
from performance_capture import install_performance_capture
install_performance_capture(app, runtime=lambda: {"torch": str(torch.__version__), "cuda": torch.version.cuda, "hip": torch.version.hip})
from inference_serialization import install_inference_serialization
from inference_memory import release_idle_caches
_run_device_background = install_inference_serialization(app, lambda path: release_idle_caches(globals(), path))
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bonzai-secret-key")
CORS(app, supports_credentials=True, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
    }
})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=False,
    engineio_logger=False,
    ping_interval=25,
    ping_timeout=120,
)

# =============================================================================
# PRIVACY-PIPELINE PROVIDER BLUEPRINT
# =============================================================================
# Mount the /shard/* control plane + UDS data-plane listener when this
# Flask process is running on a provider (BONZAI_NETWORK_MODE=provider).
# In every other mode the import + install is a no-op, so consumer-only
# users carry no extra threads or sockets. The blueprint owns its own
# state — see src/server/shard.py for the full surface.
try:
    import shard as _shard_blueprint
    _shard_path = _shard_blueprint.install(app)
    if _shard_path:
        logger.info("[shard] privacy pipeline ENABLED — worker UDS at %s", _shard_path)
except Exception as _shard_err:
    # Provider mode is opt-in; bridge failures shouldn't block the
    # rest of Flask. Log and continue with no-op behavior.
    logger.warning("[shard] blueprint failed to install: %s", _shard_err)

# =============================================================================
# JWT AUTHENTICATION SYSTEM
# =============================================================================

# Configuration
JWT_SECRET = os.environ.get("BONZAI_JWT_SECRET", secrets.token_hex(32))
HMAC_SECRET = os.environ.get("BONZAI_HMAC_SECRET", secrets.token_hex(32))
ACCESS_TOKEN_EXPIRY = 48 * 60 * 60  # 48 hours
REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60  # 7 days
CHALLENGE_EXPIRY = 300  # 5 minutes

# Level requirements for each feature
LEVEL_REQUIREMENTS = {
    "text": 1,
    "audio": 2,
    "image": 3,
    "vision": 3,  # Vision analysis uses same level as image
    "vision_caption": 3,
    "ocr": 3,  # OCR (GLM-OCR-4bit) for text extraction
    "video": 4,
    "3d": 5,
    "training": 6,
}

def _create_jwt_token(payload: dict, expiry_seconds: int) -> str:
    """Create a simple JWT-like token (base64 encoded JSON + HMAC signature)."""
    payload = {**payload, "exp": int(time.time()) + expiry_seconds, "iat": int(time.time())}
    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip("=")
    signature = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def _verify_jwt_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT-like token."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None

        payload_b64, signature = parts

        # Verify signature
        expected_sig = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        # Decode payload
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_json = base64.urlsafe_b64decode(payload_b64).decode()
        payload = json.loads(payload_json)

        # Check expiry
        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception as e:
        logger.warning(f"[Auth] Token verification failed: {e}")
        return None


def _create_auth_challenge(address: str) -> dict:
    """Create a tamper-proof challenge for wallet to sign."""
    nonce = secrets.token_hex(16)
    payload = {
        "address": address.lower(),
        "nonce": nonce,
        "expires": int(time.time()) + CHALLENGE_EXPIRY,
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    mac = hmac.new(HMAC_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()

    message = f"Sign in to BonzAI\n\nAddress: {address}\nNonce: {nonce}\nExpires: {payload['expires']}"

    return {
        "challenge": payload_b64,
        "mac": mac,
        "message": message,
    }


def _verify_auth_challenge(challenge: str, mac: str, address: str, signature: str) -> bool:
    """Verify the challenge is valid and was issued by this server."""
    # Verify HMAC
    expected_mac = hmac.new(HMAC_SECRET.encode(), challenge.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, expected_mac):
        return False

    # Decode and check
    try:
        payload = json.loads(base64.urlsafe_b64decode(challenge))
    except Exception:
        return False

    if payload.get("expires", 0) < time.time():
        return False

    if payload.get("address") != address.lower():
        return False

    # Signature presence check (65 bytes = 130 hex chars + 0x prefix)
    if not signature or len(signature) < 130:
        return False

    return True


def _get_wallet_level(address: str) -> Tuple[str, int]:
    """
    Get wallet's level based on BONZAI holdings or ETH unlocks.
    For now, return a default level. In production, this would check on-chain.
    """
    # TODO: Implement actual on-chain level checking
    # For now, grant full access (LVL6) to all authenticated users
    return ("LVL6", 6)


def require_auth(min_level: int = 0):
    """
    Decorator to require valid JWT with minimum level.

    Args:
        min_level: Minimum level required (1-6)
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            # Get authorization header
            auth_header = request.headers.get("Authorization", "")

            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing or invalid authorization header"}), 401

            token = auth_header[7:]
            claims = _verify_jwt_token(token)

            if not claims:
                return jsonify({"error": "Invalid or expired token"}), 401

            # Check token type
            if claims.get("type") != "access":
                return jsonify({"error": "Invalid token type"}), 401

            # Check minimum level requirement
            if claims.get("level_value", 0) < min_level:
                return jsonify({
                    "error": "Insufficient level",
                    "required": min_level,
                    "current": claims.get("level_value", 0),
                }), 403

            # Set auth context
            request.auth_user = claims
            return f(*args, **kwargs)
        return decorated
    return decorator


# =============================================================================
# AUTH ENDPOINTS
# =============================================================================

@app.route("/auth/challenge", methods=["POST"])
def auth_challenge():
    """Get a challenge for wallet to sign."""
    data = request.get_json(force=True) or {}
    address = (data.get("address") or "").strip()

    if not address or len(address) != 42 or not address.startswith("0x"):
        return jsonify({"error": "Invalid Ethereum address"}), 400

    challenge_data = _create_auth_challenge(address)
    return jsonify(challenge_data)


@app.route("/auth/verify", methods=["POST"])
def auth_verify():
    """Verify wallet signature and issue JWT tokens."""
    data = request.get_json(force=True) or {}

    address = (data.get("address") or "").strip().lower()
    signature = (data.get("signature") or "").strip()
    challenge = (data.get("challenge") or "").strip()
    mac = (data.get("mac") or "").strip()

    if not all([address, signature, challenge, mac]):
        return jsonify({"error": "Missing required fields"}), 400

    # Verify challenge
    if not _verify_auth_challenge(challenge, mac, address, signature):
        return jsonify({"error": "Invalid challenge or signature"}), 401

    # Get wallet level
    level, level_value = _get_wallet_level(address)

    # Create access token
    access_payload = {
        "sub": address,
        "level": level,
        "level_value": level_value,
        "type": "access",
    }
    access_token = _create_jwt_token(access_payload, ACCESS_TOKEN_EXPIRY)

    # Create refresh token
    refresh_payload = {
        "sub": address,
        "type": "refresh",
    }
    refresh_token = _create_jwt_token(refresh_payload, REFRESH_TOKEN_EXPIRY)

    # Create response with refresh token as HttpOnly cookie
    response = jsonify({
        "access_token": access_token,
        "expires_in": ACCESS_TOKEN_EXPIRY,
        "level": level,
        "level_value": level_value,
    })

    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="Lax",
        max_age=REFRESH_TOKEN_EXPIRY,
        path="/",
    )

    logger.info(f"[Auth] User authenticated: {address} ({level})")
    return response


@app.route("/auth/refresh", methods=["POST"])
def auth_refresh():
    """Refresh access token using refresh token cookie."""
    refresh_token = request.cookies.get("refresh_token")

    if not refresh_token:
        return jsonify({"error": "No refresh token"}), 401

    claims = _verify_jwt_token(refresh_token)
    if not claims or claims.get("type") != "refresh":
        return jsonify({"error": "Invalid refresh token"}), 401

    address = claims["sub"]

    # Re-check level (catches users who sold tokens)
    level, level_value = _get_wallet_level(address)

    # Create new access token
    access_payload = {
        "sub": address,
        "level": level,
        "level_value": level_value,
        "type": "access",
    }
    access_token = _create_jwt_token(access_payload, ACCESS_TOKEN_EXPIRY)

    logger.info(f"[Auth] Token refreshed for: {address}")
    return jsonify({
        "access_token": access_token,
        "expires_in": ACCESS_TOKEN_EXPIRY,
        "level": level,
        "level_value": level_value,
    })


@app.route("/auth/logout", methods=["POST"])
def auth_logout():
    """Clear refresh token cookie."""
    response = jsonify({"ok": True})
    response.delete_cookie("refresh_token", path="/")
    return response


@app.route("/auth/status", methods=["GET"])
def auth_status():
    """Check authentication status."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return jsonify({"authenticated": False})

    token = auth_header[7:]
    claims = _verify_jwt_token(token)

    if not claims:
        return jsonify({"authenticated": False})

    return jsonify({
        "authenticated": True,
        "address": claims.get("sub"),
        "level": claims.get("level"),
        "level_value": claims.get("level_value"),
    })


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

_GGUF_LOCKS: Dict[str, threading.Lock] = {}
_GGUF_LOCKS_GUARD = threading.Lock()


def _gguf_lock(name: str) -> threading.Lock:
    with _GGUF_LOCKS_GUARD:
        if name not in _GGUF_LOCKS:
            _GGUF_LOCKS[name] = threading.Lock()
        return _GGUF_LOCKS[name]


def _json_sanitize(obj):
    """Recursively sanitize objects for JSON serialization."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {str(k): _json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_json_sanitize(v) for v in obj]
    if hasattr(obj, "__dict__"):
        return _json_sanitize(vars(obj))
    return str(obj)


def socket_emit(event: str, payload: dict, namespace: str):
    """Emit a socket event with JSON sanitization."""
    socketio.emit(event, _json_sanitize(payload), namespace=namespace)
    try:
        socketio.sleep(0)
    except Exception:
        pass


def _write_json_file(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_json_sanitize(payload), f, indent=2, ensure_ascii=False)


def _read_json_file(path: Path, default=None):
    try:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        logger.warning("Failed to read JSON file: %s", path, exc_info=True)
    return {} if default is None else default


def _provenance_list(value, limit=500):
    if not isinstance(value, list):
        return []
    return value[:limit]


def _load_dataset_provenance(dataset_dir: Path, request_data: Optional[dict] = None) -> dict:
    request_data = request_data or {}
    request_provenance = request_data.get("training_provenance") or request_data.get("provenance")
    if isinstance(request_provenance, dict) and request_provenance:
        return request_provenance

    dataset_meta = _read_json_file(dataset_dir / "metadata.json", {})
    meta_provenance = dataset_meta.get("provenance")
    if isinstance(meta_provenance, dict) and meta_provenance:
        return meta_provenance

    sidecar = _read_json_file(dataset_dir / "bonzai_training_provenance.json", {})
    return sidecar if isinstance(sidecar, dict) else {}


def _compact_origin(origin: dict, index: int) -> str:
    parts = []
    title = origin.get("pageTitle") or origin.get("sourceUrl") or f"record {index + 1}"
    parts.append(str(title)[:120])
    if origin.get("sourceUrl"):
        parts.append(str(origin["sourceUrl"])[:160])
    owner = origin.get("dataOwnerWallet") or origin.get("creatorWallet")
    if owner:
        parts.append(f"owner {owner}")
    if origin.get("license"):
        parts.append(f"license {origin['license']}")
    if origin.get("tags"):
        parts.append("tags " + ", ".join(map(str, origin["tags"][:8])))
    if origin.get("textPreview"):
        parts.append("preview " + str(origin["textPreview"]).replace("\n", " ")[:180])
    return " | ".join(parts)


def _llm_provenance_training_text(provenance: dict) -> str:
    """A bounded training note so LLM adapters learn how to disclose lineage."""
    if not provenance:
        return ""
    dataset = provenance.get("dataset") or {}
    attribution = provenance.get("attribution") or {}
    origins = _provenance_list(provenance.get("origins"), 40)
    owners = _provenance_list(dataset.get("dataOwnerWallets"), 80)
    contribution_ids = _provenance_list(dataset.get("contributionIds"), 80)
    lines = [
        "BonzAI model provenance disclosure:",
        f"- Dataset name: {dataset.get('name') or 'unknown'}",
        f"- Dataset type: {dataset.get('type') or 'unknown'}",
        f"- Training records: {dataset.get('recordCount') or len(origins)}",
        f"- Data-owner wallets: {', '.join(map(str, owners)) if owners else 'not provided'}",
        f"- Contribution ids: {', '.join(map(str, contribution_ids)) if contribution_ids else 'not provided'}",
        "- If asked what data this model was trained on, answer from this provenance. Do not invent missing origins.",
        "- Complete provenance is stored beside the adapter as bonzai_model_provenance.json.",
    ]
    revenue_plan = attribution.get("revenuePlan") or {}
    if revenue_plan.get("participants"):
        lines.append("- Downstream revenue is allocated by proof-of-contribution to data owners.")
    for idx, origin in enumerate(origins):
        if isinstance(origin, dict):
            lines.append(f"- Origin {idx + 1}: {_compact_origin(origin, idx)}")
    return "\n".join(lines)


def _model_provenance_manifest(
    training_id: str,
    train_meta: dict,
    dataset_meta: dict,
    dataset_provenance: dict,
    training_config: dict,
) -> dict:
    dataset = dataset_provenance.get("dataset") if isinstance(dataset_provenance, dict) else {}
    attribution = dataset_provenance.get("attribution") if isinstance(dataset_provenance, dict) else {}
    origins = dataset_provenance.get("origins") if isinstance(dataset_provenance, dict) else []
    owners = dataset.get("dataOwnerWallets") or []
    contribution_ids = dataset.get("contributionIds") or []

    return {
        "schema": "bonzai-model-provenance-manifest",
        "version": 1,
        "createdAt": train_meta.get("created_at") or datetime.now().isoformat(),
        "model": {
            "id": training_id,
            "type": train_meta.get("type"),
            "baseModel": train_meta.get("base_model"),
            "adapterType": "lora" if "lora" in str(train_meta.get("type", "")) else train_meta.get("type"),
            "localPathHint": str(MODEL_DIR / "trained" / training_id),
        },
        "dataset": {
            "id": train_meta.get("dataset_id"),
            "name": dataset_meta.get("name") or dataset.get("name"),
            "type": dataset_meta.get("type") or dataset.get("type"),
            "recordCount": dataset.get("recordCount"),
            "fileCount": dataset_meta.get("num_files"),
            "files": dataset_meta.get("files", []),
            "source": dataset.get("source"),
            "sourcePackId": dataset.get("sourcePackId"),
            "sourcePackFileName": dataset.get("sourcePackFileName"),
            "contributionIds": _provenance_list(contribution_ids),
            "contributionHashes": _provenance_list(dataset.get("contributionHashes")),
            "dataOwnerWallets": _provenance_list(owners),
        },
        "attribution": attribution or {
            "trainerWallet": None,
            "dataOwnerWallets": _provenance_list(owners),
        },
        "training": {
            "config": _json_sanitize(training_config),
            "embeddedDisclosure": train_meta.get("type") == "llm_lora",
            "disclosureNote": (
                "LLM adapters receive a compact provenance training note. "
                "Non-LLM adapters carry full provenance as model sidecar metadata."
            ),
        },
        "origins": _provenance_list(origins, 1000),
        "modelDisclosure": {
            "humanSummary": (
                f"This BonzAI model was trained from {dataset.get('recordCount') or len(origins) or 'unknown'} "
                f"records linked to {len(owners)} data owner wallet{'' if len(owners) == 1 else 's'}."
            ),
            "promptHint": (
                "When asked what data this model was trained on, use bonzai_model_provenance.json "
                "and disclose known sources, owners, licenses, and contribution routes. Never invent missing origins."
            ),
        },
    }


def _provenance_markdown(manifest: dict) -> str:
    dataset = manifest.get("dataset") or {}
    model = manifest.get("model") or {}
    attribution = manifest.get("attribution") or {}
    origins = _provenance_list(manifest.get("origins"), 50)
    owners = dataset.get("dataOwnerWallets") or []
    lines = [
        "# BonzAI Model Provenance",
        "",
        f"- Model: `{model.get('id')}`",
        f"- Type: `{model.get('type')}`",
        f"- Base model: `{model.get('baseModel')}`",
        f"- Dataset: `{dataset.get('name') or dataset.get('id')}`",
        f"- Dataset type: `{dataset.get('type')}`",
        f"- Records: `{dataset.get('recordCount') or len(manifest.get('origins') or [])}`",
        f"- Data owners: `{len(owners)}`",
        f"- Trainer wallet: `{attribution.get('trainerWallet') or 'not provided'}`",
        "",
        "This file is generated by BonzAI so trained adapters can carry dataset origin, attribution, and collective ownership metadata with them.",
        "",
        "## Origins",
    ]
    if not origins:
        lines.append("No record-level origins were provided.")
    for idx, origin in enumerate(origins):
        if isinstance(origin, dict):
            lines.append(f"{idx + 1}. {_compact_origin(origin, idx)}")
    return "\n".join(lines) + "\n"


def _write_model_provenance(output_dir: Path, manifest: dict):
    _write_json_file(output_dir / "bonzai_model_provenance.json", manifest)
    with open(output_dir / "PROVENANCE.md", "w", encoding="utf-8") as f:
        f.write(_provenance_markdown(manifest))
    for child_name in ("lora", "tokenizer"):
        child = output_dir / child_name
        if child.exists():
            _write_json_file(child / "bonzai_model_provenance.json", manifest)
            with open(child / "PROVENANCE.md", "w", encoding="utf-8") as f:
                f.write(_provenance_markdown(manifest))


def _hf_token() -> Optional[str]:
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")


def repo_local_dir(repo_id: str) -> Path:
    return MODEL_DIR / "repos" / repo_id.replace("/", "__")


def generation_url() -> str:
    try:
        scheme = "wss" if (request.is_secure or request.headers.get("X-Forwarded-Proto", "").lower() == "https") else "ws"
        return f"{scheme}://{request.host}/generation"
    except Exception:
        return "/generation"


# =============================================================================
# DEVICE MANAGEMENT
# =============================================================================

def _is_rocm_runtime() -> bool:
    """PyTorch on ROCm exposes the same `torch.cuda.*` API but reports a
    HIP version via `torch.version.hip`. Using that as the discriminator
    avoids spawning a hipinfo subprocess at import time."""
    return bool(torch.cuda.is_available() and getattr(torch.version, "hip", None))


class DeviceManager:
    @staticmethod
    def get_device() -> torch.device:
        # MPS first — Apple Silicon never has CUDA/HIP; this short-
        # circuits cleanly. Then CUDA (which transparently covers ROCm
        # via HIP-on-CUDA-API; the device string stays "cuda" even on
        # AMD). CPU as the universal fallback.
        if torch.backends.mps.is_available():
            return torch.device("mps")
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    @staticmethod
    def is_rocm() -> bool:
        return _is_rocm_runtime()

    @staticmethod
    def get_dtype(device: Optional[torch.device] = None) -> torch.dtype:
        device = device or DeviceManager.get_device()
        if device.type == "mps":
            # MPS reliably handles fp16; bf16 is supported on M2+ but
            # we keep fp16 for backwards compat with M1.
            return torch.float16
        if device.type == "cuda":
            # ROCm: RDNA2/3 prefer bfloat16 (handles wider exponent
            # range without overflow surprises in attention). CUDA
            # standardizes on float16 for inference.
            if _is_rocm_runtime():
                return torch.bfloat16
            return torch.float16
        return torch.bfloat16

    @staticmethod
    def free_memory():
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        if torch.cuda.is_available():
            # Same call works for both CUDA and HIP — PyTorch routes it
            # to hipDeviceSynchronize / hipFree internally on ROCm.
            torch.cuda.empty_cache()


def _mps_clear_memory():
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
        torch.mps.synchronize()


def _mps_delete_model(model, name="model"):
    if model:
        model.to("cpu")
    del model
    _mps_clear_memory()


# =============================================================================
# GENERATION TRACKER (Progress Reporting)
# =============================================================================

class GenerationTracker:
    """Unified progress tracking for all generation pipelines."""
    
    def __init__(self):
        self._meta: Dict[str, Dict[str, Any]] = {}
        self._started = {}
        self._lock = threading.RLock()

    def new(self, kind: str, meta: Optional[Dict[str, Any]] = None, gen_id: Optional[str] = None) -> str:
        gid = gen_id or hashlib.md5(f"{kind}_{time.time()}".encode()).hexdigest()[:16]
        with self._lock:
            self._started[gid] = time.perf_counter()
            self._meta[gid] = {"generation_id": gid, "kind": kind, "ts": time.time(), "stage": "starting", "status": "running"}
        socket_emit("gen_started", {"generation_id": gid, "kind": kind, "meta": meta or {}}, "/generation")
        socket_emit("gen_progress", {"generation_id": gid, "stage": "queued", "step": 0, "total": 1, "pct": 0}, "/generation")
        return gid

    def progress(self, generation_id: str, stage: str, step: int, total: int):
        """Report progress. Ensures step <= total and calculates percentage.
        Preserves the actual pipeline stage for application-wide activity reporting."""
        step = min(step, total)
        pct = round((step / max(total, 1)) * 100.0, 2)
        display_stage = stage
        with self._lock:
            if generation_id in self._meta:
                self._meta[generation_id].update(stage=stage, step=int(step), total=int(total), pct=pct)
        socket_emit("gen_progress", {
            "generation_id": generation_id,
            "stage": display_stage,
            "step": int(step),
            "total": int(total),
            "pct": pct
        }, "/generation")

    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        elapsed_ms = self._end(generation_id, "completed")
        socket_emit("gen_finished", {"generation_id": generation_id, "elapsed_ms": elapsed_ms,
                    "payload": {**(payload or {}), "elapsed_ms": elapsed_ms}}, "/generation")

    def error(self, generation_id: str, message: str):
        elapsed_ms = self._end(generation_id, "failed", message)
        socket_emit("gen_error", {"generation_id": generation_id, "error": message, "elapsed_ms": elapsed_ms}, "/generation")

    def _end(self, generation_id, status, error=None):
        with self._lock:
            started = self._started.pop(generation_id, None)
            elapsed_ms = round((time.perf_counter() - started) * 1000) if started is not None else None
            if generation_id in self._meta:
                self._meta[generation_id].update(status=status, error=error, finished_at=time.time(), elapsed_ms=elapsed_ms)
            ended = [gid for gid, job in self._meta.items() if job.get("finished_at")]
            for gid in ended[:-30]:
                self._meta.pop(gid, None)
            return elapsed_ms

    def snapshot(self):
        # Operational metadata only; prompts and generated content stay private.
        with self._lock:
            return {"operations": [dict(job) for job in self._meta.values()]}


genbus = GenerationTracker()


# =============================================================================
# WEBSOCKET NAMESPACES
# =============================================================================

@socketio.on("connect", namespace="/downloads")
def dl_connect():
    emit("connected", _json_sanitize({"message": "Connected to download progress stream"}))


@socketio.on("subscribe", namespace="/downloads")
def dl_subscribe(data):
    data = data or {}
    pipeline_id = data.get("pipeline_id") or data.get("pipelineId")
    if not pipeline_id:
        emit("download_progress", _json_sanitize({"pipeline": None}))
        return
    join_room(pipeline_id)
    pl = download_manager.pipelines.get(pipeline_id)
    emit("download_progress", _json_sanitize({"pipeline": pl.to_dict() if pl else None}))


@socketio.on("disconnect", namespace="/downloads")
def dl_disconnect():
    pass


@socketio.on("connect", namespace="/generation")
def gen_connect():
    emit("connected", _json_sanitize({"message": "Connected to generation progress"}))
    emit("gen_snapshot", genbus.snapshot())


@socketio.on("activity_snapshot", namespace="/generation")
def activity_snapshot():
    emit("gen_snapshot", genbus.snapshot())


@socketio.on("disconnect", namespace="/generation")
def gen_disconnect():
    pass


@socketio.on("connect", namespace="/training")
def training_connect():
    emit("connected", _json_sanitize({"message": "Connected to training progress stream"}))


@socketio.on("disconnect", namespace="/training")
def training_disconnect():
    pass

# =============================================================================
# DOWNLOAD MANAGER
# =============================================================================

@dataclass
class DownloadTask:
    task_id: str
    kind: str
    name: str
    status: str = "pending"
    progress: float = 0.0
    total_bytes: int = 0
    done_bytes: int = 0
    error_message: Optional[str] = None

    def to_dict(self):
        return {
            "task_id": self.task_id, "kind": self.kind, "filename": self.name,
            "status": self.status, "progress": round(self.progress, 2),
            "total_size": int(self.total_bytes), "downloaded_size": int(self.done_bytes),
            "error_message": self.error_message
        }


@dataclass
class PipelineDownload:
    pipeline_id: str
    pipeline_name: str
    tasks: Dict[str, DownloadTask] = field(default_factory=dict)
    status: str = "pending"
    attempts: int = 0
    cancelled: bool = False

    @property
    def total_progress(self) -> float:
        if not self.tasks:
            return 0.0
        weights = []
        for t in self.tasks.values():
            w = t.total_bytes if t.total_bytes > 0 else 1
            weights.append((t.progress, w))
        done = sum(p * w for p, w in weights)
        denom = sum(w for _, w in weights) or 1
        return done / denom

    def to_dict(self):
        return {
            "pipeline_id": self.pipeline_id, "pipeline_name": self.pipeline_name,
            "status": self.status, "attempts": self.attempts,
            "total_progress": round(self.total_progress, 2),
            "tasks": {tid: t.to_dict() for tid, t in self.tasks.items()}
        }


class CancelledDownload(Exception):
    pass


class DownloadManager:
    def __init__(self):
        self.pipelines: Dict[str, PipelineDownload] = {}
        self._lock = threading.Lock()

    def emit(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if pl:
            data = pl.to_dict()
            logger.debug(f"[Download] Emitting status={data.get('status')} progress={data.get('total_progress')} for {pipeline_id}")
            socketio.emit("download_progress", _json_sanitize({"pipeline": data}),
                          namespace="/downloads", room=pipeline_id)
            socketio.sleep(0)

    def new_or_active(self, name: str) -> tuple[PipelineDownload, bool]:
        with self._lock:
            matches = [
                pl for pl in self.pipelines.values()
                if pl.pipeline_name == name and pl.status in ("pending", "downloading")
            ]
            if matches:
                return matches[-1], False
            pid = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
            pl = PipelineDownload(pipeline_id=pid, pipeline_name=name)
            self.pipelines[pid] = pl
            return pl, True

    def add_repo_task(self, pl: PipelineDownload, repo_id: str, total_estimate: int = 0) -> str:
        tid = _tid_repo(repo_id)
        t = pl.tasks.get(tid)
        if t:
            if total_estimate and total_estimate > t.total_bytes:
                t.total_bytes = int(total_estimate)
            return tid
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="repo", name=repo_id, total_bytes=int(total_estimate))
        return tid

    def add_file_task(self, pl: PipelineDownload, filename: str, size: int) -> str:
        tid = hashlib.md5(f"{filename}_{time.time()}".encode()).hexdigest()[:16]
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="file", name=filename, total_bytes=int(size))
        return tid

    def set_status(self, pl: PipelineDownload, status: str):
        pl.status = status
        self.emit(pl.pipeline_id)

    def mark_downloading(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "downloading"
        self.emit(pl.pipeline_id)

    def update_progress(self, pl: PipelineDownload, tid: str, done: int, total: Optional[int] = None):
        t = pl.tasks.get(tid)
        if not t:
            return
        if total is not None and total > 0:
            t.total_bytes = int(total)
        t.done_bytes = max(int(done), 0)
        if t.total_bytes > 0:
            t.progress = min(100.0, 100.0 * t.done_bytes / t.total_bytes)
        self.emit(pl.pipeline_id)

    def mark_completed(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "completed"
        t.progress = 100.0
        t.done_bytes = max(t.done_bytes, t.total_bytes)
        if t.kind == "repo":
            cache = globals().get("_readiness_cache")
            if isinstance(cache, dict):
                cache.pop(t.name, None)
        self.emit(pl.pipeline_id)

    def mark_failed(self, pl: PipelineDownload, tid: str, msg: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "failed"
        t.error_message = msg
        logger.error("[Download] Pipeline %s task %s failed: %s", pl.pipeline_id, t.name, msg)
        self.emit(pl.pipeline_id)

    def mark_cancelled(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "cancelled"
        self.emit(pl.pipeline_id)

    def finalize_if_done(self, pl: PipelineDownload):
        if not pl.tasks:
            logger.info(f"[Download] Finalizing {pl.pipeline_id}: no tasks, marking completed")
            pl.status = "completed"
            self.emit(pl.pipeline_id)
            return
        states = {t.status for t in pl.tasks.values()}
        task_details = {t.name: (t.status, t.progress) for t in pl.tasks.values()}
        logger.info(f"[Download] Finalizing {pl.pipeline_id}: states={states}, tasks={task_details}")
        if states <= {"completed"}:
            pl.status = "completed"
            logger.info(f"[Download] Pipeline {pl.pipeline_id} -> COMPLETED")
        elif "failed" in states and not any(s in states for s in ("pending", "downloading")):
            pl.status = "failed"
            logger.info(f"[Download] Pipeline {pl.pipeline_id} -> FAILED")
        elif "cancelled" in states and not any(s in states for s in ("pending", "downloading")):
            pl.status = "cancelled"
            logger.info(f"[Download] Pipeline {pl.pipeline_id} -> CANCELLED")
        else:
            pl.status = "downloading"
            logger.warning(f"[Download] Pipeline {pl.pipeline_id} still DOWNLOADING despite finalize_if_done call")
        self.emit(pl.pipeline_id)

    def cancel_pipeline(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if not pl:
            return None
        pl.cancelled = True
        pl.status = "cancelled"
        for t in pl.tasks.values():
            if t.status in ("pending", "downloading"):
                t.status = "cancelled"
        self.emit(pl.pipeline_id)
        return pl


download_manager = DownloadManager()


def _tid_repo(repo_id: str) -> str:
    return f"repo::{hashlib.md5(repo_id.encode('utf-8')).hexdigest()[:12]}"


# =============================================================================
# REPO PATTERNS & SPECS
# =============================================================================

def _sdxl_patterns() -> List[str]:
    return [
        "model_index.json", "scheduler/**", "tokenizer/**", "tokenizer_2/**",
        "text_encoder/**", "text_encoder_2/**", "unet/**", "vae/**",
        "**/*.json", "**/*.safetensors", "**/*.bin"
    ]


def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id in (SDXL_BASE_REPO, SDXL_REFINER_REPO):
        return _sdxl_patterns()
    if repo_id == FLUX_KLEIN_9B_REPO:
        return ["model_index.json", "scheduler/**", "tokenizer/**", "text_encoder/**",
                "vae/**", "transformer/config.json"]
    if repo_id == Z_REPO:
        return ["model_index.json", "scheduler/**", "tokenizer/**", "text_encoder/**",
                "transformer/config.json", "vae/**"]
    if repo_id == LTX2_REPO:
        # Only download subfolders needed for quanto quantization
        # Skip root safetensors files (43GB+)
        return [
            "model_index.json",
            "tokenizer/**",
            "transformer/**",
            "scheduler/**",
            "connectors/**",
            "vocoder/**",
            "vae/**",
            "audio_vae/**",
        ]
    if repo_id == CHATTERBOX_REPO:
        # The upstream repository also contains legacy V2 and duplicate `.pt`
        # checkpoints. Download only the V3 runtime set used by BonzAI.
        return [
            "ve.pt",
            "s3gen.pt",
            "conds.pt",
            "grapheme_mtl_merged_expanded_v1.json",
            "Cangjie5_TC.json",
            CHATTERBOX_T3_MODEL,
        ]
    if repo_id == ACE_STEP_REPO:
        return [
            "model_index.json",
            "silence_latent.pt",
            "tokenizer/**",
            "scheduler/**",
            "text_encoder/**",
            "condition_encoder/**",
            "transformer/**",
            "vae/**",
        ]
    if repo_id == MINIMAX_H3_REPO:
        # Do not fetch the official transformer, text-encoder, or VAE weights.
        # The matching Q2_K_XL/Q2_K_M GGUFs and compact VAEs come from
        # unsloth/MiniMax-H3-GGUF. These are only the canonical runtime
        # configs, tokenizers, and schedulers used by Diffusers.
        return [
            "modular_model_index.json",
            "tokenizer/**",
            "processor/**",
            "text_encoder/config.json",
            "scheduler/**",
            "audio_scheduler/**",
            "vae/config.json",
            "audio_vae/config.json",
        ]
    return None


REPO_SPECS = {
    FLUX_KLEIN_9B_REPO: {
        "must_files": ["model_index.json", "transformer/config.json", "vae/config.json",
                       "text_encoder/config.json", "scheduler/scheduler_config.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["vae", "text_encoder"],
    },
    "stabilityai/stable-diffusion-xl-base-1.0": {
        "must_files": ["model_index.json"],
        "must_weight_dirs": ["unet", "vae", "text_encoder", "text_encoder_2"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "extra_dirs": ["text_encoder", "text_encoder_2", "scheduler"],
    },
    "stabilityai/stable-diffusion-xl-refiner-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer_2"],
        "must_weight_dirs": ["unet", "vae", "text_encoder_2"],
        "extra_dirs": ["scheduler"],
    },
    "black-forest-labs/FLUX.2-klein-4b": {
        "must_files": ["model_index.json", "transformer/config.json", "vae/config.json",
                       "text_encoder/config.json", "scheduler/scheduler_config.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "text_encoder"],
    },
    "black-forest-labs/FLUX.2-klein-4b-fp8": {
        "must_files": [],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "fallback_any_weights": True,
    },
    "Tongyi-MAI/Z-Image-Turbo": {
        "must_files": ["model_index.json", "transformer/config.json", "vae/config.json",
                       "text_encoder/config.json", "scheduler/scheduler_config.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["vae", "text_encoder"],
        "extra_dirs": ["scheduler"],
    },
    # LTX-2: Only download subfolders needed for quanto quantization
    # Skip root safetensors files (43GB+)
    "Lightricks/LTX-2": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "audio_vae"],
        "extra_dirs": ["scheduler", "connectors", "vocoder"],
    },
    "MiniMaxAI/MiniMax-H3": {
        "must_files": [
            "modular_model_index.json",
            "text_encoder/config.json",
            "vae/config.json",
            "audio_vae/config.json",
            "scheduler/scheduler_config.json",
            "audio_scheduler/scheduler_config.json",
        ],
        "must_tokenizers": ["tokenizer", "processor"],
        "must_weight_dirs": [],
        "extra_dirs": [],
    },
    # Qwen3-VL 2B: Transformers vision-language model
    "Qwen/Qwen3-VL-2B-Instruct": {
        "must_files": ["config.json"],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": [],
        "fallback_any_weights": True,
    },
    # Chatterbox Multilingual V3 quality TTS and voice cloning.
    "ResembleAI/chatterbox": {
        "must_files": [
            "ve.pt",
            "s3gen.pt",
            "conds.pt",
            "grapheme_mtl_merged_expanded_v1.json",
            "Cangjie5_TC.json",
            "t3_mtl23ls_v3.safetensors",
        ],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": [],
    },
    # Official all-in-one Diffusers checkpoint for ACE-Step v1.5 XL Turbo.
    "ACE-Step/acestep-v15-xl-turbo-diffusers": {
        "must_files": ["model_index.json", "silence_latent.pt"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "text_encoder", "condition_encoder"],
        "extra_dirs": ["scheduler"],
    },
    # Google TimesFM 2.0 (500M): ships as torch_model.ckpt (not safetensors).
    # The default fallback_any_weights check misses .ckpt files, so we
    # explicitly require the checkpoint and config here.
    "google/timesfm-2.0-500m-pytorch": {
        "must_files": ["torch_model.ckpt"],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": [],
    },
}

DEFAULT_SPEC = {"must_files": ["model_index.json"], "must_weight_dirs": [], "must_tokenizers": [], "fallback_any_weights": True}


# =============================================================================
# INTEGRITY HELPERS
# =============================================================================

def _is_valid_safetensors(p: Path) -> bool:
    if _safetensors_open is None:
        try:
            return p.exists() and p.stat().st_size > 0
        except Exception:
            return False
    try:
        with _safetensors_open(str(p), framework="pt") as f:
            _ = f.keys()
        return True
    except Exception:
        return False


def _is_valid_gguf(p: Path) -> bool:
    try:
        with p.open("rb") as handle:
            return handle.read(4) == b"GGUF"
    except Exception:
        return False


def _nonzero(p: Path) -> bool:
    try:
        return p.exists() and p.stat().st_size > 0
    except Exception:
        return False


def _tokenizer_ok(root: Path, name: str = "tokenizer") -> bool:
    if _nonzero(root / f"{name}.json") or _nonzero(root / name / "tokenizer.json"):
        return True
    if (_nonzero(root / name / "vocab.json") and _nonzero(root / name / "merges.txt")):
        return True
    tokdir = root / name
    for fn in ("spiece.model", "sentencepiece.bpe.model", "tokenizer.model", "vocab.txt"):
        if _nonzero(tokdir / fn):
            return True
    return False


def _has_any_weights(path: Path) -> bool:
    if not path.exists():
        return False
    # A single surviving shard is not a complete model. Validate every shard
    # referenced by the loader's index before accepting this component.
    indexes = list(path.rglob("*.index.json"))
    if indexes:
        try:
            for index in indexes:
                shards = set(json.loads(index.read_text())["weight_map"].values())
                if not shards:
                    return False
                for name in shards:
                    shard = index.parent / name
                    if not shard.resolve().is_relative_to(path.resolve()):
                        return False
                    if not _nonzero(shard) or (shard.suffix == ".safetensors" and not _is_valid_safetensors(shard)):
                        return False
        except (OSError, ValueError, KeyError, TypeError):
            return False
        return True
    for x in path.rglob("*.safetensors"):
        if _is_valid_safetensors(x):
            return True
    for pat in ["pytorch_model.bin", "diffusion_pytorch_model.bin"]:
        for x in path.rglob(pat):
            if _nonzero(x):
                return True
    return False


def _repo_completeness(repo_id: str) -> Dict[str, Any]:
    root = repo_local_dir(repo_id)
    report = {"repo": repo_id, "root": str(root), "exists": root.exists(), "ok": False, "missing": []}
    if not root.exists():
        # Some models are downloaded via `huggingface_hub.hf_hub_download` /
        # `snapshot_download` which default to `~/.cache/huggingface/hub`.
        # Fall back to the HF cache so a pre-existing install isn't reported
        # as missing. We check for a conventional marker file per repo and
        # trust the presence of that marker as "ready".
        fallback_marker = {
            "google/timesfm-2.0-500m-pytorch": "torch_model.ckpt",
        }.get(repo_id)
        if fallback_marker:
            try:
                from huggingface_hub import try_to_load_from_cache
                cached = try_to_load_from_cache(repo_id, filename=fallback_marker)
                if cached:
                    return {"repo": repo_id, "root": str(cached), "exists": True, "ok": True, "missing": []}
            except Exception:
                pass
        report["missing"].append("<entire repo>")
        return report
    # Treat empty directories as non-existent (likely failed/interrupted download)
    has_real_files = any(f.is_file() and f.stat().st_size > 0 for f in root.rglob("*"))
    if not has_real_files:
        report["exists"] = False
        report["missing"].append("<entire repo> (empty directory)")
        return report
    spec = REPO_SPECS.get(repo_id, DEFAULT_SPEC)
    for f in spec.get("must_files", []):
        required_path = root / f
        if not _nonzero(required_path):
            report["missing"].append(f)
        elif required_path.suffix == ".safetensors" and not _is_valid_safetensors(required_path):
            report["missing"].append(f"{f} (invalid weights)")
        elif required_path.suffix == ".gguf" and not _is_valid_gguf(required_path):
            report["missing"].append(f"{f} (invalid GGUF)")
    for tok in spec.get("must_tokenizers", []):
        if not _tokenizer_ok(root, tok):
            report["missing"].append(f"{tok} (tokenizer files)")
    for d in spec.get("must_weight_dirs", []):
        if not _has_any_weights(root / d):
            report["missing"].append(f"{d}/*(weights)")
    for d in spec.get("extra_dirs", []):
        dp = root / d
        if not dp.exists() or not any(x.is_file() and _nonzero(x) for x in dp.rglob("*")):
            report["missing"].append(f"{d}/")
    # Check for ONNX files (if specified in model spec)
    for onnx_file in spec.get("onnx_files", []):
        # ONNX files are typically in the onnx subdirectory
        onnx_path = root / "onnx" / onnx_file
        if not _nonzero(onnx_path):
            report["missing"].append(f"onnx/{onnx_file}")
    # Fallback: if no must_weight_dirs specified, check for any weights in root
    if spec.get("fallback_any_weights") and not spec.get("must_weight_dirs"):
        has_weights = _has_any_weights(root)
        if not has_weights:
            report["missing"].append("*.safetensors or *.bin (model weights)")
    report["ok"] = len(report["missing"]) == 0
    return report


def _repo_readiness(repo_id: str) -> Dict[str, Any]:
    try:
        return _repo_completeness(repo_id)
    except Exception as e:
        return {"repo": repo_id, "ok": False, "missing": [f"error: {str(e)}"]}


_readiness_cache: Dict[str, tuple] = {}
_READINESS_TTL = 30  # seconds


def _cached_repo_readiness(repo_id: str) -> Dict[str, Any]:
    """TTL-cached wrapper around _repo_readiness to avoid repeated filesystem checks."""
    now = time.time()
    if repo_id in _readiness_cache:
        result, ts = _readiness_cache[repo_id]
        if (now - ts) < _READINESS_TTL:
            return result
    result = _repo_readiness(repo_id)
    _readiness_cache[repo_id] = (result, now)
    return result


def _is_pipeline_complete(pipeline: str) -> bool:
    """Check if all repos for a pipeline are fully downloaded."""
    try:
        plan = _plan_for(pipeline)
        repos = plan.get("repos_to_fetch", [])
        for repo_id in repos:
            report = _repo_completeness(repo_id)
            if not report.get("ok", False):
                return False
        # Also check single files
        for sf in plan.get("single_files", []):
            if sf.get("name") and not _single_file_status(sf).get("ok", False):
                return False
        return True
    except Exception:
        return False


from contextlib import contextmanager

@contextmanager
def offline_mode_if_complete(pipeline: str):
    """
    Context manager that enables offline mode if the pipeline is fully downloaded.

    Usage:
        with offline_mode_if_complete("video_fast"):
            pipe = Pipeline.from_pretrained(...)

    - If complete: blocks ALL HTTP requests (HF_HUB_OFFLINE=1, TRANSFORMERS_OFFLINE=1)
    - If incomplete: allows HTTP for downloading missing files
    """
    is_complete = _is_pipeline_complete(pipeline)
    old_hf_offline = os.environ.get("HF_HUB_OFFLINE")
    old_transformers_offline = os.environ.get("TRANSFORMERS_OFFLINE")

    if is_complete:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        logger.info(f"[{pipeline}] Running in offline mode (all files present)")
    else:
        logger.info(f"[{pipeline}] Running in online mode (downloading may occur)")

    try:
        yield is_complete
    finally:
        # Restore original environment
        if old_hf_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = old_hf_offline
        if old_transformers_offline is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = old_transformers_offline


# =============================================================================
# PLAN CACHE & DEFINITIONS
# =============================================================================

_plan_cache: Dict[str, Dict[str, Any]] = {}


def _cached_plan_for(pipeline: str) -> Dict[str, Any]:
    # Local H3 overrides can appear/disappear without restarting the server.
    if pipeline.strip().lower() in ("video_sota", "minimax_h3"):
        return _plan_for(pipeline)
    if pipeline in _plan_cache:
        return _plan_cache[pipeline]
    plan = _plan_for(pipeline)
    _plan_cache[pipeline] = plan
    return plan


def _expected_size(name: str, url: Optional[str] = None) -> int:
    # Normalize name for consistent lookups
    normalized_name = normalize_model_filename(name)
    known_size = int(EXPECTED_SIZES.get(normalized_name, 0) or 0)
    if known_size > 0:
        return known_size
    if url:
        headers = {"User-Agent": "BonzAI-Model-Download/4.0"}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        try:
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
            r.raise_for_status()
            size = int(r.headers.get("content-length", "0") or "0")
            if size > 0:
                EXPECTED_SIZES[normalized_name] = size
                return size
        except Exception:
            pass
    return 0


def _sf(name, url):
    from r2_models import MODEL_FILES, model_file
    normalized_name = normalize_model_filename(name)
    if normalized_name in MODEL_FILES:
        return model_file(normalized_name)
    return {"name": normalized_name, "url": url, "size": _expected_size(normalized_name, url)}


def _plan_for(pipeline: str) -> Dict[str, Any]:
    """
    Pipeline naming convention:
    - image_standard: SDXL Turbo + refiner
    - image_turbo: FLUX Klein (fast generation, i2i)
    - image_quality: Z-Image-Turbo (high quality)
    - audio_turbo: Kokoro TTS
    - audio_quality: Chatterbox Multilingual V3
    - video_fast: LTX2 GGUF (fast video)
    - vision: Qwen 3 VL (image analysis)
    """
    pipeline = pipeline.strip().lower()

    # Individual mirrors are downloadable without activating an adapter.
    if pipeline.startswith("model:"):
        from r2_models import model_file
        return {"repos_to_fetch": [], "single_files": [model_file(pipeline[6:])]}

    # Image pipelines
    if pipeline in ("flux_klein_9b_gguf", "image_turbo", "flux_klein"):
        return {"repos_to_fetch": [FLUX_KLEIN_9B_REPO],
                "single_files": [_sf(FLUX_KLEIN_9B_GGUF_NAME, FLUX_KLEIN_9B_GGUF_URL),
                                 _sf(FLUX_KLEIN_9B_LORA_NAME, ""),
                                 _sf(FLUX_KLEIN_9B_LORA_EXTRA_NAME, "")]}
    if pipeline in ("image_standard", "sdxl"):
        return {"repos_to_fetch": [SDXL_BASE_REPO, SDXL_REFINER_REPO], "single_files": [_sf(SDXL_LORA_NAME, SDXL_LORA_URL)]}
    if pipeline in ("image_quality", "image_advanced", "z_image_turbo"):
        return {"repos_to_fetch": [Z_REPO], "single_files": [_sf(Z_GGUF_NAME, Z_GGUF_URL)]}

    # Audio pipelines
    # Kokoro TTS auto-downloads via KPipeline - always report as ready
    # "audio" is an alias for audio_turbo (used by skill requirements)
    if pipeline in ("audio", "audio_turbo", "kokoro"):
        return {"repos_to_fetch": [], "single_files": []}
    if pipeline in (
        "audio_quality", "audio_quality_clone", "audio_quality_design", "audio_quality_persona",
        "chatterbox", "chatterbox_clone", "chatterbox_design", "chatterbox_persona",
        # Legacy aliases keep persisted skills/download state working.
        "qwen3_tts_clone", "qwen3_tts_design", "qwen3_tts_persona",
    ):
        return {"repos_to_fetch": [CHATTERBOX_REPO], "single_files": []}
    if pipeline in ("music", "ace_step"):
        return {"repos_to_fetch": [ACE_STEP_REPO], "single_files": []}

    # Video pipelines
    if pipeline in ("video_fast", "ltx2_video_gguf"):
        # LTX-2 (19B DiT) with Q3_K_S GGUF quantization
        # Note: I2V Adapter LoRA is downloaded on-demand by load_lora_weights()
        return {
            "repos_to_fetch": [LTX2_REPO],
            "single_files": [_sf(LTX2_GGUF_NAME, LTX2_GGUF_URL)],
        }
    if pipeline == "ltx2_video":
        # LTX-2 (19B DiT) with quanto int8 quantization (legacy)
        return {
            "repos_to_fetch": [LTX2_REPO],
            "single_files": [],
        }
    if pipeline in ("video_enhance", "video_enhance_seedvr2"):
        from video_enhance import SEEDVR2_FILES
        return {"repos_to_fetch": [], "single_files": [dict(f) for f in SEEDVR2_FILES]}

    if pipeline in ("video_enhance_realesrgan",):
        return {
            "repos_to_fetch": [],
            "single_files": [
                _sf(ESRGAN_X4_NAME, ESRGAN_X4_URL),
                _sf(ESRGAN_X4_ANIME_NAME, ESRGAN_X4_ANIME_URL),
            ],
        }
    if pipeline in ("video_quality", "wan_i2v"):
        from wan_adapters import WAN_ADAPTERS
        # Wan2.2 I2V 14B with pre-merged GGUF transformers. The full
        # WAN_REPO download is still required for VAE, text_encoder,
        # tokenizer, scheduler, image_processor, and config.
        return {
            "repos_to_fetch": [WAN_REPO],
            "single_files": [
                _sf(WAN_GGUF_HIGH, WAN_GGUF_HIGH_URL),
                _sf(WAN_GGUF_LOW, WAN_GGUF_LOW_URL),
                *[_sf(adapter[0], "") for adapter in WAN_ADAPTERS],
            ],
        }
    if pipeline in ("video_sota", "minimax_h3"):
        transformer = (_sf(MINIMAX_H3_HYBRID_NAME, "")
                       if (MODEL_DIR / MINIMAX_H3_HYBRID_NAME).is_file()
                       else _sf(MINIMAX_H3_TRANSFORMER_NAME, MINIMAX_H3_TRANSFORMER_URL))
        return {
            "repos_to_fetch": [MINIMAX_H3_REPO],
            "single_files": [
                transformer,
                _sf(MINIMAX_H3_TEXT_ENCODER_NAME, MINIMAX_H3_TEXT_ENCODER_URL),
                _sf(MINIMAX_H3_VIDEO_VAE_NAME, MINIMAX_H3_VIDEO_VAE_URL),
                _sf(MINIMAX_H3_AUDIO_VAE_NAME, MINIMAX_H3_AUDIO_VAE_URL),
                _sf(MINIMAX_H3_LORA_NAME, ""),
            ],
        }

    if pipeline in ("vision", "vision_caption", "ocr"):
        return {"repos_to_fetch": [], "single_files": [
            _sf(VISION_GGUF_NAME, VISION_GGUF_URL),
            _sf(VISION_MMPROJ_NAME, VISION_MMPROJ_URL),
        ]}

    # Time-series forecast pipeline (Google TimesFM 2.0 500M)
    if pipeline in ("forecast", "timesfm"):
        return {"repos_to_fetch": [TIMESFM_REPO], "single_files": []}

    raise ValueError(f"Unknown pipeline: {pipeline}")


# =============================================================================
# FILE STATUS & DOWNLOAD HELPERS
# =============================================================================

def _single_file_status(entry: Dict[str, Any]) -> Dict[str, Any]:
    raw_name = (entry or {}).get("name") or ""
    name = normalize_model_filename(raw_name)
    url = (entry or {}).get("url") or ""
    p = MODEL_DIR / name
    exists = p.exists() and p.stat().st_size > 0
    size_on_disk = int(p.stat().st_size) if exists else 0
    expected_size = int(entry.get("size") or 0) or _expected_size(name, url)
    size_ok = exists and (expected_size <= 0 or size_on_disk == expected_size)
    integrity_ok = size_ok
    if size_ok and p.suffix == ".safetensors":
        integrity_ok = _is_valid_safetensors(p)
    elif size_ok and p.suffix == ".gguf":
        integrity_ok = _is_valid_gguf(p)
    if integrity_ok and entry.get("sha256"):
        from video_enhance import verify_asset
        try:
            verify_asset(p, entry["sha256"])
        except ValueError:
            integrity_ok = False
    ok = bool(size_ok and integrity_ok)
    reason = None
    if exists and not size_ok:
        reason = f"size_mismatch:{size_on_disk}!={expected_size}"
    elif exists and not integrity_ok:
        reason = "invalid_file_format"
    return {
        "name": name, "url": url, "path": str(p),
        "exists": bool(exists), "ok": bool(ok),
        "size_on_disk": size_on_disk, "expected_size": int(expected_size or 0),
        "reason": reason,
    }


def _repos_ready_or_resp(*repo_ids: str):
    missing = []
    for rid in repo_ids:
        st = _cached_repo_readiness(rid)
        if not st.get("ok", False):
            missing.append({"repo": rid, "missing": st.get("missing", [])})
    if not missing:
        return None
    return jsonify(_json_sanitize({
        "error": "repos_missing",
        "message": "Required model repos are not fully present.",
        "details": missing
    })), 412


def _ensure_files_present_or_start(pipeline: str, auto_download: bool = False):
    plan = _cached_plan_for(pipeline)
    missing_repos = []
    for rid in plan.get("repos_to_fetch", []):
        st = _cached_repo_readiness(rid)
        if not st.get("ok", False):
            missing_repos.append({"repo": rid, "missing": st.get("missing", [])})
    missing_files = []
    invalid_files = []
    for f in plan.get("single_files", []):
        st = _single_file_status(f)
        if not st["exists"]:
            missing_files.append({"name": st["name"], "url": st["url"]})
        elif not st["ok"]:
            invalid_files.append({"name": st["name"], "url": st["url"], "reason": st["reason"]})
    if not missing_repos and not missing_files and not invalid_files:
        return None
    if auto_download:
        started = _start_prefetch_pipeline(pipeline)
        return jsonify(_json_sanitize(started["json"])), started["http_status"]
    return jsonify(_json_sanitize({
        "error": "assets_missing",
        "message": "Required assets are not available locally.",
        "missing_repos": missing_repos,
        "missing_files": missing_files,
        "invalid_files": invalid_files,
    })), 412


def _list_required_remote_files(repo_id: str, allow_patterns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    api = HfApi(token=_hf_token())
    files: List[Dict[str, Any]] = []

    def _match(p: str) -> bool:
        return True if not allow_patterns else any(fnmatch(p, pat) for pat in allow_patterns)

    try:
        items = api.list_repo_tree(repo_id=repo_id, repo_type="model", revision="main", recursive=True, expand=True)
        for it in items or []:
            # Hub 1.x returns RepoFile/RepoFolder objects without the legacy
            # `.type` discriminator. Accept both representations so byte-size
            # progress remains accurate after the Hub upgrade.
            is_file = (
                getattr(it, "type", None) == "file"
                or it.__class__.__name__ == "RepoFile"
            )
            if is_file and _match(it.path):
                size = int(getattr(it, "size", 0) or 0)
                files.append({"path": it.path, "size": size})
        logger.info(f"[Download] Listed {len(files)} files from {repo_id} (tree API)")
    except Exception as e:
        logger.warning(f"[Download] list_repo_tree failed for {repo_id}: {e}")

    if not files:
        try:
            paths = api.list_repo_files(repo_id=repo_id, repo_type="model", revision="main")
            for pth in paths or []:
                if _match(pth):
                    files.append({"path": pth, "size": 0})
            logger.info(f"[Download] Listed {len(files)} files from {repo_id} (files API)")
        except Exception as e:
            logger.warning(f"[Download] list_repo_files failed for {repo_id}: {e}")

    if not files:
        logger.error(f"[Download] No files found for {repo_id} with patterns {allow_patterns}")

    return files


def _start_prefetch_pipeline(pipeline: str) -> Dict[str, Any]:
    plan = _cached_plan_for(pipeline)
    pl, created = download_manager.new_or_active(pipeline)
    if not created:
        logger.info(
            f"[Download] Reusing active pipeline {pl.pipeline_id} for {pipeline}"
        )
        return {
            "json": {
                "ok": True,
                "message": "Prefetch already in progress",
                "pipeline_id": pl.pipeline_id,
                "pipeline": pl.to_dict(),
            },
            "http_status": 202,
        }
    download_manager.set_status(pl, "downloading")
    logger.info(f"[Download] Starting pipeline {pipeline}, id={pl.pipeline_id}")

    def _worker():
        try:
            repos = plan.get("repos_to_fetch", [])
            single_files = plan.get("single_files", [])
            logger.info(f"[Download] Pipeline {pipeline}: {len(repos)} repos, {len(single_files)} single files")

            for rid in repos:
                if pl.cancelled:
                    break
                allow = allow_patterns_for_repo(rid)
                logger.info(f"[Download] Fetching manifest for {rid} with patterns: {allow}")
                manifest = _list_required_remote_files(rid, allow_patterns=allow)
                total = sum(int(f.get("size") or 0) for f in manifest) or max(len(manifest), 1)
                logger.info(f"[Download] Manifest for {rid}: {len(manifest)} files, {total} bytes total")
                tid = download_manager.add_repo_task(pl, rid, total_estimate=total)
                download_manager.mark_downloading(pl, tid)
                try:
                    _download_repo_files(pl, tid, rid, manifest)
                    if not pl.cancelled:
                        _readiness_cache.pop(rid, None)
                        readiness = _repo_readiness(rid)
                        _readiness_cache[rid] = (readiness, time.time())
                        if not readiness.get("ok", False):
                            missing = ", ".join(readiness.get("missing", []))
                            raise ValueError(
                                f"Downloaded repository {rid} failed validation: {missing}"
                            )
                        download_manager.mark_completed(pl, tid)
                except Exception as e:
                    if pl.cancelled:
                        download_manager.mark_cancelled(pl, tid)
                        break
                    download_manager.mark_failed(pl, tid, str(e))

            files_to_do = []
            for f in plan.get("single_files", []):
                name = (f or {}).get("name") or ""
                size_hint = int(f.get("size") or EXPECTED_SIZES.get(name, 0))
                tid = download_manager.add_file_task(pl, name, size_hint or 1)
                files_to_do.append((f, tid))
            download_manager.emit(pl.pipeline_id)

            for f, tid in files_to_do:
                if pl.cancelled:
                    download_manager.mark_cancelled(pl, tid)
                    break
                st = _single_file_status(f)
                if st["exists"] and st["ok"]:
                    download_manager.update_progress(pl, tid, st["size_on_disk"], st["size_on_disk"] or 1)
                    download_manager.mark_completed(pl, tid)
                    continue
                download_manager.mark_downloading(pl, tid)
                name, url = st["name"], st["url"]
                size_hint = int(f.get("size") or EXPECTED_SIZES.get(name, 0))
                download_manager.update_progress(pl, tid, 0, size_hint or 1)
                try:
                    if not url:
                        raise ValueError(f"Local checkpoint {name} is missing or invalid. Restore the file in the model directory.")
                    _download_single_file(pl, tid, name, url, size_hint=size_hint, sha256=f.get("sha256", ""))
                    if not pl.cancelled:
                        download_manager.mark_completed(pl, tid)
                except Exception as e:
                    if pl.cancelled:
                        download_manager.mark_cancelled(pl, tid)
                        break
                    download_manager.mark_failed(pl, tid, str(e))
        except Exception:
            logger.exception("Prefetch worker failed")
        finally:
            download_manager.finalize_if_done(pl)

    threading.Thread(target=_worker, daemon=True).start()
    return {
        "json": {"ok": True, "message": "Prefetch started", "pipeline_id": pl.pipeline_id, "pipeline": pl.to_dict()},
        "http_status": 202,
    }


def _download_repo_files(pl: PipelineDownload, tid: str, repo_id: str, manifest: List[Dict[str, Any]]):
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    base = repo_local_dir(repo_id)

    # Clean up empty/corrupt repo directories before downloading
    if base.exists():
        # Check if directory is empty or has only empty subdirectories
        has_real_files = any(f.is_file() and f.stat().st_size > 0 for f in base.rglob("*"))
        if not has_real_files:
            logger.warning(f"[Download] Removing empty/corrupt repo directory: {base}")
            import shutil
            shutil.rmtree(base, ignore_errors=True)

    base.mkdir(parents=True, exist_ok=True)

    # Calculate total bytes; if sizes unknown, use file count for consistent tracking
    byte_total = sum(int(f.get("size") or 0) for f in manifest)
    use_bytes = byte_total > 0
    total = byte_total if use_bytes else max(len(manifest), 1)
    done = 0
    files_done = 0
    download_manager.update_progress(pl, tid, done, total)

    for f in manifest:
        if pl.cancelled:
            return
        rel = f["path"]
        rsz = int(f.get("size") or 0)
        dest = base / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        cached_file_valid = dest.exists() and (rsz == 0 or dest.stat().st_size == rsz)
        if cached_file_valid and dest.suffix == ".safetensors":
            cached_file_valid = _is_valid_safetensors(dest)
            if not cached_file_valid:
                logger.warning(f"[Download] Removing invalid safetensors file: {dest}")
                dest.unlink(missing_ok=True)
                dest.with_suffix(dest.suffix + ".part").unlink(missing_ok=True)
        if cached_file_valid:
            if use_bytes:
                done += (rsz or dest.stat().st_size)
            else:
                files_done += 1
                done = files_done
            download_manager.update_progress(pl, tid, done, total)
            continue
        url = hf_hub_url(repo_id=repo_id, filename=rel, repo_type="model", revision="main")
        if use_bytes:
            current_done = done
            # Use a mutable container to accumulate progress within the callback
            accumulated = [0]
            def make_update_cb(base, acc):
                def cb(inc):
                    acc[0] += inc
                    download_manager.update_progress(pl, tid, min(base + acc[0], total), total)
                return cb
            _stream_download(url, dest, headers=headers,
                             update=make_update_cb(current_done, accumulated),
                             is_cancelled=lambda: pl.cancelled)
            done = min(done + (rsz or (dest.stat().st_size if dest.exists() else 0)), total)
        else:
            _stream_download(url, dest, headers=headers,
                             update=lambda inc: None,  # No byte-level progress when tracking by file count
                             is_cancelled=lambda: pl.cancelled)
            files_done += 1
            done = files_done
        actual_size = dest.stat().st_size if dest.exists() else 0
        if rsz > 0 and actual_size != rsz:
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {rel} has size {actual_size}, expected {rsz}")
        if dest.suffix == ".safetensors" and not _is_valid_safetensors(dest):
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {rel} is not a valid safetensors file")
        if dest.suffix == ".gguf" and not _is_valid_gguf(dest):
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {rel} is not a valid GGUF file")
        download_manager.update_progress(pl, tid, done, total)
        time.sleep(0)


def _download_single_file(pl: PipelineDownload, tid: str, name: str, url: str, size_hint: int = 0, sha256: str = ""):
    # Normalize filename to lowercase for .gguf and .safetensors files
    normalized_name = normalize_model_filename(name)
    lock = _gguf_lock(normalized_name)
    with lock:
        headers = {"User-Agent": "BonzAI-Model-Download/4.0"}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        dest = MODEL_DIR / normalized_name
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        expected_size = int(size_hint or 0) or _expected_size(normalized_name, url)
        if dest.exists() and dest.stat().st_size > 0:
            size_ok = expected_size <= 0 or dest.stat().st_size == expected_size
            format_ok = (
                _is_valid_gguf(dest) if dest.suffix == ".gguf" else
                _is_valid_safetensors(dest) if dest.suffix == ".safetensors" else True
            )
            if size_ok and format_ok and sha256:
                from video_enhance import verify_asset
                try:
                    verify_asset(dest, sha256)
                except ValueError:
                    format_ok = False
                    dest.unlink(missing_ok=True)
            if size_ok and format_ok:
                download_manager.update_progress(pl, tid, expected_size or dest.stat().st_size, expected_size or dest.stat().st_size)
                return
        if pl.cancelled:
            return
        total = int(size_hint or 0) or expected_size
        download_manager.update_progress(pl, tid, 0, total or 1)
        done = 0

        def _tick(inc: int):
            nonlocal done
            done += int(inc)
            download_manager.update_progress(pl, tid, done, total or done or 1)

        _stream_download(url, dest, headers=headers, update=_tick, is_cancelled=lambda: pl.cancelled)
        if expected_size > 0 and dest.stat().st_size != expected_size:
            actual_size = dest.stat().st_size
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {normalized_name} has size {actual_size}, expected {expected_size}")
        if dest.suffix == ".safetensors" and not _is_valid_safetensors(dest):
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {normalized_name} is not a valid safetensors file")
        if dest.suffix == ".gguf" and not _is_valid_gguf(dest):
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {normalized_name} is not a valid GGUF file")
        if sha256:
            from video_enhance import verify_asset
            try:
                verify_asset(dest, sha256)
            except ValueError:
                dest.unlink(missing_ok=True)
                raise
        download_manager.update_progress(pl, tid, expected_size or dest.stat().st_size, expected_size or dest.stat().st_size)


def _stream_download(url, dest, headers, update, is_cancelled=None):
    tmp = dest.with_suffix(dest.suffix + ".part")
    downloaded = tmp.stat().st_size if tmp.exists() else 0
    range_headers = dict(headers or {})
    if downloaded > 0:
        range_headers["Range"] = f"bytes={downloaded}-"
    with requests.get(url, headers=range_headers, stream=True, timeout=(10, 600)) as r:
        if r.status_code == 416 and downloaded > 0:
            remote_size = r.headers.get("Content-Range", "").rsplit("/", 1)[-1]
            if remote_size.isdigit() and int(remote_size) == downloaded:
                tmp.replace(dest)
                update(downloaded)
                return
        r.raise_for_status()
        mode = "ab"
        if downloaded > 0:
            expected_range = f"bytes {downloaded}-"
            range_confirmed = r.status_code == 206 and r.headers.get("Content-Range", "").startswith(expected_range)
            if range_confirmed:
                update(downloaded)
            elif r.status_code == 200:
                logger.warning("[Download] Server ignored resume range for %s; restarting this file", dest.name)
                downloaded = 0
                mode = "wb"
            else:
                raise IOError(f"Server returned an invalid resume range for {dest.name}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp, mode) as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                if is_cancelled and is_cancelled():
                    raise CancelledDownload()
                f.write(chunk)
                try:
                    update(len(chunk))
                except Exception:
                    pass
                time.sleep(0)
    try:
        tmp.replace(dest)
    except FileNotFoundError:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp), str(dest))


# =============================================================================
# FFMPEG HELPER
# =============================================================================

def _platform_tag():
    system = platform.system().lower()
    arch = {"x86_64": "x64", "amd64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(
        platform.machine().lower(), platform.machine().lower())
    if system == "darwin":
        return f"darwin/{arch}", "ffmpeg"
    elif system == "linux":
        return f"linux/{arch}", "ffmpeg"
    elif system == "windows":
        return f"win32/{arch}", "ffmpeg.exe"
    raise RuntimeError(f"Unsupported platform: {system}/{arch}")


def _npm_ffmpeg_source_path() -> str:
    direct = os.environ.get("FFMPEG_BIN")
    if direct and os.path.isfile(direct):
        return direct
    plat, exe = _platform_tag()
    here = Path(__file__).resolve()
    patterns = [
        Path("node_modules") / "ffmpeg-static-electron-forge" / "dist" / "bin",
        Path("app.asar.unpacked") / "node_modules" / "ffmpeg-static-electron-forge" / "dist" / "bin",
        Path("resources") / "app.asar.unpacked" / "node_modules" / "ffmpeg-static-electron-forge" / "dist" / "bin",
    ]
    for root in [here, *list(here.parents)[:8], Path.cwd()]:
        for pat in patterns:
            p = root / pat / plat / exe
            if p.is_file():
                return str(p)
    sys_ffmpeg = shutil.which("ffmpeg.exe" if exe.endswith(".exe") else "ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    raise FileNotFoundError("Bundled ffmpeg not found. Set FFMPEG_BIN or install ffmpeg.")


def get_ffmpeg_binary_path() -> str:
    src = _npm_ffmpeg_source_path()
    _, exe = _platform_tag()
    dst = str(USER_BIN_DIR / exe)
    if os.path.abspath(src) != os.path.abspath(dst):
        if not os.path.isfile(dst) or os.stat(src).st_size != os.stat(dst).st_size:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
    try:
        st = os.stat(dst)
        os.chmod(dst, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass
    os.environ["IMAGEIO_FFMPEG_EXE"] = dst
    return dst


# Initialize ffmpeg path
try:
    os.environ["IMAGEIO_FFMPEG_EXE"] = get_ffmpeg_binary_path()
except Exception as e:
    logger.warning(f"Could not initialize ffmpeg: {e}")


# =============================================================================
# VIDEO HELPERS (UNIFIED)
# =============================================================================

def _as_pil_list(frames_or_output) -> List[Image.Image]:
    """Convert diffusers output to list of PIL Images."""
    obj = frames_or_output
    if hasattr(obj, "frames"):
        frames = obj.frames
    elif isinstance(obj, dict) and "frames" in obj:
        frames = obj["frames"]
    else:
        frames = obj
    if isinstance(frames, (list, tuple)) and frames and isinstance(frames[0], (list, tuple)):
        frames = frames[0]
    out = []
    for f in frames:
        if isinstance(f, Image.Image):
            out.append(f.convert("RGB"))
            continue
        if isinstance(f, torch.Tensor):
            t = f.detach().to("cpu")
            if t.ndim == 3 and t.shape[0] in (1, 3, 4):
                t = t.permute(1, 2, 0)
            arr = t.numpy()
        else:
            arr = np.asarray(f)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, axis=2)
        if arr.ndim == 3 and arr.shape[0] in (1, 3, 4) and arr.shape[-1] not in (1, 3, 4):
            arr = np.transpose(arr, (1, 2, 0))
        if arr.dtype.kind == "f":
            # Check if values are in [-1, 1] range (VAE output) or [0, 1] range
            if arr.min() < -0.5:  # Likely [-1, 1] range
                arr = ((arr + 1.0) / 2.0).clip(0.0, 1.0) * 255.0
            else:  # [0, 1] range
                arr = np.clip(arr, 0.0, 1.0) * 255.0
            arr = arr.round().astype(np.uint8)
        elif arr.dtype != np.uint8:
            arr = arr.astype(np.uint8)
        out.append(Image.fromarray(arr[..., :3], "RGB"))
    return out


def _blend_frames(img0: Image.Image, img1: Image.Image, alpha: float) -> Image.Image:
    """Alpha blend between two frames - clean, no ghosting."""
    arr0 = np.array(img0).astype(np.float32)
    arr1 = np.array(img1).astype(np.float32)
    blended = (1.0 - alpha) * arr0 + alpha * arr1
    return Image.fromarray(blended.clip(0, 255).astype(np.uint8))


def interpolate_frames(
    frames: List[Image.Image],
    source_fps: int,
    target_fps: int,
    method: str = "blend",
) -> Tuple[List[Image.Image], str]:
    """Interpolate frames using blend (no external dependencies)."""
    if target_fps <= source_fps or len(frames) < 2:
        return frames, "none"
    multiplier = target_fps / source_fps
    num_interp = int(round(multiplier)) - 1
    if num_interp < 1:
        return frames, "none"
    output_frames = []
    for i in range(len(frames) - 1):
        frame0 = frames[i]
        frame1 = frames[i + 1]
        output_frames.append(frame0)
        for j in range(1, num_interp + 1):
            t = j / (num_interp + 1)
            output_frames.append(_blend_frames(frame0, frame1, t))
    output_frames.append(frames[-1])
    logger.info(f"[Interpolation] {len(frames)} -> {len(output_frames)} frames (blend)")
    return output_frames, "blend"


def write_video(
    out_path: str,
    frames_or_output,
    source_fps: int,
    target_fps: int = 24,
    target_size: Optional[Tuple[int, int]] = None,
    crf: int = 18,
    preset: str = "slow",
    interpolate: bool = True,
    add_grain: float = 0.0,
    sharpen: float = 0.0,
    deband: bool = False,
    trim_head_frames: int = 0,
    gen_id: Optional[str] = None,
    audio: Optional[Union[torch.Tensor, np.ndarray]] = None,
    audio_sample_rate: int = 24000,
) -> str:
    """
    Unified video writer with optional interpolation, enhancement, and audio muxing.

    If audio is provided:
    - Video is written to a temp file
    - Audio is written to a temp WAV file
    - Both are muxed together with ffmpeg

    Returns the interpolation method used.
    """
    import tempfile
    import soundfile as sf

    frames_pil = _as_pil_list(frames_or_output)

    # Trim head frames
    if trim_head_frames > 0:
        drop = min(trim_head_frames, max(0, len(frames_pil) - 1))
        frames_pil = frames_pil[drop:]

    if not frames_pil:
        raise RuntimeError("No frames to encode")

    # Resize
    if target_size:
        W, H = target_size
    else:
        W, H = frames_pil[0].size
    W -= W % 2
    H -= H % 2
    frames_pil = [f.resize((W, H), Image.LANCZOS) for f in frames_pil]

    # Interpolate
    output_fps = source_fps
    method_used = "none"
    if interpolate and target_fps > source_fps:
        frames_pil, method_used = interpolate_frames(frames_pil, source_fps, target_fps, method="blend")
        output_fps = target_fps

    # Convert to arrays
    arrs = [np.array(f.convert("RGB"), dtype=np.uint8) for f in frames_pil]

    ffmpeg_bin = get_ffmpeg_binary_path()

    # Build filter chain
    vf_parts = ["format=yuv420p", "setsar=1"]

    # IMPORTANT: Apply temporal smoothing BEFORE enhancement to reduce video jitter
    # hqdn3d: high-quality 3D denoiser (spatial + temporal)
    # Light temporal smoothing to reduce frame-to-frame inconsistency
    vf_parts.append("hqdn3d=1.5:1.5:3:3")  # luma_spatial:chroma_spatial:luma_temporal:chroma_temporal

    if deband:
        vf_parts.append("gradfun=20:30")
    if sharpen > 0:
        # Use lighter sharpening kernel to avoid amplifying noise
        vf_parts.append(f"unsharp=3:3:{sharpen * 0.6}:3:3:0")
    if add_grain > 0:
        # Use film grain with temporal flag for slight consistency
        # Note: FFmpeg noise is still per-frame, so keep values very low
        vf_parts.append(f"noise=alls={add_grain * 5}:allf=t+u")

    # Determine output path: temp file if audio will be muxed, otherwise final path
    video_target = out_path
    temp_video_path = None
    temp_audio_path = None

    if audio is not None:
        temp_video_path = tempfile.mktemp(suffix=".mp4")
        video_target = temp_video_path

    cmd = [
        ffmpeg_bin, "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(int(output_fps)),
        "-i", "-",
        "-vf", ",".join(vf_parts),
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-color_primaries", "bt709", "-colorspace", "bt709", "-color_trc", "bt709",
        "-movflags", "+faststart",
        video_target,
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        total = len(arrs)
        for i, arr in enumerate(arrs, 1):
            proc.stdin.write(arr.tobytes())
            if gen_id and (i % max(1, total // 10) == 0):
                genbus.progress(gen_id, "finalizing", 2, 3)
                try:
                    socketio.sleep(0)
                except Exception:
                    pass
    finally:
        if proc.stdin:
            proc.stdin.close()
        ret = proc.wait()
        if ret != 0:
            raise RuntimeError(f"ffmpeg exited with code {ret}")

    # Mux audio if provided
    if audio is not None:
        try:
            # Convert audio to numpy if it's a tensor
            if isinstance(audio, torch.Tensor):
                audio_np = audio.cpu().float().numpy()
            else:
                audio_np = np.asarray(audio, dtype=np.float32)

            # Ensure audio is 1D or 2D (channels, samples) -> (samples,) or (samples, channels)
            if audio_np.ndim == 1:
                pass  # Already mono
            elif audio_np.ndim == 2:
                # If shape is (channels, samples), transpose to (samples, channels)
                if audio_np.shape[0] <= 2 and audio_np.shape[1] > audio_np.shape[0]:
                    audio_np = audio_np.T

            # Normalize audio to [-1, 1] range if needed
            max_val = np.abs(audio_np).max()
            if max_val > 1.0:
                audio_np = audio_np / max_val

            # Write audio to temp WAV file
            temp_audio_path = tempfile.mktemp(suffix=".wav")
            sf.write(temp_audio_path, audio_np, audio_sample_rate)

            # Mux video + audio with ffmpeg
            mux_cmd = [
                ffmpeg_bin, "-y",
                "-i", temp_video_path,
                "-i", temp_audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                out_path,
            ]

            mux_proc = subprocess.run(mux_cmd, capture_output=True, timeout=120)
            if mux_proc.returncode != 0:
                logger.warning(f"Audio muxing failed: {mux_proc.stderr.decode()}")
                # Fall back to video without audio
                import shutil
                shutil.move(temp_video_path, out_path)
                temp_video_path = None
        finally:
            # Clean up temp files
            if temp_video_path and os.path.exists(temp_video_path):
                try:
                    os.remove(temp_video_path)
                except Exception:
                    pass
            if temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                except Exception:
                    pass

    return method_used

# =============================================================================
# REST API: PIPELINES
# =============================================================================

@app.route("/pipelines/plan", methods=["POST"])
def pipelines_plan():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    deep_validate = bool(data.get("deep_validate"))
    if not pipeline:
        return jsonify(_json_sanitize({"error": "Provide 'pipeline'."})), 400
    try:
        plan = _cached_plan_for(pipeline)
    except ValueError as e:
        return jsonify(_json_sanitize({"error": str(e)})), 400
    
    repos_status = []
    for rid in plan.get("repos_to_fetch", []):
        if deep_validate:
            status = _repo_readiness(rid)
            _readiness_cache[rid] = (status, time.time())
            repos_status.append(status)
        else:
            repos_status.append(_cached_repo_readiness(rid))
    required_files = [_single_file_status(f) for f in plan.get("single_files", [])]
    ok_repos = all(r.get("ok") for r in repos_status) if repos_status else True
    ok_files = all(s.get("ok") for s in required_files) if required_files else True
    
    return jsonify(_json_sanitize({
        "plan": plan,
        "repos": repos_status,
        "required_files": required_files,
        "ok": bool(ok_repos and ok_files),
    })), 200


@app.route("/pipelines/prefetch", methods=["POST"])
def pipelines_prefetch():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    if not pipeline:
        return jsonify(_json_sanitize({"error": "Provide 'pipeline'."})), 400
    try:
        started = _start_prefetch_pipeline(pipeline)
        return jsonify(_json_sanitize(started["json"])), started["http_status"]
    except ValueError as e:
        return jsonify(_json_sanitize({"error": str(e)})), 400


# =============================================================================
# REST API: DOWNLOADS
# =============================================================================

@app.route("/downloads/list", methods=["GET"])
def downloads_list():
    return jsonify(_json_sanitize({"pipelines": [p.to_dict() for p in download_manager.pipelines.values()]})), 200


@app.route("/downloads/status/<pipeline_id>", methods=["GET"])
def downloads_status(pipeline_id):
    pl = download_manager.pipelines.get(pipeline_id)
    if not pl:
        return jsonify(_json_sanitize({"error": "Pipeline not found"})), 404
    return jsonify(_json_sanitize(pl.to_dict())), 200


@app.route("/downloads/cancel/<pipeline_id>", methods=["POST"])
def downloads_cancel(pipeline_id):
    pl = download_manager.cancel_pipeline(pipeline_id)
    if not pl:
        return jsonify({"error": "Pipeline not found"}), 404
    return jsonify({"ok": True, "pipeline_id": pl.pipeline_id, "status": pl.status}), 200


# =============================================================================
# REST API: MEDIA STREAMING
# =============================================================================

# MIME types for common media formats
MEDIA_MIME_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def encode_image_to_webp(image, quality: int = 90) -> str:
    """
    Encode a PIL Image to WebP format and return base64 string.

    WebP provides ~30% smaller file sizes than PNG while maintaining quality,
    improving storage efficiency and transfer speeds.

    Args:
        image: PIL Image object
        quality: WebP quality (0-100, default 90 for high quality)

    Returns:
        Base64-encoded WebP image string
    """
    buf = BytesIO()
    image.save(buf, format="WEBP", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def image_webp_payload(image, image_b64: str) -> dict:
    """Return common JSON metadata for WebP image responses."""
    return {
        "image": image_b64,
        "width": getattr(image, "width", None),
        "height": getattr(image, "height", None),
        "mime_type": "image/webp",
    }


def convert_wav_to_mp3(wav_path: str, bitrate: str = "128k") -> Optional[str]:
    """
    Convert a WAV file to MP3 using ffmpeg.
    Returns the MP3 path on success, None on failure.

    Args:
        wav_path: Path to the WAV file
        bitrate: MP3 bitrate (default 128k for good quality/size balance)

    Returns:
        Path to the MP3 file, or None if conversion failed
    """
    if not os.path.exists(wav_path):
        logger.warning(f"[MP3] WAV file not found: {wav_path}")
        return None

    mp3_path = wav_path.rsplit(".", 1)[0] + ".mp3"

    try:
        ffmpeg_bin = get_ffmpeg_binary_path()
        cmd = [
            ffmpeg_bin, "-y",
            "-i", wav_path,
            "-codec:a", "libmp3lame",
            "-b:a", bitrate,
            "-ar", "44100",  # Standard sample rate
            mp3_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            logger.warning(f"[MP3] ffmpeg conversion failed: {result.stderr}")
            return None

        if os.path.exists(mp3_path):
            logger.info(f"[MP3] Converted {wav_path} -> {mp3_path}")
            return mp3_path
        else:
            logger.warning(f"[MP3] Output file not created: {mp3_path}")
            return None

    except FileNotFoundError:
        logger.warning("[MP3] ffmpeg not available for MP3 conversion")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("[MP3] ffmpeg conversion timed out")
        return None
    except Exception as e:
        logger.warning(f"[MP3] Conversion error: {e}")
        return None


@app.route("/media/stream", methods=["GET"])
def stream_media():
    """
    Stream a media file from the local filesystem.
    Query params:
      - path: Absolute path to the media file
    Supports range requests for video seeking.
    """
    file_path = request.args.get("path", "").strip()
    if not file_path:
        return jsonify({"error": "Missing 'path' parameter"}), 400

    # Security: Only allow files in known safe directories
    cwd = os.getcwd()
    allowed_dirs = [
        cwd,
        str(MODEL_DIR),
        str(FILES_DIR),
        os.path.expanduser("~"),
        "/tmp",
        "/var/folders",  # macOS temp
        "/Volumes",  # External drives on macOS
    ]

    # Normalize path to prevent directory traversal
    file_path = os.path.abspath(file_path)
    is_allowed = any(file_path.startswith(os.path.abspath(d)) for d in allowed_dirs if d)

    if not is_allowed:
        logger.warning(f"[Media] Blocked access to path outside allowed dirs: {file_path}")
        logger.warning(f"[Media] Current MODEL_DIR: {MODEL_DIR}, FILES_DIR: {FILES_DIR}")
        return jsonify({"error": "Access denied"}), 403

    if not os.path.isfile(file_path):
        return jsonify({"error": "File not found"}), 404

    # Determine MIME type
    ext = os.path.splitext(file_path)[1].lower()
    mime_type = MEDIA_MIME_TYPES.get(ext, "application/octet-stream")
    file_size = os.path.getsize(file_path)

    # Handle range requests for video seeking
    range_header = request.headers.get("Range")
    if range_header:
        # Parse range header (e.g., "bytes=0-1023")
        try:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            def generate():
                with open(file_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_size = min(8192, remaining)
                        data = f.read(chunk_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            response = Response(
                generate(),
                status=206,
                mimetype=mime_type,
                direct_passthrough=True,
            )
            response.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            response.headers["Accept-Ranges"] = "bytes"
            response.headers["Content-Length"] = length
            response.headers["Cache-Control"] = "no-cache"
            return response
        except (ValueError, IndexError):
            pass  # Fall through to full file response

    # Full file response
    def generate_full():
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk

    response = Response(
        generate_full(),
        status=200,
        mimetype=mime_type,
        direct_passthrough=True,
    )
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Content-Length"] = file_size
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/media/info", methods=["GET"])
def media_info():
    """Get info about a media file (exists, size, type)."""
    file_path = request.args.get("path", "").strip()
    if not file_path:
        return jsonify({"error": "Missing 'path' parameter"}), 400

    file_path = os.path.abspath(file_path)
    if not os.path.isfile(file_path):
        return jsonify({"exists": False}), 200

    ext = os.path.splitext(file_path)[1].lower()
    return jsonify({
        "exists": True,
        "path": file_path,
        "size": os.path.getsize(file_path),
        "mime_type": MEDIA_MIME_TYPES.get(ext, "application/octet-stream"),
        "stream_url": f"/media/stream?path={file_path}",
    }), 200


# =============================================================================
# REST API: IMAGE GENERATION - SDXL
# =============================================================================

def _force_pipeline_dtype(pipe, dtype: torch.dtype):
    """Force all pipeline components to the same dtype for MPS compatibility."""
    for name in ["unet", "vae", "text_encoder", "text_encoder_2"]:
        component = getattr(pipe, name, None)
        if component is not None:
            component.to(dtype=dtype)
    return pipe


def _img_b64_to_pil(b64: str) -> Image.Image:
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


# Shared image-only defaults. Caller additions (e.g. portrait layout exclusions)
# are retained; these terms are not injected into the positive prompt.
IMAGE_NEGATIVE_PROMPT = (
    "worst quality, low quality, multiple views, multiple angle, split view, grid view, "
    "two shot, blurry, deformed, extra fingers, bad anatomy, long torso, anatomy error, "
    "child, toddler, teen, underage, loli, shota, minor, futa, leg hair, hairy legs, "
    "watermark, underwear, panties, bra, lingerie, thong, panty, clothed crotch, "
    "covered vagina, covered genitals, censored, covered nipples, covered areolas, "
    "signature, interracial, black man, black cock, african male, fat male, big male belly"
)


def _image_negative_prompt(data):
    extra = data.get("negative_prompt")
    values = IMAGE_NEGATIVE_PROMPT.split(",")
    if isinstance(extra, str):
        values.extend(extra.split(","))
    unique = {}
    for value in values:
        term = value.strip()
        if term:
            unique.setdefault(term.casefold(), term)
    return ", ".join(unique.values())


@app.route("/image/standard", methods=["POST"])
def image_standard_sdxl():
    import logging as _logging
    _logging.getLogger("transformers.tokenization_utils_base").setLevel(_logging.ERROR)

    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    negative_prompt = _image_negative_prompt(data)
    height = int(data.get("height", 1024))
    width  = int(data.get("width", 1024))

    ckpt_filename = (data.get("ckpt") or "sdxl-lora.safetensors").strip()
    lora_filename = (data.get("lora") or "sdxl-lora-body.safetensors").strip()
    lora_strength = float(data.get("lora_strength", 1.0))

    steps_base = int(data.get("steps_base", 40))
    steps_ref  = int(data.get("steps_refiner", 40))
    denoising_split = float(data.get("denoising_split", 0.9))
    cb_steps = int(data.get("callback_steps", 5))
    auto_dl = bool(data.get("auto_download", False))

    guard = _repos_ready_or_resp(SDXL_BASE_REPO, SDXL_REFINER_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("sdxl_intermediate")
            return jsonify(_json_sanitize(started["json"])), started["http_status"]
        return guard

    gen_id = genbus.new("sdxl_standard", {"endpoint": "/image/standard", "prompt": prompt})

    base = refiner = compel_base = compel_ref = shared_encoder = shared_vae = None
    try:
        device = DeviceManager.get_device()
        dtype  = DeviceManager.get_dtype(device)

        base = None
        if ckpt_filename:
            try:
                ckpt_path = (MODEL_DIR / ckpt_filename).resolve()
                if ckpt_path.exists() and ckpt_path.stat().st_size > 0 and ckpt_path.suffix.lower() == ".safetensors":
                    base = StableDiffusionXLPipeline.from_single_file(
                        str(ckpt_path),
                        torch_dtype=dtype,
                        use_safetensors=True,
                        local_files_only=True,
                    )
                    logger.info(f"[sdxl] Loaded base from single-file checkpoint: {ckpt_path.name}")
            except Exception as e:
                logger.warning(f"[sdxl] Single-file load failed; falling back to repo: {e}")

        if base is None:
            # Use offline mode if pipeline is fully downloaded
            with offline_mode_if_complete("sdxl_intermediate") as is_offline:
                base = StableDiffusionXLPipeline.from_pretrained(
                    str(repo_local_dir(SDXL_BASE_REPO)),
                    torch_dtype=dtype,
                    use_safetensors=True,
                    variant="fp16",
                    local_files_only=is_offline,
                )

        def _apply_lora(pipe, lora_path: Path, strength: float, tag: str):
            try:
                pipe.load_lora_weights(str(lora_path))
                try:
                    pipe.set_adapters(["default"], adapter_weights=[strength])
                except Exception:
                    try:
                        pipe.fuse_lora(lora_scale=strength)
                    except Exception:
                        pass
                logger.info(f"[sdxl] LoRA applied to {tag}: {lora_path.name} (strength={strength})")
                return True
            except Exception as e1:
                try:
                    pipe.unet.load_attn_procs(str(lora_path))
                    try:
                        pipe.fuse_lora(lora_scale=strength)
                    except Exception:
                        pass
                    logger.info(f"[sdxl] UNet attn_procs LoRA applied to {tag}: {lora_path.name} (strength={strength})")
                    return True
                except Exception:
                    logger.warning(f"[sdxl] Skipping {tag} LoRA: {e1}")
                    return False

        if lora_filename:
            lp = (MODEL_DIR / lora_filename).resolve()
            if lp.exists() and lp.stat().st_size > 0:
                _apply_lora(base, lp, lora_strength, "base")

        try:
            if device.type == "cuda":
                base.unet = torch.compile(base.unet, mode="reduce-overhead", fullgraph=True)
        except Exception:
            pass

        from compel import Compel, ReturnedEmbeddingsType
        def _make_compel(pipe):
            tok_list, enc_list, requires_pooled = [], [], []
            te1, tok1 = getattr(pipe, "text_encoder", None), getattr(pipe, "tokenizer", None)
            te2, tok2 = getattr(pipe, "text_encoder_2", None), getattr(pipe, "tokenizer_2", None)
            if te1 is not None and tok1 is not None:
                tok_list.append(tok1); enc_list.append(te1); requires_pooled.append(False)
            if te2 is not None and tok2 is not None:
                tok_list.append(tok2); enc_list.append(te2); requires_pooled.append(True)
            if not tok_list:
                raise RuntimeError("Pipeline lacks text encoders/tokenizers required for Compel.")
            return Compel(
                tokenizer=tok_list,
                text_encoder=enc_list,
                returned_embeddings_type=ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
                requires_pooled=requires_pooled,
                truncate_long_prompts=False,
            )

        def _pad_seq_len(a: torch.Tensor, b: torch.Tensor):
            if a.shape[1] == b.shape[1]:
                return a, b
            max_len = max(a.shape[1], b.shape[1])
            def pad(t):
                if t.shape[1] == max_len: return t
                pad_len = max_len - t.shape[1]
                pad_tensor = torch.zeros(t.shape[0], pad_len, t.shape[2], dtype=t.dtype, device=t.device)
                return torch.cat([t, pad_tensor], dim=1)
            return pad(a), pad(b)

        base.text_encoder.to(device)
        base.text_encoder_2.to(device)
        compel_base = _make_compel(base)
        with torch.inference_mode():
            prompt_embeds_base, pooled_base = compel_base(prompt)
            neg_embeds_base, neg_pooled_base = compel_base(negative_prompt)
            prompt_embeds_base, neg_embeds_base = _pad_seq_len(prompt_embeds_base, neg_embeds_base)

        from inference_memory import constrained
        if constrained(device):
            base.text_encoder.to("cpu")
            base.text_encoder_2.to("cpu")
        base.vae.enable_tiling()
        if constrained(device) and device.type != "cpu":
            apply_group_offloading(base.unet, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        else:
            base.unet.to(device)
            base.vae.to(device)

        def cb_base(step, timestep, latents):
            genbus.progress(gen_id, "generating", 1, 3)

        latents = base(
            prompt_embeds=prompt_embeds_base,
            pooled_prompt_embeds=pooled_base,
            negative_prompt_embeds=neg_embeds_base,
            negative_pooled_prompt_embeds=neg_pooled_base,
            num_inference_steps=steps_base,
            denoising_end=denoising_split,
            output_type="latent",
            width=width,
            height=height,
            callback=cb_base,
            callback_steps=max(1, cb_steps),
        ).images

        shared_encoder = base.text_encoder_2
        shared_vae = base.vae
        shared_encoder.to("cpu")
        shared_vae.to("cpu")
        del compel_base, prompt_embeds_base, pooled_base, neg_embeds_base, neg_pooled_base
        from inference_memory import detach_hooks
        detach_hooks(base.unet)
        base = None
        from inference_memory import reclaim
        reclaim(device)

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("sdxl_intermediate") as is_offline:
            refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                str(repo_local_dir(SDXL_REFINER_REPO)),
                text_encoder_2=shared_encoder,
                vae=shared_vae,
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16",
                local_files_only=is_offline,
            )

        if lora_filename:
            lp = (MODEL_DIR / lora_filename).resolve()
            if lp.exists() and lp.stat().st_size > 0:
                _apply_lora(refiner, lp, lora_strength, "refiner")

        try:
            if device.type == "cuda":
                refiner.unet = torch.compile(refiner.unet, mode="reduce-overhead", fullgraph=True)
        except Exception:
            pass

        refiner.text_encoder_2.to(device)
        compel_ref = _make_compel(refiner)
        with torch.inference_mode():
            prompt_embeds_ref, pooled_ref = compel_ref(prompt)
            neg_embeds_ref, neg_pooled_ref = compel_ref(negative_prompt)
            prompt_embeds_ref, neg_embeds_ref = _pad_seq_len(prompt_embeds_ref, neg_embeds_ref)

        if constrained(device):
            refiner.text_encoder_2.to("cpu")
        refiner.vae.enable_tiling()
        if constrained(device) and device.type != "cpu":
            apply_group_offloading(refiner.unet, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        else:
            refiner.unet.to(device)
        refiner.vae.to(device)

        def cb_ref(step, timestep, latents_):
            genbus.progress(gen_id, "generating", 1, 3)

        image = refiner(
            image=latents,
            prompt_embeds=prompt_embeds_ref,
            pooled_prompt_embeds=pooled_ref,
            negative_prompt_embeds=neg_embeds_ref,
            negative_pooled_prompt_embeds=neg_pooled_ref,
            num_inference_steps=steps_ref,
            denoising_start=denoising_split,
            output_type="pil",
            callback=cb_ref,
            callback_steps=max(1, cb_steps),
        ).images[0]

        encoded = encode_image_to_webp(image)

        # Save image to FILES_DIR for persistence
        try:
            out_path = FILES_DIR / f"image_standard_{gen_id}.webp"
            image.save(str(out_path), format="WEBP", quality=90)
            logger.info(f"[sdxl] Image saved to {out_path}")
        except Exception as save_err:
            logger.warning(f"[sdxl] Failed to save image to disk: {save_err}")

        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize({
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            **image_webp_payload(image, encoded),
            "image_path": str(out_path) if 'out_path' in dir() else None,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("SDXL intermediate failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        base = refiner = compel_base = compel_ref = shared_encoder = shared_vae = None
        gc.collect()
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - Z-IMAGE TURBO
# =============================================================================

@app.route("/image/quality", methods=["POST"])
@app.route("/image/advanced", methods=["POST"])
def z_image_quality():
    """Generate image using Z-Image-Turbo (quality mode)."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = _image_negative_prompt(data)
    H = int(data.get("height", 512))
    W = int(data.get("width", 512))
    steps = int(data.get("steps", 9))
    seed = data.get("seed", None)
    auto_dl = bool(data.get("auto_download", False))

    # Private mode (Consumer + Privacy in the networking modal). Main.js
    # injects these three keys when the user has selected providers and
    # the pipeline toggle is on. The renderer / flagship.js never sees
    # them — they're added inside the inference-request orchestrator.
    pipeline_mode = (data.get("pipeline_mode") or "").lower()
    peer_id = data.get("peer_id") or None
    requested_block_range = data.get("block_range")  # [k, m] or None
    use_private = pipeline_mode == "private" and peer_id

    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400

    guard = _ensure_files_present_or_start("z_image_turbo", auto_download=auto_dl)
    if guard:
        return guard

    device = DeviceManager.get_device()
    local_checkpoint = MODEL_DIR / Z_LOCAL_CHECKPOINT_NAME
    has_local_checkpoint = local_checkpoint.is_file() and local_checkpoint.stat().st_size > 0

    gen_id = genbus.new("z_image_quality", {"endpoint": "/image/quality", "w": W, "h": H, "steps": steps, "private": bool(use_private)})

    pipe = transformer = None
    try:
        genbus.progress(gen_id, "loading", 0, 3)

        if device.type == "cuda":
            compute_dtype = torch.bfloat16
        elif device.type == "mps":
            compute_dtype = torch.bfloat16
        else:
            compute_dtype = torch.float32

        tr_cfg = repo_local_dir(Z_REPO) / "transformer" / "config.json"

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("z_image_turbo") as is_offline:
            if has_local_checkpoint:
                transformer = ZImageTransformer2DModel.from_single_file(
                    str(local_checkpoint),
                    config=str(tr_cfg),
                    torch_dtype=compute_dtype,
                )
                logger.info("[z-image] Loaded local transformer checkpoint %s", local_checkpoint.name)
            else:
                transformer = ZImageTransformer2DModel.from_single_file(
                    str(MODEL_DIR / Z_GGUF_NAME),
                    config=str(tr_cfg),
                    quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
                    dtype=compute_dtype,
                )

            pipe = ZImagePipeline.from_pretrained(
                str(repo_local_dir(Z_REPO)),
                transformer=transformer,
                dtype=compute_dtype,
                local_files_only=is_offline,
            )

        from inference_memory import configure_pipeline, release_on_first_forward, release_before_decode
        configure_pipeline(pipe, device, None if has_local_checkpoint else MODEL_DIR / Z_GGUF_NAME)
        release_on_first_forward(pipe, ("text_encoder",), device)
        release_before_decode(pipe, ("transformer",), device)
        transformer = None
        pipe.vae.enable_tiling()

        generator = (
            torch.Generator(device=device).manual_seed(seed)
            if isinstance(seed, int)
            else None
        )

        genbus.progress(gen_id, "generating", 1, 3)

        # Private-mode wrap: patch transformer.layers so middle blocks
        # ride the libp2p bridge to a remote shard provider. Head/tail
        # run locally; if the bridge call fails, the session.close()
        # path restores the originals so a follow-up local request
        # doesn't see the patched module list.
        _private_session = None
        if use_private:
            try:
                from sharded_pipeline_client import with_pipeline, get_adapter
                adapter = get_adapter("z_image_turbo")
                if adapter is None:
                    logger.warning("[z-image] no adapter for private mode — falling back to local")
                else:
                    k, r = 4, 4
                    if isinstance(requested_block_range, list) and len(requested_block_range) == 2:
                        L = len(adapter.get_layers(pipe.transformer))
                        k = max(0, int(requested_block_range[0]))
                        r = max(0, L - int(requested_block_range[1]))
                    _private_session = with_pipeline(
                        pipe, adapter, peer_id=peer_id, k=k, r=r,
                    )
                    logger.info("[z-image] private mode: peer=%s k=%d r=%d", peer_id[:12], k, r)
            except Exception as e:
                logger.warning("[z-image] private mode init failed (%s) — falling back to local", e)
                _private_session = None

        try:
            out = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                height=H,
                width=W,
                num_inference_steps=steps,
                guidance_scale=0.0,
                generator=generator,
            )
            image = out.images[0]
        finally:
            if _private_session is not None:
                _private_session.close()

        genbus.progress(gen_id, "finalizing", 2, 3)

        encoded = encode_image_to_webp(image)

        # Save image to FILES_DIR for persistence
        try:
            out_path = FILES_DIR / f"image_quality_{gen_id}.webp"
            image.save(str(out_path), format="WEBP", quality=90)
            logger.info(f"[z-image] Image saved to {out_path}")
        except Exception as save_err:
            logger.warning(f"[z-image] Failed to save image to disk: {save_err}")

        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"ok": True})

        return jsonify(_json_sanitize({
            "ok": True,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "negative_prompt_applied": False,
            **image_webp_payload(image, encoded),
            "image_path": str(out_path) if 'out_path' in dir() else None,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
            "local_checkpoint": local_checkpoint.name if has_local_checkpoint else None,
        })), 201

    except Exception as e:
        logger.exception("Z-Image-Turbo failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        pipe = transformer = None
        gc.collect()
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - FLUX KLEIN 9B GGUF (TURBO)
# =============================================================================

@app.route("/image/experimental/klein-9b", methods=["POST"])
def image_experimental_klein_9b(edit=False):
    """Shared local Q4_K_M Turbo generation and reference-image editing."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required"}), 400
    prompt = data.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return jsonify({"error": "Prompt is required"}), 400
    try:
        use_lora = data.get("use_lora", True)
        if not isinstance(use_lora, bool):
            raise ValueError("use_lora must be a boolean")
        lora_scale = float(data.get("lora_scale", 1.0))
        if not math.isfinite(lora_scale) or not 0 <= lora_scale <= 2:
            raise ValueError("lora_scale must be between 0 and 2")
        width, height = int(data.get("width", 768)), int(data.get("height", 768))
        steps, seed = int(data.get("steps", 4)), int(data.get("seed", 0))
        if any(n < 256 or n > 4096 or n % 16 for n in (width, height)):
            raise ValueError("Width and height must be multiples of 16 between 256 and 4096")
        if not 1 <= steps <= 20 or not 0 <= seed < 2**63:
            raise ValueError("Steps must be 1–20; seed must be 0–2^63-1")
        if "auto_download" in data and not isinstance(data["auto_download"], bool):
            raise ValueError("auto_download must be a boolean")
    except (TypeError, ValueError, OverflowError) as error:
        return jsonify({"error": str(error)}), 400
    image_b64 = data.get("image_base64", "")
    image_url = data.get("image_url", "")
    if edit and (not isinstance(image_b64, str) or not isinstance(image_url, str) or not (image_b64.strip() or image_url.strip())):
        return jsonify({"error": "Provide image_base64 or image_url for editing"}), 400
    if not FLUX_KLEIN_9B_LOCK.acquire(blocking=False):
        return jsonify({"error": "A Turbo image generation is already running"}), 409
    pipe = transformer = None
    adapter_handles = []
    gen_id = None
    try:
        guard = _ensure_files_present_or_start("flux_klein_9b_gguf", auto_download=data.get("auto_download", False))
        if guard:
            return guard
        # Lazy import keeps existing image endpoints usable on older installations.
        from diffusers import Flux2Transformer2DModel
        device = DeviceManager.get_device()
        # CPU float32 is portable, including processors without bf16 support.
        # CUDA also covers AMD ROCm; use bf16 only when the runtime supports it.
        dtype = torch.float32
        if device.type == "mps":
            dtype = torch.float16
        elif device.type == "cuda":
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        endpoint = "/image/image/turbo" if edit else "/image/turbo"
        gen_id = genbus.new("image_turbo", {"endpoint": endpoint})
        started = time.monotonic()
        genbus.progress(gen_id, "loading", 0, 3)
        root = repo_local_dir(FLUX_KLEIN_9B_REPO)
        transformer = Flux2Transformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_KLEIN_9B_GGUF_NAME),
            config=str(root), subfolder="transformer",
            quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
            torch_dtype=dtype, local_files_only=True,
        )
        pipe = Flux2KleinPipeline.from_pretrained(
            str(root), transformer=transformer, torch_dtype=dtype, local_files_only=True,
        )
        applied_loras = []
        adapter_names = []
        if use_lora and lora_scale > 0:
            from klein_adapters import load_klein_adapter
            candidates = [(MODEL_DIR / filename, adapter) for filename, adapter in
                          [(FLUX_KLEIN_9B_LORA_NAME, "klein_local"),
                           (FLUX_KLEIN_9B_LORA_EXTRA_NAME, "klein_extra")]
                          if (MODEL_DIR / filename).exists()]
            if len(candidates) == 2:
                lora_scale = 0.5
            for lora_path, adapter in candidates:
                if not _is_valid_safetensors(lora_path):
                    raise ValueError(f"Invalid LoRA file: {lora_path.name}")
                handles, peft_adapter = load_klein_adapter(pipe, lora_path, adapter, lora_scale)
                adapter_handles.extend(handles)
                applied_loras.append(lora_path.name)
                if peft_adapter:
                    adapter_names.append(adapter)
            if adapter_names:
                pipe.set_adapters(adapter_names, adapter_weights=[lora_scale] * len(adapter_names))
        lora_applied = bool(applied_loras)
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
        from inference_memory import configure_pipeline, release_on_first_forward, release_before_decode
        configure_pipeline(pipe, device, MODEL_DIR / FLUX_KLEIN_9B_GGUF_NAME)
        release_on_first_forward(pipe, ("text_encoder",), device)
        release_before_decode(pipe, ("transformer",), device)
        transformer = None
        loaded = time.monotonic()
        genbus.progress(gen_id, "generating", 1, 3)
        conditioning = {}
        if edit:
            conditioning["image"] = load_image(image_url).convert("RGB") if image_url else _img_b64_to_pil(image_b64)
        image = pipe(prompt=prompt.strip(), width=width, height=height,
                     num_inference_steps=steps, guidance_scale=1.0,
                     generator=torch.Generator(device="cpu").manual_seed(seed),
                     **conditioning).images[0]
        generated = time.monotonic()
        genbus.progress(gen_id, "finalizing", 2, 3)
        out_path = FILES_DIR / f"image_klein_9b_{gen_id}.webp"
        image.save(str(out_path), format="WEBP", quality=90)
        result = {"prompt": prompt.strip(), **image_webp_payload(image, encode_image_to_webp(image)),
                  "image_path": str(out_path), "generation_id": gen_id,
                  "generation_websocket_url": generation_url(), "seed": seed,
                  "model": FLUX_KLEIN_9B_GGUF_NAME, "device": device.type,
                  "negative_prompt": _image_negative_prompt(data),
                  "negative_prompt_applied": False,
                  "lora": applied_loras[0] if lora_applied else None,
                  "loras": applied_loras,
                  "lora_scale": lora_scale if lora_applied else 0,
                  "load_seconds": round(loaded - started, 3),
                  "inference_seconds": round(generated - loaded, 3)}
        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize(result)), 201
    except Exception as error:
        logger.exception("Klein 9B Turbo generation failed")
        if gen_id:
            genbus.error(gen_id, str(error))
        return jsonify({"error": str(error)}), 500
    finally:
        for handle in adapter_handles:
            handle.remove()
        del pipe, transformer
        try:
            gc.collect()
            DeviceManager.free_memory()
        finally:
            FLUX_KLEIN_9B_LOCK.release()


@app.route("/image/turbo", methods=["POST"])
def image_turbo_flux_klein():
    return image_experimental_klein_9b()


@app.route("/image/image/turbo", methods=["POST"])
def image_turbo_flux_klein_i2i():
    return image_experimental_klein_9b(edit=True)


# ACE-Step v1.5 Diffusers pipeline cache
_ace_step_pipeline = None
_ace_step_offload = None
_ace_step_lock = threading.Lock()

# Kokoro TTS pipeline cache
_kokoro_pipeline = None
_kokoro_pipeline_lock = threading.Lock()


def _load_kokoro_pipeline():
    """Load or get cached Kokoro TTS pipeline."""
    global _kokoro_pipeline

    with _kokoro_pipeline_lock:
        if _kokoro_pipeline is not None:
            return _kokoro_pipeline

        try:
            from kokoro import KPipeline

            logger.info("[Kokoro] Loading KPipeline...")

            # KPipeline auto-downloads from HuggingFace on first use
            # lang_code='a' for American English
            _kokoro_pipeline = KPipeline(lang_code='a')

            logger.info("[Kokoro] Pipeline loaded successfully")
            return _kokoro_pipeline

        except ImportError:
            logger.error("[Kokoro] kokoro package not installed. Install with: pip install kokoro>=0.9.2")
            raise ImportError("kokoro package not installed. Install with: pip install kokoro>=0.9.2")
        except Exception as e:
            logger.exception(f"[Kokoro] Failed to load pipeline: {e}")
            raise


@app.route("/audio/turbo", methods=["POST"])
def audio_turbo_kokoro():
    """
    Kokoro TTS - Fast, high-quality text-to-speech.

    Supports multiple voices with gender selection.
    Uses KPipeline for inference at 24kHz.

    Request body:
    {
        "prompt": "Text to synthesize",
        "voice": "af_heart" (optional, defaults based on gender),
        "gender": "female" | "male" | "neutral" (optional, for auto voice selection),
        "speed": 1.0 (optional, 0.5-2.0),
        "auto_download": false
    }
    """
    data = request.get_json(silent=True) or {}

    prompt = (data.get("prompt") or "").strip()
    voice = (data.get("voice") or "").strip()
    gender = (data.get("gender") or "").strip().lower()
    speed = float(data.get("speed", 1.0))

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400

    # Validate speed
    speed = max(0.5, min(2.0, speed))

    # Select voice based on gender if not specified
    if not voice:
        if gender in KOKORO_DEFAULT_VOICE:
            voice = KOKORO_DEFAULT_VOICE[gender]
        else:
            voice = KOKORO_DEFAULT_VOICE["female"]  # Default to female

    # Validate voice
    if voice not in KOKORO_VOICES:
        return jsonify({
            "error": f"Invalid voice '{voice}'",
            "available_voices": list(KOKORO_VOICES.keys()),
        }), 400

    gen_id = genbus.new("kokoro_tts", {"endpoint": "/audio/turbo", "voice": voice})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 3)

        # Load pipeline (auto-downloads model on first use)
        pipeline = _load_kokoro_pipeline()

        genbus.progress(gen_id, "generating", 1, 3)

        # Generate audio using KPipeline
        # Returns generator of (graphemes, phonemes, audio) tuples
        audio_segments = []
        narration_texts = []
        for i, (gs, ps, audio) in enumerate(pipeline(prompt, voice=voice, speed=speed)):
            if hasattr(audio, "detach"):
                audio = audio.detach().cpu().numpy()
            samples = np.asarray(audio, dtype=np.float32).reshape(-1)
            if not len(samples) or not np.isfinite(samples).all():
                raise ValueError("The narrator returned invalid audio. Please record again.")
            audio_segments.append(samples)
            narration_texts.append(str(gs))

        # Concatenate all audio segments
        if audio_segments:
            from meditation_timing import narration_timeline
            timing = narration_timeline([len(audio) for audio in audio_segments], narration_texts, 24000, data.get("target_duration_seconds"))
            timed_segments = []
            for pause, audio in zip(timing["before_samples"], audio_segments):
                if pause:
                    timed_segments.append(np.zeros(pause, dtype=np.float32))
                timed_segments.append(audio)
            if timing["tail_samples"]:
                timed_segments.append(np.zeros(timing["tail_samples"], dtype=np.float32))
            full_audio = np.concatenate(timed_segments)
        else:
            raise ValueError("No audio generated")

        genbus.progress(gen_id, "saving", 2, 3)

        # Save to file (24kHz sample rate)
        out_name = f"kokoro_{int(time.time())}_{gen_id[:8]}.wav"
        out_path = str(FILES_DIR / out_name)

        # Convert to int16 WAV
        audio_int16 = (np.clip(full_audio, -1, 1) * 32767).astype(np.int16)

        with wave.open(out_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(24000)  # Kokoro outputs at 24kHz
            wav_file.writeframes(audio_int16.tobytes())

        # Convert to MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
        mp3_path = convert_wav_to_mp3(out_path)

        genbus.finish(gen_id, {"audio_path": out_path, "audio_path_mp3": mp3_path})
        logger.info(f"[Kokoro] Generated audio: {out_path} (MP3: {mp3_path})")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "audio_path_mp3": mp3_path,
            "model": "kokoro",
            "voice": voice,
            "gender": KOKORO_VOICES[voice]["gender"],
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
            "duration_seconds": timing["duration_seconds"],
            "narration_seconds": timing["narration_seconds"],
            "requested_duration_seconds": timing["requested_duration_seconds"],
            "caption_segments": timing["caption_segments"],
        }), 201

    except Exception as e:
        logger.exception("Kokoro TTS failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


# =============================================================================
# REST API: CHATTERBOX MULTILINGUAL V3 - QUALITY TTS & VOICE CLONING
# =============================================================================

# Model caches
_chatterbox_tts = None
_chatterbox_tts_lock = threading.Lock()

# Voice prompt cache for reusing designed voices
_voice_prompt_cache = {}
_VOICE_CACHE_MAX = 100


def _voice_cache_evict():
    """Evict oldest entry if cache is at capacity."""
    if len(_voice_prompt_cache) >= _VOICE_CACHE_MAX:
        oldest_key = next(iter(_voice_prompt_cache))
        del _voice_prompt_cache[oldest_key]


_CHATTERBOX_LANGUAGE_CODES = {
    "arabic": "ar", "danish": "da", "german": "de", "greek": "el",
    "english": "en", "spanish": "es", "finnish": "fi", "french": "fr",
    "hebrew": "he", "hindi": "hi", "italian": "it", "japanese": "ja",
    "korean": "ko", "malay": "ms", "dutch": "nl", "norwegian": "no",
    "polish": "pl", "portuguese": "pt", "russian": "ru", "swedish": "sv",
    "swahili": "sw", "turkish": "tr", "chinese": "zh",
}


def _chatterbox_language_code(language):
    value = (language or "en").strip().lower()
    code = _CHATTERBOX_LANGUAGE_CODES.get(value, value.split("-")[0])
    return code if code in set(_CHATTERBOX_LANGUAGE_CODES.values()) else "en"


class _ChatterboxAdapter:
    """Preserve BonzAI's established route contract on Chatterbox V3."""

    def __init__(self, model):
        self.model = model
        self.sr = int(model.sr)

    @staticmethod
    def _numpy_audio(audio):
        if torch.is_tensor(audio):
            audio = audio.detach().float().cpu().numpy()
        return np.asarray(audio, dtype=np.float32).squeeze()

    def create_voice_clone_prompt(self, ref_audio, ref_text=None):
        audio, sample_rate = ref_audio
        audio = self._numpy_audio(audio)
        digest = hashlib.sha256(audio.tobytes()).hexdigest()[:20]
        path = FILES_DIR / f"chatterbox_voice_{digest}.wav"
        if not path.exists():
            import soundfile as sf
            sf.write(path, audio, int(sample_rate))
        return str(path)

    def generate_voice_clone(self, text, language, voice_clone_prompt):
        audio = self.model.generate(
            text,
            language_id=_chatterbox_language_code(language),
            audio_prompt_path=str(voice_clone_prompt),
        )
        return [self._numpy_audio(audio)], self.sr

    def generate_voice_design(self, text, language, instruct):
        # Chatterbox is a cloning model. Seed its clone with a deterministic
        # Kokoro speaker selected from the requested persona description.
        # This retains BonzAI's useful voice-design route without a second
        # heavyweight text model or a vendor-specific prompt format.
        description = (instruct or "").lower()
        gender = "male" if re.search(r"\b(male|man|masculine)\b", description) else "female"
        candidates = [name for name, meta in KOKORO_VOICES.items() if meta["gender"] == gender]
        voice = candidates[int(hashlib.sha256(description.encode()).hexdigest(), 16) % len(candidates)]
        pipeline = _load_kokoro_pipeline()
        seed_text = text if _chatterbox_language_code(language) == "en" else (
            "Hello, this is my natural speaking voice. It is wonderful to meet you."
        )
        seed_segments = [segment for _, _, segment in pipeline(seed_text, voice=voice, speed=1.0)]
        if not seed_segments:
            raise RuntimeError("Kokoro did not produce a persona seed")
        seed = np.concatenate(seed_segments).astype(np.float32)
        prompt_path = self.create_voice_clone_prompt((seed, 24000), text)
        return self.generate_voice_clone(text, language, prompt_path)


def _load_chatterbox_tts():
    """Load Chatterbox Multilingual V3 strictly from BonzAI's model store."""
    global _chatterbox_tts
    with _chatterbox_tts_lock:
        if _chatterbox_tts is not None:
            return _chatterbox_tts

        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from chatterbox.models.tokenizers import tokenizer as chatterbox_tokenizer

        local_dir = repo_local_dir(CHATTERBOX_REPO)
        if not local_dir.exists():
            raise RuntimeError(f"Chatterbox model is missing at {local_dir}; download audio_quality first")
        device = DeviceManager.get_device()
        device_name = device.type
        logger.info("[Chatterbox] Loading Multilingual V3 on %s", device_name)
        # Upstream's Chinese normalizer calls hf_hub_download even when the
        # model itself is loaded from a local directory. Route that lookup to
        # the file already verified by BonzAI's downloader so inference stays
        # offline after prefetch.
        original_hf_download = chatterbox_tokenizer.hf_hub_download
        chatterbox_tokenizer.hf_hub_download = (
            lambda repo_id, filename, **kwargs: str(local_dir / filename)
        )
        try:
            model = ChatterboxMultilingualTTS.from_local(
                local_dir,
                device_name,
                t3_model=CHATTERBOX_T3_MODEL,
            )
        finally:
            chatterbox_tokenizer.hf_hub_download = original_hf_download
        _chatterbox_tts = _ChatterboxAdapter(model)
        logger.info("[Chatterbox] Multilingual V3 loaded")
        return _chatterbox_tts


@app.route("/audio/quality/design", methods=["POST"])
def audio_quality_design():
    """
    Create a reusable persona voice with Chatterbox Multilingual V3.

    Creates a reference audio that can be used for voice cloning.

    Request body:
    {
        "text": "Sample text for the voice to speak",
        "instruct": "Voice description (age, gender, style, emotion)",
        "language": "English" (default),
        "voice_id": "unique_id" (optional, for caching the voice prompt),
        "auto_download": false
    }

    Returns:
    {
        "audio_path": "/path/to/designed_voice.wav",
        "voice_id": "unique_id",
        "voice_prompt_cached": true/false
    }
    """
    data = request.get_json(silent=True) or {}

    text = (data.get("text") or "").strip()
    instruct = (data.get("instruct") or "").strip()
    language = (data.get("language") or "English").strip()
    voice_id = (data.get("voice_id") or "").strip()
    auto_dl = bool(data.get("auto_download", False))

    if not text:
        return jsonify({"error": "Missing 'text' - sample text for the voice"}), 400
    if not instruct:
        return jsonify({"error": "Missing 'instruct' - voice description"}), 400

    # Generate voice_id if not provided
    if not voice_id:
        voice_id = hashlib.md5(f"{instruct}:{text}".encode()).hexdigest()[:12]

    # Check if required files are present
    guard = _ensure_files_present_or_start("audio_quality_design", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("chatterbox_design", {"endpoint": "/audio/quality/design", "voice_id": voice_id})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 4)

        model = _load_chatterbox_tts()

        genbus.progress(gen_id, "designing voice", 1, 4)

        # Generate voice design
        wavs, sr = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )

        genbus.progress(gen_id, "creating voice prompt", 2, 4)

        # Save the designed voice
        out_name = f"voice_design_{voice_id}_{int(time.time())}.wav"
        out_path = str(FILES_DIR / out_name)

        import soundfile as sf
        sf.write(out_path, wavs[0], sr)

        # Create and cache voice clone prompt for reuse
        base_model = _load_chatterbox_tts()
        voice_prompt = base_model.create_voice_clone_prompt(
            ref_audio=(wavs[0], sr),
            ref_text=text,
        )
        _voice_cache_evict()
        _voice_prompt_cache[voice_id] = {
            "prompt": voice_prompt,
            "ref_audio_path": out_path,
            "ref_text": text,
            "instruct": instruct,
            "created_at": time.time(),
        }

        # Convert to MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
        mp3_path = convert_wav_to_mp3(out_path)

        genbus.progress(gen_id, "complete", 3, 4)
        genbus.finish(gen_id, {"audio_path": out_path, "audio_path_mp3": mp3_path, "voice_id": voice_id})

        logger.info(f"[Chatterbox] Voice designed: {out_path} (MP3: {mp3_path}, voice_id: {voice_id})")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "audio_path_mp3": mp3_path,
            "voice_id": voice_id,
            "voice_prompt_cached": True,
            "model": "chatterbox-multilingual-v3",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Chatterbox voice design failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/quality/clone", methods=["POST"])
def audio_quality_clone():
    """
    Generate speech with Chatterbox Multilingual V3 voice cloning.

    Uses a previously designed voice or a reference audio.

    Request body:
    {
        "text": "Text to synthesize",
        "voice_id": "unique_id" (use cached voice prompt),
        OR
        "ref_audio_base64": "base64_audio" (reference audio),
        "ref_text": "What the reference audio says",
        "language": "English" (default),
        "auto_download": false
    }
    """
    data = request.get_json(silent=True) or {}

    text = (data.get("text") or "").strip()
    voice_id = (data.get("voice_id") or "").strip()
    ref_audio_b64 = (data.get("ref_audio_base64") or "").strip()
    ref_audio_path = (data.get("ref_audio_path") or "").strip()
    ref_text = (data.get("ref_text") or "").strip()
    language = (data.get("language") or "English").strip()
    auto_dl = bool(data.get("auto_download", False))

    if not text:
        return jsonify({"error": "Missing 'text' to synthesize"}), 400

    # Need either voice_id or ref_audio
    if not voice_id and not ref_audio_b64 and not ref_audio_path:
        return jsonify({"error": "Missing voice reference. Provide 'voice_id' or 'ref_audio_base64'/'ref_audio_path'"}), 400

    # Check if required files are present
    guard = _ensure_files_present_or_start("audio_quality_clone", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("chatterbox_clone", {"endpoint": "/audio/quality/clone", "voice_id": voice_id or "custom"})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 4)

        model = _load_chatterbox_tts()

        genbus.progress(gen_id, "preparing voice", 1, 4)

        voice_prompt = None

        # Try to get cached voice prompt
        if voice_id and voice_id in _voice_prompt_cache:
            voice_prompt = _voice_prompt_cache[voice_id]["prompt"]
            logger.info(f"[Chatterbox] Using cached voice prompt: {voice_id}")
        elif ref_audio_b64 or ref_audio_path:
            # Create voice prompt from reference audio
            if ref_audio_b64:
                # Decode base64 audio
                temp_ref = str(FILES_DIR / f"_ref_{int(time.time())}.wav")
                audio_data = base64.b64decode(ref_audio_b64)
                with open(temp_ref, "wb") as f:
                    f.write(audio_data)
                ref_audio_path = temp_ref

            if not ref_text:
                return jsonify({"error": "Missing 'ref_text' - what the reference audio says"}), 400

            import soundfile as sf
            ref_audio, sr = sf.read(ref_audio_path)
            if len(ref_audio) / float(sr) < 0.5:
                message = "Reference audio must be at least 0.5 seconds long"
                genbus.error(gen_id, message)
                return jsonify({"error": message}), 400
            voice_prompt = model.create_voice_clone_prompt(
                ref_audio=(ref_audio, sr),
                ref_text=ref_text,
            )

            # Cache if voice_id provided
            if voice_id:
                _voice_cache_evict()
                _voice_prompt_cache[voice_id] = {
                    "prompt": voice_prompt,
                    "ref_audio_path": ref_audio_path,
                    "ref_text": ref_text,
                    "created_at": time.time(),
                }
        else:
            return jsonify({"error": f"Voice '{voice_id}' not found in cache. Design it first or provide ref_audio."}), 404

        genbus.progress(gen_id, "generating speech", 2, 4)

        # Generate cloned speech
        wavs, sr = model.generate_voice_clone(
            text=text,
            language=language,
            voice_clone_prompt=voice_prompt,
        )

        genbus.progress(gen_id, "saving", 3, 4)

        # Save output
        out_name = f"clone_{voice_id or 'custom'}_{int(time.time())}_{gen_id[:8]}.wav"
        out_path = str(FILES_DIR / out_name)

        import soundfile as sf
        sf.write(out_path, wavs[0], sr)

        # Convert to MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
        mp3_path = convert_wav_to_mp3(out_path)

        genbus.finish(gen_id, {"audio_path": out_path, "audio_path_mp3": mp3_path})
        logger.info(f"[Chatterbox] Voice cloned: {out_path} (MP3: {mp3_path})")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "audio_path_mp3": mp3_path,
            "voice_id": voice_id or None,
            "model": "chatterbox-multilingual-v3",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Chatterbox voice cloning failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/quality/persona", methods=["POST"])
def audio_quality_persona():
    """
    Create a persona voice and generate speech in one call.

    Combines VoiceDesign + Clone: designs a voice from description,
    then uses it to generate the requested speech.

    Request body:
    {
        "text": "Text to synthesize",
        "persona": {
            "voice_id": "unique_persona_id",
            "instruct": "Voice description (age, gender, style)",
            "sample_text": "Sample text for voice design" (optional),
            "restore_sample": "base64 audio to restore voice from" (optional)
        },
        "language": "English" (default),
        "force_redesign": false (recreate voice even if cached),
        "return_sample": false (return the voice sample as base64),
        "auto_download": false
    }

    Voice Persistence:
    - If restore_sample is provided, the voice will be recreated from that sample
    - If return_sample is true, the response includes voice_sample_base64
    - Clients should store voice_sample_base64 and send it as restore_sample to restore voice
    """
    data = request.get_json(silent=True) or {}

    text = (data.get("text") or "").strip()
    persona = data.get("persona") or {}
    language = (data.get("language") or "English").strip()
    force_redesign = bool(data.get("force_redesign", False))
    return_sample = bool(data.get("return_sample", False))
    auto_dl = bool(data.get("auto_download", False))

    if not text:
        return jsonify({"error": "Missing 'text' to synthesize"}), 400

    voice_id = (persona.get("voice_id") or "").strip()
    instruct = (persona.get("instruct") or "").strip()
    sample_text = (persona.get("sample_text") or "").strip()
    restore_sample = (persona.get("restore_sample") or "").strip()

    if not voice_id:
        return jsonify({"error": "Missing 'persona.voice_id'"}), 400
    if not instruct and not restore_sample and voice_id not in _voice_prompt_cache:
        return jsonify({"error": "Missing 'persona.instruct' for new persona"}), 400

    # Check if required files are present (both models)
    guard = _ensure_files_present_or_start("audio_quality_persona", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("chatterbox_persona", {"endpoint": "/audio/quality/persona", "voice_id": voice_id})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 5)

        import soundfile as sf
        import base64
        import io

        # Check if we need to design/restore voice
        need_design = force_redesign or voice_id not in _voice_prompt_cache
        voice_restored = False
        ref_path = str(FILES_DIR / f"persona_{voice_id}_ref.wav")

        if need_design:
            # Option 1: Restore from provided sample (voice persistence)
            if restore_sample:
                genbus.progress(gen_id, "restoring voice", 1, 5)
                logger.info(f"[Chatterbox] Restoring voice from sample: {voice_id}")

                try:
                    # Decode base64 audio
                    if restore_sample.startswith("data:"):
                        # Handle data URL format
                        restore_sample = restore_sample.split(",", 1)[1]
                    audio_bytes = base64.b64decode(restore_sample)
                    audio_io = io.BytesIO(audio_bytes)

                    # Read the audio
                    wavs_restored, sr = sf.read(audio_io)
                    if len(wavs_restored.shape) > 1:
                        wavs_restored = wavs_restored[:, 0]  # Take first channel if stereo

                    # Save as reference
                    sf.write(ref_path, wavs_restored, sr)

                    genbus.progress(gen_id, "creating voice prompt", 2, 5)

                    # Create clone prompt from restored audio
                    clone_model = _load_chatterbox_tts()
                    voice_prompt = clone_model.create_voice_clone_prompt(
                        ref_audio=(wavs_restored, sr),
                        ref_text=sample_text or "Hello, this is my voice.",
                    )

                    # Cache the prompt
                    _voice_cache_evict()
                    _voice_prompt_cache[voice_id] = {
                        "prompt": voice_prompt,
                        "ref_audio_path": ref_path,
                        "ref_text": sample_text or "Restored voice sample",
                        "instruct": instruct or "Restored from sample",
                        "created_at": time.time(),
                    }
                    voice_restored = True
                    logger.info(f"[Chatterbox] Voice restored from sample: {voice_id}")

                except Exception as e:
                    logger.warning(f"[Chatterbox] Failed to restore voice from sample: {e}")
                    # Fall through to design new voice

            # Option 2: Design new voice from description
            if not voice_restored:
                if not instruct:
                    return jsonify({"error": f"Persona '{voice_id}' not cached. Provide 'persona.instruct' to design it."}), 400

                genbus.progress(gen_id, "designing voice", 1, 5)

                # Use sample_text or generate a reasonable sample
                if not sample_text:
                    sample_text = "Hello, this is my voice. I hope you like it."

                # Design the voice
                design_model = _load_chatterbox_tts()
                wavs, sr = design_model.generate_voice_design(
                    text=sample_text,
                    language=language,
                    instruct=instruct,
                )

                # Save reference audio
                sf.write(ref_path, wavs[0], sr)

                genbus.progress(gen_id, "creating voice prompt", 2, 5)

                # Create clone prompt
                clone_model = _load_chatterbox_tts()
                voice_prompt = clone_model.create_voice_clone_prompt(
                    ref_audio=(wavs[0], sr),
                    ref_text=sample_text,
                )

                # Cache the prompt
                _voice_cache_evict()
                _voice_prompt_cache[voice_id] = {
                    "prompt": voice_prompt,
                    "ref_audio_path": ref_path,
                    "ref_text": sample_text,
                    "instruct": instruct,
                    "created_at": time.time(),
                }

                logger.info(f"[Chatterbox] Persona voice designed: {voice_id}")
        else:
            genbus.progress(gen_id, "using cached voice", 1, 5)
            logger.info(f"[Chatterbox] Using cached persona: {voice_id}")

        genbus.progress(gen_id, "generating speech", 3, 5)

        # Generate speech with the persona voice
        clone_model = _load_chatterbox_tts()
        voice_prompt = _voice_prompt_cache[voice_id]["prompt"]

        wavs, sr = clone_model.generate_voice_clone(
            text=text,
            language=language,
            voice_clone_prompt=voice_prompt,
        )

        genbus.progress(gen_id, "saving", 4, 5)

        # Save output
        out_name = f"persona_{voice_id}_{int(time.time())}_{gen_id[:8]}.wav"
        out_path = str(FILES_DIR / out_name)

        sf.write(out_path, wavs[0], sr)

        # Convert to MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
        mp3_path = convert_wav_to_mp3(out_path)

        genbus.finish(gen_id, {"audio_path": out_path, "audio_path_mp3": mp3_path})
        logger.info(f"[Chatterbox] Persona speech: {out_path} (MP3: {mp3_path})")

        # Build response
        response_data = {
            "ok": True,
            "audio_path": out_path,
            "audio_path_mp3": mp3_path,
            "voice_id": voice_id,
            "voice_designed": need_design,
            "voice_restored": voice_restored if need_design else False,
            "model": "chatterbox-multilingual-v3",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }

        # Include voice sample for persistence if requested
        if return_sample and ref_path and os.path.exists(ref_path):
            try:
                with open(ref_path, "rb") as f:
                    audio_bytes = f.read()
                response_data["voice_sample_base64"] = base64.b64encode(audio_bytes).decode("utf-8")
                logger.info(f"[Chatterbox] Including voice sample in response for persistence")
            except Exception as e:
                logger.warning(f"[Chatterbox] Could not read voice sample: {e}")

        return jsonify(response_data), 201

    except Exception as e:
        logger.exception("Chatterbox persona generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/quality/voices", methods=["GET"])
def audio_quality_voices():
    """List cached voice prompts."""
    voices = {}
    for vid, data in _voice_prompt_cache.items():
        voices[vid] = {
            "voice_id": vid,
            "instruct": data.get("instruct"),
            "ref_text": data.get("ref_text"),
            "ref_audio_path": data.get("ref_audio_path"),
            "created_at": data.get("created_at"),
        }
    return jsonify({"voices": voices, "count": len(voices)}), 200


# =============================================================================
# ACE-STEP MUSIC GENERATION
# =============================================================================

def _load_ace_step_diffusers(offload_to_cpu=None):
    """Load the official ACE-Step 1.5 XL Turbo Diffusers pipeline."""
    global _ace_step_pipeline, _ace_step_offload
    with _ace_step_lock:
        from inference_memory import constrained
        requested_offload = constrained(DeviceManager.get_device()) if offload_to_cpu is None else bool(offload_to_cpu)
        if _ace_step_pipeline is not None and _ace_step_offload == requested_offload:
            return _ace_step_pipeline
        if _ace_step_pipeline is not None:
            _ace_step_pipeline = None
            _ace_step_offload = None
            gc.collect()
            DeviceManager.free_memory()

        from diffusers import AceStepPipeline

        local_dir = repo_local_dir(ACE_STEP_REPO)
        if not local_dir.exists():
            raise RuntimeError(f"ACE-Step model is missing at {local_dir}; download music first")

        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32
        logger.info("[ACE-Step] Loading official Diffusers pipeline on %s", device)
        pipe = AceStepPipeline.from_pretrained(
            local_dir,
            dtype=dtype,
            local_files_only=True,
            low_cpu_mem_usage=True,
        )
        if requested_offload and device.type in ("cuda", "mps"):
            pipe.enable_model_cpu_offload(device=device)
        else:
            pipe.to(device)
        _ace_step_pipeline = pipe
        _ace_step_offload = requested_offload
        logger.info("[ACE-Step] Official Diffusers pipeline loaded")
        return pipe


@app.route("/audio/music", methods=["POST"])
def audio_music():
    """
    Generate music using the official ACE-Step v1.5 XL Turbo Diffusers pipeline.

    Parameters:
        prompt (str): Caption / genre-style tags (e.g. "pop rock, energetic, electric guitar")
        lyrics (str, optional): Song lyrics with [verse]/[chorus] markers
        duration (int): Duration in seconds (10-600, default 60)
        steps (int): Inference steps (1-8 for turbo, default 8)
        guidance_scale (float): Accepted for compatibility; XL Turbo is guidance-distilled.
        seed (int): Random seed (-1 for random, default -1)
        bpm (int, optional): Tempo 30-300
        keyscale (str, optional): Musical key e.g. "C minor"
        time_signature (str, optional): Time signature e.g. "4/4", "3/4" (included in caption)
        shift (float, optional): Noise schedule shift (1.0-10.0, default 3.0)
        instrumental (bool): Force instrumental, no vocals (default false)
        vocal_language (str): ISO language code (default "en")
        semantic (bool): Accepted for compatibility; the official pipeline uses DiT conditioning.
        auto_download (bool): Auto-download model if missing (default false)
    """
    data = request.get_json(force=True, silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    # Keep the old fields accepted so persisted jobs remain valid. The official
    # Diffusers release currently exposes one XL Turbo checkpoint.
    quality = (data.get("quality") or "fast").strip().lower()
    if quality not in ("fast", "quality"):
        quality = "fast"
    lyrics = (data.get("lyrics") or "").strip() or ""
    duration = max(10, min(600, int(data.get("duration", 60))))
    steps = max(1, min(8, int(data.get("steps", 8))))
    guidance_scale = float(data.get("guidance_scale", 7.0))
    seed = int(data.get("seed", -1))
    shift = max(1.0, min(10.0, float(data.get("shift", 3.0))))
    bpm = data.get("bpm")
    if bpm is not None:
        bpm = max(30, min(300, int(bpm)))
    keyscale = (data.get("keyscale") or "").strip()
    time_signature = (data.get("time_signature") or "").strip()
    instrumental = bool(data.get("instrumental", False))
    vocal_language = (data.get("vocal_language") or "en").strip()
    semantic = bool(data.get("semantic", False))
    offload_to_cpu = bool(data["offload"]) if "offload" in data else None  # Adaptive placement by default
    auto_dl = bool(data.get("auto_download", False))

    if semantic:
        logger.info("[ACE-Step] Semantic mode is unavailable in the official Diffusers pipeline; using DiT conditioning")
        semantic = False

    # Append time signature to caption if provided (ACE-Step uses it as a style tag)
    if time_signature and time_signature not in prompt:
        prompt = f"{prompt}, {time_signature} time"

    # Log all music generation parameters for debugging
    logger.info(f"[ACE-Step] Music generation params: quality={quality}, offload={offload_to_cpu}, steps={steps}, duration={duration}, bpm={bpm}, "
                f"guidance={guidance_scale}, seed={seed}, shift={shift}, instrumental={instrumental}, "
                f"keyscale={keyscale}, vocal_language={vocal_language}, semantic={semantic}")

    # Ensure model files are present
    guard = _ensure_files_present_or_start("music", auto_download=auto_dl)
    if guard is not None:
        return guard

    gen_id = genbus.new("ace_step_music", {"endpoint": "/audio/music", "prompt": prompt[:100]})

    try:
        gc.collect()
        DeviceManager.free_memory()

        pipe = _load_ace_step_diffusers(offload_to_cpu=offload_to_cpu)

        import random as _rng
        actual_seed = seed if seed >= 0 else _rng.randint(0, 2**31 - 1)

        genbus.progress(gen_id, "generating (ACE-Step XL Turbo)", 2, 10)
        generator_device = "cpu" if DeviceManager.get_device().type == "mps" else DeviceManager.get_device().type
        generator = torch.Generator(device=generator_device).manual_seed(actual_seed)
        result = pipe(
            prompt=prompt,
            lyrics="" if instrumental else lyrics,
            audio_duration=float(duration),
            vocal_language=vocal_language,
            num_inference_steps=steps,
            guidance_scale=1.0,
            shift=shift,
            generator=generator,
            bpm=bpm,
            keyscale=keyscale or None,
            timesignature=(time_signature.split("/")[0] if time_signature else None),
        )

        audio = result.audios[0]
        if torch.is_tensor(audio):
            audio = audio.detach().float().cpu().numpy()
        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim == 2:
            audio = audio.T
        if audio.size == 0 or not np.isfinite(audio).all():
            raise RuntimeError("ACE-Step returned invalid audio")
        audio_path = str(FILES_DIR / f"ace_step_{int(time.time())}_{gen_id[:8]}.wav")
        import soundfile as sf
        sf.write(audio_path, audio, int(pipe.sample_rate))

        # Convert to MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
        # Use higher bitrate for music quality
        mp3_path = convert_wav_to_mp3(audio_path, bitrate="192k")

        genbus.finish(gen_id, {"audio_path": audio_path, "audio_path_mp3": mp3_path})

        return jsonify(_json_sanitize({
            "ok": True,
            "audio_path": audio_path,
            "audio_path_mp3": mp3_path,
            "duration": duration,
            "seed": actual_seed,
            "semantic": semantic,
            "model": "ace-step-v1.5-xl-turbo-diffusers",
        })), 201

    except Exception as e:
        logger.exception("ACE-Step v1.5 music generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/info", methods=["GET"])
def audio_info():
    '''Audio model capabilities.'''
    return jsonify({
        "models": {
            "turbo": {
                "name": "Kokoro TTS",
                "endpoint": "/audio/turbo",
                "voices": KOKORO_VOICES,
                "default_voices": KOKORO_DEFAULT_VOICE,
                "features": ["fast_inference", "multiple_voices", "gender_selection", "speed_control"],
                "requires_voice_reference": False,
            },
            "quality_design": {
                "name": "Chatterbox Multilingual V3 Voice Design",
                "endpoint": "/audio/quality/design",
                "features": ["voice_design_from_description", "high_quality", "expressive"],
                "requires_voice_reference": False,
                "description": "Create a voice from text description (age, gender, style)",
            },
            "quality_clone": {
                "name": "Chatterbox Multilingual V3 Clone",
                "endpoint": "/audio/quality/clone",
                "features": ["voice_cloning", "high_quality", "reusable_voice_prompts"],
                "requires_voice_reference": True,
                "description": "Clone speech from a reference audio or cached voice",
            },
            "quality_persona": {
                "name": "Chatterbox Multilingual V3 Persona",
                "endpoint": "/audio/quality/persona",
                "features": ["voice_design", "voice_cloning", "persona_caching", "high_quality"],
                "requires_voice_reference": False,
                "description": "Design a persona voice and generate speech (combines design + clone)",
            },
            "music": {
                "name": "ACE-Step v1.5 Music (Turbo)",
                "endpoint": "/audio/music",
                "features": ["music_generation", "lyrics_support", "genre_tags", "bpm_control", "key_control", "instrumental"],
                "duration_range": [10, 600],
                "steps_range": [1, 8],
                "description": "Official Diffusers ACE-Step 1.5 XL Turbo music generation at 48 kHz.",
            },
        },
        "cached_voices": list(_voice_prompt_cache.keys()),
        "note": "Turbo uses Kokoro; quality speech and voice cloning use Chatterbox Multilingual V3.",
    }), 200

# =============================================================================
# REST API: LTX-2 VIDEO (GGUF) - Text-to-Video and Image-to-Video
# =============================================================================

def _finger_frame_source(data: Dict[str, Any]) -> Tuple[str, bool]:
    if data.get("source_path"):
        return validate_video_path(str(data["source_path"])), False
    if data.get("video_base64"):
        return materialize_uploaded_video(str(data["video_base64"])), True
    raise ValueError("Provide 'source_path' or 'video_base64'")


@app.route("/workflows/finger-frame/analyze", methods=["POST"])
def finger_frame_analyze():
    """Validate the gesture and extract the local video-generation keyframe."""
    data = request.get_json(force=True) or {}
    gen_id = genbus.new("finger_frame_analysis")
    source_path = None
    temporary = False
    try:
        source_path, temporary = _finger_frame_source(data)
        result = analyze_finger_frame_video(
            source_path,
            lambda stage, step, total: genbus.progress(gen_id, stage, step, total),
        )
        result.update({"generation_id": gen_id, "source_path": source_path})
        # Uploaded browser files must survive until the composite request.
        temporary = False
        genbus.finish(gen_id, result)
        return jsonify(result)
    except (ValueError, RuntimeError) as exc:
        genbus.error(gen_id, str(exc))
        return jsonify({"error": str(exc), "generation_id": gen_id}), 422
    except Exception as exc:
        logger.exception("[Finger Frame] Analysis failed")
        genbus.error(gen_id, str(exc))
        return jsonify({"error": str(exc), "generation_id": gen_id}), 500
    finally:
        if temporary and source_path:
            Path(source_path).unlink(missing_ok=True)


@app.route("/workflows/finger-frame/composite", methods=["POST"])
def finger_frame_composite():
    """Project a generated BonzAI clip into the tracked hand-frame window."""
    data = request.get_json(force=True) or {}
    gen_id = genbus.new("finger_frame_composite")
    try:
        source_path, _ = _finger_frame_source(data)
        generated_path = validate_video_path(str(data.get("generated_path") or ""))
        output_path = str(FILES_DIR / f"finger_frame_{gen_id}.mp4")
        result = composite_finger_frame_video(
            source_path,
            generated_path,
            output_path,
            get_ffmpeg_binary_path(),
            lambda stage, step, total: genbus.progress(gen_id, stage, step, total),
        )
        result["generation_id"] = gen_id
        genbus.finish(gen_id, result)
        return jsonify(result)
    except (ValueError, RuntimeError) as exc:
        genbus.error(gen_id, str(exc))
        return jsonify({"error": str(exc), "generation_id": gen_id}), 422
    except Exception as exc:
        logger.exception("[Finger Frame] Composite failed")
        genbus.error(gen_id, str(exc))
        return jsonify({"error": str(exc), "generation_id": gen_id}), 500


@app.route("/video", methods=["POST"])
def ltx2_gguf_video():
    """
    LTX-2 (19B DiT) Video generation using distilled Q3_K_S GGUF quantization.

    Supports two modes:
    - "t2v" (text-to-video): Generate video from text prompt only
    - "i2v" (image-to-video): Generate video from image + text prompt

    Audio Conditioning (Companion Voice Sync):
    - Optionally provide "audio_base64" (WAV format) for voice-synced video
    - Audio is encoded to latents for bidirectional cross-attention (motion/lip sync hints)
    - The ORIGINAL audio is muxed into the final video (preserves companion's TTS voice)
    - LTX-2's generated audio is discarded when custom audio is provided
    - Audio will be resampled to 24kHz and trimmed/padded to match video duration

    Uses from_single_file to load the GGUF-quantized transformer directly.
    Distilled model works best with 8-10 steps and CFG=1.
    """
    data = request.get_json(force=True) or {}

    benchmark_repo = str(repo_local_dir(LTX2_REPO)) if data.get("_benchmark") is True else LTX2_REPO
    mode = (data.get("mode") or "i2v").strip().lower()  # "t2v" or "i2v"
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip() or "worst quality, inconsistent motion, blurry, jittery, distorted"
    H = int(data.get("height", 512))
    W = int(data.get("width", 768))
    frames_count = int(data.get("frames", 97))  # LTX-2 frames must be 8n+1
    frame_rate = float(data.get("frame_rate", 24.0))
    steps = int(data.get("steps", 8))  # Distilled model: 8-10 steps optimal
    guidance = float(data.get("guidance_scale", 1.0))  # Distilled model: CFG=1
    seed = data.get("seed")
    auto_dl = bool(data.get("auto_download", False))
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    # Audio conditioning - provide custom audio to sync with generated video
    audio_b64 = (data.get("audio_base64") or "").strip()

    _mps_clear_memory()

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400

    # For I2V mode, require an image
    if mode == "i2v" and not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url' for image-to-video mode"}), 400

    guard = _ensure_files_present_or_start("ltx2_video_gguf", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("ltx2_video", {
        "endpoint": "/video", "mode": mode, "w": W, "h": H, "frames": frames_count,
    })

    # Check if we should run in offline mode
    _ltx_offline = _is_pipeline_complete("ltx2_video_gguf")
    _ltx_old_hf_offline = os.environ.get("HF_HUB_OFFLINE")
    _ltx_old_transformers_offline = os.environ.get("TRANSFORMERS_OFFLINE")
    if _ltx_offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        logger.info("[LTX-2 GGUF] Running in offline mode")

    pipe = None

    try:
        device = DeviceManager.get_device()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        if device.type == "mps":
            os.environ["DIFFUSERS_ATTENTION_BACKEND"] = "eager"
            # Allow PyTorch MPS to use swap when GPU memory is full (prevents OOM crash)
            os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

        # Select dtype based on device
        # Note: MPS needs bfloat16 to avoid black screen (float16 causes NaN)
        if device.type == "cuda":
            model_dtype = torch.bfloat16
        elif device.type == "mps":
            model_dtype = torch.bfloat16  # bfloat16 avoids black screen issue
        else:
            model_dtype = torch.float32

        genbus.progress(gen_id, "loading", 1, 4)

        # Normalize dimensions (LTX-2 requires width/height divisible by 32)
        # Minimum 256x256 to avoid VAE decode issues with very small latents
        mod = 32
        min_dim = 256
        H = max(min_dim, (H // mod) * mod)
        W = max(min_dim, (W // mod) * mod)

        pil_image = None
        if mode == "i2v":
            # Load source image for I2V mode
            if image_url:
                pil_image = load_image(image_url).convert("RGB")
            else:
                pil_image = Image.open(io.BytesIO(_decode_image_base64(image_b64))).convert("RGB")

            # Resize image preserving aspect ratio (cover and center crop)
            src_w, src_h = pil_image.size
            scale = max(W / src_w, H / src_h)  # Scale to cover target area
            new_w = int(src_w * scale)
            new_h = int(src_h * scale)
            resized = pil_image.resize((new_w, new_h), Image.LANCZOS)
            # Center crop to target dimensions
            crop_x = (new_w - W) // 2
            crop_y = (new_h - H) // 2
            pil_image = resized.crop((crop_x, crop_y, crop_x + W, crop_y + H))

            # Motion fix: light noise preprocessing to help video models generate motion
            import numpy as _np
            _arr = _np.asarray(pil_image.convert("RGB")).astype(_np.float32)
            _arr += _np.random.normal(scale=0.1, size=_arr.shape)
            _arr = _np.clip(_arr, 0, 255).astype(_np.uint8)
            pil_image = Image.fromarray(_arr, "RGB")

        logger.info(f"[LTX-2 GGUF] Generating {frames_count} frames @ {W}x{H}, {steps} steps, mode={mode}")

        # MPS: Patch RoPE classes to use float32 BEFORE any model loading (MPS doesn't support float64)
        if device.type == "mps":
            from diffusers.pipelines.ltx2.connectors import LTX2RotaryPosEmbed1d
            from diffusers.models.transformers.transformer_ltx2 import LTX2AudioVideoRotaryPosEmbed

            for cls in [LTX2RotaryPosEmbed1d, LTX2AudioVideoRotaryPosEmbed]:
                if not hasattr(cls, '_mps_patched'):
                    original_forward = cls.forward

                    def make_patched_forward(orig):
                        def patched_forward(self, *args, **kwargs):
                            self.double_precision = False
                            return orig(self, *args, **kwargs)
                        return patched_forward

                    cls.forward = make_patched_forward(original_forward)
                    cls._mps_patched = True

        genbus.progress(gen_id, "loading model", 2, 4)

        # Load transformer from GGUF with quantization config
        gguf_path = MODEL_DIR / LTX2_GGUF_NAME
        quantization_config = GGUFQuantizationConfig(compute_dtype=model_dtype)

        transformer = LTX2VideoTransformer3DModel.from_single_file(
            str(gguf_path),
            config=benchmark_repo,
            subfolder="transformer",
            quantization_config=quantization_config,
            torch_dtype=model_dtype,
        )

        # Load the appropriate pipeline based on mode
        if mode == "t2v":
            # Text-to-Video pipeline
            pipe = LTX2Pipeline.from_pretrained(
                benchmark_repo,
                transformer=transformer,
                torch_dtype=model_dtype,
                low_cpu_mem_usage=False,
            )
        else:
            # Image-to-Video pipeline
            pipe = LTX2ImageToVideoPipeline.from_pretrained(
                benchmark_repo,
                transformer=transformer,
                torch_dtype=model_dtype,
                low_cpu_mem_usage=False,
            )

            # Load I2V Adapter LoRA for better image-to-video quality
            try:
                logger.info("[LTX-2 GGUF] Loading I2V Adapter LoRA...")
                pipe.load_lora_weights(
                    LTX2_I2V_LORA_REPO,
                    weight_name=LTX2_I2V_LORA_FILENAME,
                )
                logger.info("[LTX-2 GGUF] I2V Adapter LoRA loaded successfully")
            except Exception as e:
                logger.warning(f"[LTX-2 GGUF] Failed to load I2V LoRA (continuing without it): {e}")

        # Enable memory optimizations
        # Newer diffusers loads sub-models (VAE) on meta device via low_cpu_mem_usage;
        # enable_model_cpu_offload() calls .to("cpu") which crashes on meta tensors.
        # Fix: reload any component stuck on meta device before enabling offload.
        for attr_name in ["vae", "text_encoder"]:
            component = getattr(pipe, attr_name, None)
            if component is not None and hasattr(component, "parameters"):
                if any(p.device.type == "meta" for p in component.parameters()):
                    logger.info(f"[LTX-2 GGUF] Reloading {attr_name} to fix meta tensors")
                    reloaded = type(component).from_pretrained(
                        benchmark_repo, subfolder=attr_name, torch_dtype=model_dtype, low_cpu_mem_usage=False,
                    )
                    setattr(pipe, attr_name, reloaded)

        # Leaf placement lets packed GGUF projections manage their own row
        # transfers; block placement would copy their entire packed weights.
        from diffusers.hooks import apply_group_offloading
        if device.type != "cpu":
            for component_name in ("transformer", "text_encoder", "connectors", "audio_vae", "vocoder"):
                component = getattr(pipe, component_name, None)
                if isinstance(component, torch.nn.Module):
                    apply_group_offloading(component, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        from inference_memory import bound_gguf_layers, release_on_first_forward, release_before_decode, release_video_decoder_before_audio
        bound_gguf_layers(pipe.transformer, device, MODEL_DIR / LTX2_GGUF_NAME)
        release_on_first_forward(pipe, ("text_encoder", "prompt_enhancer"), device)
        release_before_decode(pipe, ("transformer",), device)
        release_video_decoder_before_audio(pipe, device)
        transformer = None
        pipe.vae.to(device)

        # Enable tiling for high resolutions (720p+ = ~900K pixels)
        # Tiling causes padding errors when latent dimensions are too small
        # Safe resolutions: 640x448, 1280x704, 1920x1088 (latents divide evenly)
        total_pixels = H * W
        if total_pixels >= 900_000:  # ~720p threshold
            pipe.vae.enable_tiling()
            logger.info(f"[LTX-2 GGUF] VAE tiling enabled for {W}x{H} ({total_pixels:,} px)")
        else:
            logger.info(f"[LTX-2 GGUF] VAE tiling disabled for {W}x{H} ({total_pixels:,} px)")

        genbus.progress(gen_id, "generating", 3, 4)

        # Set up generator for reproducibility
        if seed is not None:
            generator = torch.Generator(device="cpu").manual_seed(int(seed))
        else:
            generator = None

        # Encode custom audio to latents if provided
        audio_latents = None
        if audio_b64:
            try:
                logger.info("[LTX-2 GGUF] Encoding custom audio for conditioning...")
                audio_data = base64.b64decode(audio_b64)
                target_duration = frames_count / frame_rate
                audio_latents = _encode_audio_to_latents(
                    audio_data=audio_data,
                    pipe=pipe,
                    target_duration=target_duration,
                    device=device,
                    dtype=model_dtype,
                )
                logger.info(f"[LTX-2 GGUF] Custom audio encoded, latents shape: {audio_latents.shape}")
            except Exception as e:
                logger.warning(f"[LTX-2 GGUF] Failed to encode custom audio (continuing without it): {e}")
                audio_latents = None

        # Free cached MPS memory before generation to avoid OOM during encode_prompt
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
            gc.collect()

        # Generate video with audio
        if mode == "t2v":
            # Text-to-Video: no image input
            video, audio = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                height=H,
                width=W,
                num_frames=frames_count,
                frame_rate=frame_rate,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
                audio_latents=audio_latents,  # Custom audio conditioning
                decode_timestep=0.05,
                output_type="np",
                return_dict=False,
            )
        else:
            # Image-to-Video: with image input
            video, audio = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=pil_image,
                height=H,
                width=W,
                num_frames=frames_count,
                frame_rate=frame_rate,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
                audio_latents=audio_latents,  # Custom audio conditioning
                decode_timestep=0.05,  # Motion fix: lower decode_timestep improves motion
                output_type="np",
                return_dict=False,
            )

        # Convert video to uint8
        import numpy as np
        from inference_memory import video_to_uint8
        video = video_to_uint8(video)

        # Convert video to tensor for encoding
        video = torch.from_numpy(video)

        # Save video with audio using encode_video
        from diffusers.pipelines.ltx2.export_utils import encode_video
        files_dir = MODEL_DIR / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(files_dir / f"ltx2_{mode}_{gen_id}.mp4")

        # Determine which audio to use:
        # - If custom audio was provided (audio_b64), use it instead of LTX-2's generated audio
        # - This allows the companion's TTS voice to be in the final video
        final_audio = None
        final_audio_sr = 24000

        if audio_b64:
            # Use the original custom audio (companion's TTS voice)
            logger.info("[LTX-2 GGUF] Using custom TTS audio instead of generated audio")
            try:
                import soundfile as sf
                audio_data = base64.b64decode(audio_b64)
                audio_buffer = io.BytesIO(audio_data)
                custom_audio, custom_sr = sf.read(audio_buffer, dtype='float32')

                # Convert to mono if stereo
                if custom_audio.ndim > 1:
                    custom_audio = custom_audio.mean(axis=1)

                # Convert to tensor
                final_audio = torch.from_numpy(custom_audio).unsqueeze(0)
                final_audio_sr = custom_sr
                logger.info(f"[LTX-2 GGUF] Custom audio: {len(custom_audio)} samples @ {custom_sr}Hz")
            except Exception as e:
                logger.warning(f"[LTX-2 GGUF] Failed to load custom audio, using generated: {e}")
                final_audio = audio[0].float().cpu() if audio is not None else None
                if hasattr(pipe, 'vocoder') and hasattr(pipe.vocoder, 'config'):
                    final_audio_sr = getattr(pipe.vocoder.config, 'output_sampling_rate', 24000)
        else:
            # Use LTX-2's generated audio
            final_audio = audio[0].float().cpu() if audio is not None else None
            if hasattr(pipe, 'vocoder') and hasattr(pipe.vocoder, 'config'):
                final_audio_sr = getattr(pipe.vocoder.config, 'output_sampling_rate', 24000)

        encode_video(
            video[0],
            fps=frame_rate,
            audio=final_audio,
            audio_sample_rate=final_audio_sr,
            output_path=out_path,
        )

        genbus.progress(gen_id, "complete", 4, 4)
        genbus.finish(gen_id, {"video_path": out_path})

        logger.info(f"[LTX-2 GGUF] Video saved to {out_path}")

        return jsonify({
            "generation_id": gen_id,
            "video_path": out_path,
            "mode": mode,
            "frames": frames_count,
            "fps": frame_rate,
            "width": W,
            "height": H,
            "audio_conditioned": audio_latents is not None,
            "custom_audio_used": bool(audio_b64),  # True if companion's TTS voice is in the video
        })

    except Exception as e:
        logger.exception("[LTX-2 GGUF] Generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500

    finally:
        # Cleanup
        if pipe is not None:
            del pipe
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        # Restore offline mode
        if _ltx_old_hf_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = _ltx_old_hf_offline
        if _ltx_old_transformers_offline is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = _ltx_old_transformers_offline


# =============================================================================
# REST API: VIDEO QUALITY — Wan2.2 I2V 14B (GGUF)
# =============================================================================

def _minimax_h3_phase(block_names):
    """Build a component-minimal H3 pipeline for one memory-isolated phase."""
    from diffusers.modular_pipelines import MiniMaxH3Blocks
    from diffusers.modular_pipelines.modular_pipeline import SequentialPipelineBlocks

    blocks = MiniMaxH3Blocks().sub_blocks
    # The reviewed H3 branch groups task-specific layout steps below five
    # public phase blocks. Keep BonzAI's phase names stable while selecting
    # those public blocks so large components are still memory-isolated.
    phase_map = {
        ("setup", "text_encoder"): ("before_encode", "text_encoder"),
        ("vae_encoder",): ("vae_encoder",),
        ("denoise",): ("denoise",),
        ("decode",): ("decode",),
    }
    resolved = phase_map.get(tuple(block_names), tuple(block_names))
    selected = {name: blocks[name] for name in resolved}
    phase = SequentialPipelineBlocks.from_blocks_dict(selected)
    return phase.init_pipeline(repo_local_dir(MINIMAX_H3_REPO))


def _ensure_h3_processor_compat(processor):
    """Backfill the multimodal token classifier required by H3 Diffusers.

    H3's current Diffusers encoder block calls this helper, but the current
    Qwen3-VL processor still does not expose it. H3 only needs the simple token
    classification contract below, so keep the compatibility local to H3.
    """
    if hasattr(processor, "create_mm_token_type_ids"):
        return processor

    tokenizer = processor.tokenizer
    image_token_ids = {
        tokenizer.convert_tokens_to_ids(token)
        for token in (getattr(processor, "image_token", None), "<|image_pad|>")
        if token
    }
    video_token_ids = {
        tokenizer.convert_tokens_to_ids(token)
        for token in (getattr(processor, "video_token", None), "<|video_pad|>")
        if token
    }
    image_token_ids.discard(None)
    video_token_ids.discard(None)

    def create_mm_token_type_ids(input_ids):
        return [
            [2 if token_id in video_token_ids else 1 if token_id in image_token_ids else 0 for token_id in row]
            for row in input_ids
        ]

    processor.create_mm_token_type_ids = create_mm_token_type_ids
    return processor


def _pin_h3_vision_position_embedding(model, device):
    """Keep Qwen3-VL's small interpolation table beside its MPS outputs."""
    pos_embed = model.model.visual.pos_embed
    registry = getattr(pos_embed, "_diffusers_hook", None)
    if registry is not None:
        registry.remove_hook("group_offloading", recurse=False)
    pos_embed.to(device)


def _detach_h3_group_offloading(model):
    """Release hook-owned module groups before loading the next H3 phase."""
    if model is None:
        return
    registry = getattr(model, "_diffusers_hook", None)
    if registry is not None:
        registry.remove_hook("group_offloading", recurse=True)


def _move_pipeline_state(state, device):
    def move(value):
        if isinstance(value, torch.Tensor):
            if device.type == "mps" and value.dtype == torch.float64:
                return value.to(device=device, dtype=torch.float32)
            return value.to(device)
        if isinstance(value, list):
            return [move(item) for item in value]
        if isinstance(value, tuple):
            return tuple(move(item) for item in value)
        if isinstance(value, dict):
            return {key: move(item) for key, item in value.items()}
        return value

    for key, value in state.values.items():
        state.values[key] = move(value)
    return state


def _patch_h3_mps_position_ids():
    """Use the highest rotary-coordinate precision supported by Apple MPS.

    The reviewed H3 blocks intentionally construct their position grid on CPU
    in float64, but MPS cannot materialize float64 tensors.  Casting only the
    finished grid to float32 retains the reference grid construction while
    avoiding a backend error before denoising begins.
    """
    from diffusers.modular_pipelines.minimax_h3 import before_denoise

    for class_name, method_name in (
        ("MiniMaxH3PrepareLayoutStep", "build_packed_sequence"),
        ("MiniMaxH3Ref2VAPrepareLayoutStep", "build_ref2va_packed_sequence"),
    ):
        layout_class = getattr(before_denoise, class_name)
        current = getattr(layout_class, method_name)
        if getattr(current, "_bonzai_mps_compatible", False):
            continue

        def mps_compatible(*args, _original=current, **kwargs):
            values = _original(*args, **kwargs)
            return (values[0].to(dtype=torch.float32), *values[1:])

        mps_compatible._bonzai_mps_compatible = True
        setattr(layout_class, method_name, staticmethod(mps_compatible))


def _release_h3_phase():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if torch.backends.mps.is_available():
        torch.mps.synchronize()
        torch.mps.empty_cache()


class _H3ProgressBar:
    """Small tqdm-compatible context that forwards denoising progress."""

    def __init__(self, total, callback):
        self.total = max(1, int(total or 1))
        self.current = 0
        self.callback = callback

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def update(self, amount=1):
        self.current = min(self.total, self.current + int(amount))
        self.callback(self.current, self.total)


def _attach_h3_step_progress(pipe, callback):
    """Attach a progress callback to all nested H3 denoising loop variants."""
    attached = 0

    def visit(block):
        nonlocal attached
        if block.__class__.__name__ in {
            "MiniMaxH3DenoiseStep",
            "MiniMaxH3Ref2VADenoiseStep",
        }:
            def progress_bar(_self, iterable=None, total=None):
                if iterable is not None:
                    total = len(iterable)
                return _H3ProgressBar(total, callback)

            block.progress_bar = types.MethodType(progress_bar, block)
            attached += 1
        for child in getattr(block, "sub_blocks", {}).values():
            visit(child)

    visit(pipe._blocks)
    if not attached:
        raise RuntimeError("MiniMax H3 denoising loop was not found for progress reporting")


def _install_h3_euler_ancestral_scheduler(scheduler, seed):
    """Install ComfyUI's rectified-flow Euler ancestral update on H3."""
    if scheduler.__class__.__name__ != "MiniMaxH3Scheduler":
        raise RuntimeError("MiniMax H3 Euler ancestral requires MiniMaxH3Scheduler")
    original_set_timesteps = scheduler.set_timesteps

    def set_ancestral_timesteps(_scheduler, num_inference_steps=None, device=None, sigmas=None):
        result = original_set_timesteps(
            num_inference_steps=num_inference_steps,
            device=device,
            sigmas=sigmas,
        )
        _scheduler._h3_noise_generator = torch.Generator(device="cpu").manual_seed(seed)
        return result

    def euler_ancestral(_scheduler, model_output, timestep, sample, return_dict=True):
        from diffusers.schedulers.scheduling_minimax_h3 import MiniMaxH3SchedulerOutput

        if _scheduler.step_index is None:
            _scheduler._step_index = _scheduler.index_for_timestep(timestep)
        index = _scheduler.step_index
        sigma = _scheduler.sigmas[index].to(device=sample.device, dtype=torch.float32)
        sigma_next = _scheduler.sigmas[index + 1].to(device=sample.device, dtype=torch.float32)
        sigma_from_timestep = 1 - torch.as_tensor(
            timestep, device=sample.device, dtype=sample.dtype
        )
        while sigma_from_timestep.ndim < sample.ndim:
            sigma_from_timestep = sigma_from_timestep.unsqueeze(-1)
        denoised = sample + sigma_from_timestep * model_output

        if float(sigma_next) == 0.0:
            prev_sample = denoised.float()
        else:
            # ComfyUI's Euler ancestral RF path for CONST/rectified-flow
            # sampling. It advances to sigma_down, rescales for the clean
            # coefficient, then injects reproducible ancestral noise.
            sigma_down = sigma_next * (sigma_next / sigma)
            alpha_next = 1.0 - sigma_next
            alpha_down = 1.0 - sigma_down
            renoise_squared = (
                sigma_next.square()
                - sigma_down.square() * alpha_next.square() / alpha_down.square()
            )
            renoise_coeff = torch.sqrt(torch.clamp(renoise_squared, min=0.0))
            ratio = sigma_down / sigma
            prev_sample = ratio * sample.float() + (1.0 - ratio) * denoised.float()
            prev_sample = (alpha_next / alpha_down) * prev_sample
            noise = torch.randn(
                sample.shape,
                generator=_scheduler._h3_noise_generator,
                device="cpu",
                dtype=torch.float32,
            ).to(device=sample.device)
            prev_sample = prev_sample + noise * renoise_coeff

        _scheduler._step_index += 1
        prev_sample = prev_sample.to(dtype=sample.dtype)
        if not return_dict:
            return (prev_sample,)
        return MiniMaxH3SchedulerOutput(prev_sample=prev_sample)

    scheduler.set_timesteps = types.MethodType(set_ancestral_timesteps, scheduler)
    scheduler.step = types.MethodType(euler_ancestral, scheduler)
    return scheduler


def _prepare_h3_audio_for_export(audio):
    """Apply transparent peak protection before the AAC encoder clips audio."""
    audio = audio.detach().float()
    if not bool(torch.isfinite(audio).all()):
        raise RuntimeError("MiniMax H3 produced non-finite decoded audio")
    peak = float(audio.abs().max()) if audio.numel() else 0.0
    gain = min(1.0, 0.98 / peak) if peak > 0 else 1.0
    if gain < 1.0:
        audio = audio * gain
    return audio, {"decoded_peak": peak, "export_gain": gain}


def _h3_image_canvas(width, height, image_width, image_height):
    """Keep the selected pixel budget, oriented like the source (as in Wan)."""
    if (image_width < image_height and width > height) or (image_width > image_height and width < height):
        return height, width
    return width, height


@app.route("/video/sota", methods=["POST"])
def minimax_h3_video():
    """MiniMax H3 Q2_K_XL text/keyframe video with synchronized audio."""
    data = request.get_json(force=True) or {}
    if data.get("license_accepted") is not True:
        return jsonify({"error": "MiniMax H3 terms must be accepted before use"}), 403
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400

    width = max(256, int(data.get("width", 960)))
    height = max(256, int(data.get("height", 544)))
    width -= width % 32
    height -= height % 32
    if width * height > 1344 * 768:
        return jsonify({"error": "MiniMax H3 canvas must not exceed 1,032,192 pixels"}), 400
    requested_frames = int(data.get("num_frames", 124))
    num_frames = max(124, 17 * max(7, (requested_frames - 5 + 16) // 17) + 5)
    # 345 is the largest 17n+5 count whose 24 fps duration remains <=15s.
    num_frames = min(num_frames, 345)
    requested_steps = int(data.get("num_inference_steps", 8))
    if requested_steps < 4 or requested_steps > 8:
        return jsonify({
            "error": "MiniMax H3 supports 4 to 8 inference steps with the current samplers"
        }), 400
    steps = requested_steps
    seed = int(data.get("seed") or secrets.randbelow(2**31))
    hybrid_checkpoint = (MODEL_DIR / MINIMAX_H3_HYBRID_NAME).is_file()
    default_sampler = "euler" if hybrid_checkpoint else MINIMAX_H3_SAMPLER
    requested_sampler = str(data.get("sampler", default_sampler)).strip().lower()
    requested_sampler = requested_sampler.replace("-", "_").replace(" ", "_")
    if requested_sampler not in {"euler", "euler_ancestral", "euler_a"}:
        return jsonify({
            "error": "Supported H3 samplers: euler, euler_ancestral"
        }), 400
    requested_schedule = str(data.get("schedule", data.get("scheduler", "simple"))).strip().lower()
    if requested_schedule != "simple":
        return jsonify({"error": "Only the validated simple H3 schedule is supported"}), 400
    try:
        requested_guidance = float(data.get("guidance_scale", MINIMAX_H3_GUIDANCE_SCALE))
    except (TypeError, ValueError):
        return jsonify({"error": "MiniMax H3 guidance scale must be a number"}), 400
    if not math.isfinite(requested_guidance) or not math.isclose(
        requested_guidance, MINIMAX_H3_GUIDANCE_SCALE, rel_tol=0.0, abs_tol=1e-6
    ):
        return jsonify({
            "error": "MiniMax H3 is guidance-distilled and locked to guidance scale 1"
        }), 400
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()

    guard = _ensure_files_present_or_start(
        "video_sota", auto_download=bool(data.get("auto_download", True))
    )
    if guard is not None:
        return guard

    device = DeviceManager.get_device()
    # H3's native transformer stack is bfloat16. FP16 has insufficient
    # exponent range for its AdaLN/attention activations and can silently
    # produce NaNs on MPS, which otherwise export as a black, silent MP4.
    text_compute_dtype = torch.bfloat16 if device.type == "mps" else DeviceManager.get_dtype(device)
    # H3 is a mixed-precision model. The GGUF loader keeps the official FP32
    # projection/time/rope modules in FP32 while AdaLN and the 50-block
    # attention/MLP stack use BF16.
    transformer_compute_dtype = torch.bfloat16 if device.type == "mps" else DeviceManager.get_dtype(device)
    generator = torch.Generator(device="cpu").manual_seed(seed)
    first_image = None
    if image_url:
        first_image = load_image(image_url).convert("RGB")
    elif image_b64:
        first_image = Image.open(io.BytesIO(_decode_image_base64(image_b64))).convert("RGB")

    if first_image is not None:
        # Match Wan's portrait/landscape canvas selection for every caller,
        # including image URLs and reused generation parameters.
        width, height = _h3_image_canvas(width, height, *first_image.size)

    gen_id = genbus.new("minimax_h3", {
        "endpoint": "/video/sota", "w": width, "h": height, "frames": num_frames,
    })
    pipe = model = state = None
    h3_lora_modules = 0
    h3_applied_loras = []
    try:
        from diffusers.utils import encode_video
        from h3_numerics import (
            check_conditioning, stabilize_norms, watch_scheduler, watch_transformer,
        )
        from minimax_h3_gguf import (
            load_h3_audio_vae,
            load_h3_lora,
            load_h3_text_encoder,
            load_h3_transformer,
            load_h3_video_vae,
        )

        official_dir = repo_local_dir(MINIMAX_H3_REPO)
        transformer_path = MODEL_DIR / (MINIMAX_H3_HYBRID_NAME if hybrid_checkpoint else MINIMAX_H3_TRANSFORMER_NAME)
        text_encoder_path = MODEL_DIR / MINIMAX_H3_TEXT_ENCODER_NAME
        video_vae_path = MODEL_DIR / MINIMAX_H3_VIDEO_VAE_NAME
        audio_vae_path = MODEL_DIR / MINIMAX_H3_AUDIO_VAE_NAME
        lora_path = MODEL_DIR / MINIMAX_H3_LORA_NAME
        if not hybrid_checkpoint and not lora_path.is_file():
            raise FileNotFoundError(
                "MiniMax H3 local preset is missing from the model directory: "
                + lora_path.name
            )

        progress_total = steps + 4
        genbus.progress(gen_id, "encoding prompt", 1, progress_total)
        model = load_h3_text_encoder(
            text_encoder_path, str(official_dir), text_compute_dtype
        )
        stabilize_norms(model)
        apply_group_offloading(model, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        if device.type == "mps":
            from minimax_h3_gguf import preserve_h3_gguf_storage
            preserve_h3_gguf_storage(model)
            from h3_quantized import install_h3_memory_reclaim
            install_h3_memory_reclaim(model.model.language_model.layers, device)
        if first_image is not None:
            # Qwen3-VL creates interpolation weights from pos_embed.weight's
            # current device before calling the embedding. A leaf offload hook
            # moves that weight during the call, producing MPS output multiplied
            # by CPU weights. This table is tiny; pin it for keyframe prompts.
            _pin_h3_vision_position_embedding(model, device)
        pipe = _minimax_h3_phase(["setup", "text_encoder"])
        pipe.load_components(
            ["tokenizer", "processor"],
            pretrained_model_name_or_path=str(official_dir),
            local_files_only=True,
        )
        _ensure_h3_processor_compat(pipe.processor)
        pipe.update_components(text_encoder=model)
        state = pipe(
            prompt=prompt,
            image=first_image,
            height=height,
            width=width,
            num_frames=num_frames,
        )
        check_conditioning(state, "prompt_embeds")
        _detach_h3_group_offloading(model)
        pipe.update_components(text_encoder=None)
        pipe = model = None
        _release_h3_phase()

        if first_image is not None:
            genbus.progress(gen_id, "encoding keyframe", 2, progress_total)
            model = load_h3_video_vae(official_dir / "vae", video_vae_path)
            pipe = _minimax_h3_phase(["vae_encoder"])
            pipe.load_components(
                ["scheduler"],
                pretrained_model_name_or_path=str(official_dir),
                local_files_only=True,
            )
            pipe.update_components(vae=model)
            if device.type != "mps":
                apply_group_offloading(
                    pipe.vae, onload_device=device, offload_device="cpu", offload_type="leaf_level"
                )
            else:
                # CPU float16 Conv3d is emulated and extremely slow. The
                # encoder is only ~0.34 GB of this decoder-heavy checkpoint,
                # so promote just the modules used by keyframe encoding.
                pipe.vae.encoder.to(dtype=torch.float32)
                pipe.vae.quant_conv.to(dtype=torch.float32)
            # A one-frame FP16 Conv3d encode can fault asynchronously in MPS
            # after returning valid moments. On Apple Silicon the VAE already
            # resides on CPU, and this branch runs once per request; keeping it
            # there avoids that driver path and the associated process kill.
            state = pipe(state=state)
            check_conditioning(state, "condition_latents")
            _detach_h3_group_offloading(model)
            pipe.update_components(vae=None)
            pipe = model = None
            _release_h3_phase()

        genbus.progress(gen_id, "preparing video and audio", 2, progress_total)
        model = load_h3_transformer(transformer_path, transformer_compute_dtype)
        stabilize_norms(model)
        watch_transformer(model)
        # Hybrid checkpoint already contains merged adapters; do not stack the legacy preset.
        if not hybrid_checkpoint:
            installed = load_h3_lora(
                model,
                lora_path,
                strength=MINIMAX_H3_LORA_STRENGTH,
                compute_dtype=transformer_compute_dtype,
            )
            h3_lora_modules += len(installed)
            h3_applied_loras.append({
                "name": lora_path.name,
                "strength": MINIMAX_H3_LORA_STRENGTH,
                "modules": len(installed),
                "required": True,
            })
            logger.info(
                "[MiniMax H3] Applied required local motion LoRA to %d transformer modules (strength=%s)",
                len(installed),
                MINIMAX_H3_LORA_STRENGTH,
            )
        apply_group_offloading(model, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        if hybrid_checkpoint and device.type == "mps":
            from h3_quantized import preserve_h3_quantized_storage
            preserve_h3_quantized_storage(model)
            from h3_quantized import install_h3_memory_reclaim
            install_h3_memory_reclaim(model.transformer_blocks, device)
        if device.type == "mps":
            _patch_h3_mps_position_ids()
        pipe = _minimax_h3_phase(["denoise"])
        pipe.load_components(
            ["scheduler", "audio_scheduler"],
            pretrained_model_name_or_path=str(official_dir),
            local_files_only=True,
        )
        pipe.scheduler.set_shift(MINIMAX_H3_VIDEO_SHIFT)
        pipe.audio_scheduler.set_shift(MINIMAX_H3_AUDIO_SHIFT)
        if requested_sampler != "euler":
            _install_h3_euler_ancestral_scheduler(pipe.scheduler, seed + 1)
            _install_h3_euler_ancestral_scheduler(pipe.audio_scheduler, seed + 2)
        watch_scheduler(pipe.scheduler, "video")
        watch_scheduler(pipe.audio_scheduler, "audio")
        pipe.update_components(transformer=model)
        _attach_h3_step_progress(
            pipe,
            lambda current, total: genbus.progress(
                gen_id,
                f"generating video and audio ({current}/{total})",
                2 + current,
                total + 4,
            ),
        )
        # The scheduler API counts its terminal sigma as a grid point; one
        # extra point gives the public API's requested number of evaluations.
        state = pipe(state=state, generator=generator, num_inference_steps=steps + 1)
        _detach_h3_group_offloading(model)
        pipe.update_components(transformer=None)
        pipe = model = None
        _release_h3_phase()

        for latent_name in ("latents", "audio_latents"):
            latent_value = state.get(latent_name)
            if latent_value is None or not bool(torch.isfinite(latent_value).all()):
                raise RuntimeError(
                    f"MiniMax H3 produced non-finite {latent_name}; refusing to export an invalid video"
                )

        genbus.progress(gen_id, "decoding", steps + 3, progress_total)
        video_vae = load_h3_video_vae(official_dir / "vae", video_vae_path)
        audio_vae = load_h3_audio_vae(official_dir / "audio_vae", audio_vae_path)
        pipe = _minimax_h3_phase(["decode"])
        if device.type == "mps":
            # The H3 ViT VAE's partial 3-axis RoPE/attention path currently
            # produces finite but incorrect near-gray frames on MPS.  The
            # same checkpoint reconstructs correctly on CPU, including after
            # the original FP16 weights are promoted to the FP32 numerical
            # contract required by Diffusers.  Decode both modalities on CPU
            # so the modular block uses one consistent execution device.
            # Denoising, by far the expensive phase, remains on MPS.
            state = _move_pipeline_state(state, torch.device("cpu"))
            # Only the decode path is live. Use temporary FP32 affine weights
            # per layer instead of permanently doubling decoder storage.
            from minimax_h3_gguf import stream_h3_cpu_decode
            stream_h3_cpu_decode(video_vae.decoder)
            stream_h3_cpu_decode(video_vae.post_quant_conv)
        else:
            apply_group_offloading(
                video_vae, onload_device=device, offload_device="cpu", offload_type="leaf_level"
            )
        pipe.update_components(vae=video_vae, audio_vae=audio_vae)
        # The audio VAE uses legacy weight_norm parameters, so keep its whole
        # ~605 MB module resident on the phase device rather than leaf-offload
        # parametrized Conv1d weights independently.
        pipe.audio_vae.to("cpu" if device.type == "mps" else device)
        state = pipe(state=state, output_type="pil")

        out_path = str(FILES_DIR / f"minimax_h3_{gen_id}.mp4")
        export_audio, audio_metrics = _prepare_h3_audio_for_export(state.get("audio")[0])
        encode_video(
            state.get("videos")[0],
            fps=24,
            audio=export_audio,
            audio_sample_rate=state.get("sampling_rate"),
            output_path=out_path,
        )
        genbus.progress(gen_id, "complete", progress_total, progress_total)
        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify({
            "generation_id": gen_id,
            "video_path": out_path,
            "frames": num_frames,
            "fps": 24,
            "duration": num_frames / 24,
            "width": width,
            "height": height,
            "seed": seed,
            "num_inference_steps": steps,
            "sampler": "euler" if requested_sampler == "euler" else MINIMAX_H3_SAMPLER,
            "guidance_scale": MINIMAX_H3_GUIDANCE_SCALE,
            "schedule": MINIMAX_H3_SCHEDULER,
            "video_shift": MINIMAX_H3_VIDEO_SHIFT,
            "audio_shift": MINIMAX_H3_AUDIO_SHIFT,
            "has_audio": True,
            "audio_sample_rate": state.get("sampling_rate"),
            "audio_peak_before_export": audio_metrics["decoded_peak"],
            "audio_export_gain": audio_metrics["export_gain"],
            "pipeline": "video_sota",
            "model": "minimax-h3-hybrid" if hybrid_checkpoint else "minimax-h3-ud-q2-k-xl",
            "checkpoint": transformer_path.name,
            "merged_loras": hybrid_checkpoint,
            "runtime": "diffusers",
            "lora": h3_applied_loras[0]["name"] if h3_applied_loras else None,
            "lora_strength": h3_applied_loras[0]["strength"] if h3_applied_loras else 0.0,
            "lora_modules": h3_lora_modules,
            "loras": h3_applied_loras,
        })
    except Exception as exc:
        logger.exception("[MiniMax H3] Generation failed")
        genbus.error(gen_id, str(exc))
        return jsonify({"error": str(exc)}), 500
    finally:
        pipe = model = state = None
        _release_h3_phase()


@app.route("/video/quality", methods=["POST"])
def wan_i2v_video():
    """
    Wan2.2 I2V 14B — High-quality image-to-video generation.

    Uses paired Q5_K_M GGUF transformers with group offloading.
    Two noise schedules control motion intensity:
    - "low": subtle, realistic motion (default)
    - "high": dynamic, expressive motion

    Optional LoRA styles: "general" (default) or "animation".
    The LoRA matching the noise schedule is auto-selected.
    """
    data = request.get_json(force=True) or {}

    benchmark_repo = str(repo_local_dir(WAN_REPO)) if data.get("_benchmark") is True else WAN_REPO
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip() or \
        "Bright tones, overexposed, static, blurry details, subtitles, style, artwork, painting, picture, still, gray overall, worst quality, low quality, JPEG artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, messy background, three legs, many people in background, walking backwards"
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    H = int(data.get("height", 320))
    W = int(data.get("width", 512))
    num_frames = int(data.get("num_frames", 33))
    output_fps = int(data.get("fps", 8))
    # Lightning Seko V1 LoRA is loaded on top of the base GGUF — locked
    # to its 4-step distillation point: 4 steps + CFG 1.0 +
    # boundary_ratio 0.5 + scheduler shift 5.0. Anything else produces
    # broken output (verified: 16 steps under-denoises, 25 + CFG 3.5 in
    # base mode produces chromatic aberration over a 4-hour run).
    steps = int(data.get("num_inference_steps", 4))
    guidance = float(data.get("guidance_scale", 1.0))
    seed = data.get("seed")
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    _mps_clear_memory()

    guard = _ensure_files_present_or_start("video_quality", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("wan_i2v", {
        "endpoint": "/video/quality", "w": W, "h": H, "frames": num_frames,
    })

    _wan_offline = _is_pipeline_complete("video_quality")
    _wan_old_hf_offline = os.environ.get("HF_HUB_OFFLINE")
    _wan_old_transformers_offline = os.environ.get("TRANSFORMERS_OFFLINE")
    if _wan_offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

    pipe = residency = transformer = transformer_2 = vae = None

    try:
        from huggingface_hub import hf_hub_download

        device = DeviceManager.get_device()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        if device.type == "mps":
            os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

        # bfloat16 for transformer compute — avoids float16 NaN on MPS
        # and halves memory vs float32. VAE decodes separately in float32.
        model_dtype = torch.bfloat16

        genbus.progress(gen_id, "loading", 1, 4)

        # Load source image
        if image_url:
            pil_image = load_image(image_url).convert("RGB")
        else:
            pil_image = Image.open(io.BytesIO(_decode_image_base64(image_b64))).convert("RGB")

        # Resize to target dimensions preserving aspect ratio (cover + center crop)
        import numpy as _np
        src_w, src_h = pil_image.size
        scale = max(W / src_w, H / src_h)
        new_w, new_h = int(src_w * scale), int(src_h * scale)
        resized = pil_image.resize((new_w, new_h), Image.LANCZOS)
        crop_x, crop_y = (new_w - W) // 2, (new_h - H) // 2
        pil_image = resized.crop((crop_x, crop_y, crop_x + W, crop_y + H))

        logger.info(f"[Wan2.2] Generating {num_frames} frames @ {W}x{H}, {steps} steps (QuantStack Q5_K_M GGUF + Lightning LoRA)")

        genbus.progress(gen_id, "loading model", 2, 4)

        # QuantStack Q5_K_M GGUF Wan 2.2 I2V — diffusers-compatible tensor
        # naming. Q5_K_M (~10.8 GB per transformer) is the highest sub-12GB
        # variant. We tried Q2_K first (5.3 GB) — produced visible chroma
        # confetti on the 14B model. Q2's 2-bit weight precision is below
        # the floor where Lightning's bf16-trained residual deltas can
        # blend cleanly. Q5_K_M keeps ~5 effective bits per weight.
        #
        # GGUF bypasses the bf16 download peak entirely (the file on disk
        # IS quantized) so cold start drops from ~20min one-time quantize
        # to ~minutes.
        #
        # Caveat: fuse_lora() is BROKEN with GGUF tensors (the merge tries
        # to write into a read-only quantized tensor and shape-mismatches).
        # We use load_lora_weights + set_adapters only — never fuse.
        high_path = MODEL_DIR / WAN_GGUF_HIGH
        low_path = MODEL_DIR / WAN_GGUF_LOW
        if not high_path.exists() or not low_path.exists():
            return jsonify({
                "error": "Wan 2.2 Q5_K_M GGUF transformer files not found. "
                         "Trigger pre-flight via auto_download=true and retry."
            }), 503
        logger.info(f"[Wan2.2] Q5_K_M GGUF shards ready: high={high_path.name} low={low_path.name}")

        from wan_residency import WanExpert, WanResidency
        high_config = WanTransformer3DModel.load_config(benchmark_repo, subfolder="transformer")
        low_config = WanTransformer3DModel.load_config(benchmark_repo, subfolder="transformer_2")
        from diffusers.configuration_utils import FrozenDict
        transformer = WanExpert(FrozenDict(high_config), model_dtype)
        transformer_2 = WanExpert(FrozenDict(low_config), model_dtype)

        # This VAE checkpoint is distributed in fp32 and is not quantized.
        vae = AutoencoderKLWan.from_pretrained(
            benchmark_repo, subfolder="vae", torch_dtype=torch.float32,
        )

        pipe = WanImageToVideoPipeline.from_pretrained(
            benchmark_repo,
            vae=vae,
            transformer=transformer,
            transformer_2=transformer_2,
            torch_dtype=model_dtype,
        )
        # boundary_ratio: 0.5 (50/50 split between high/low noise experts)
        # — matches the 4-step distillation regime baked into dasiwa.
        pipe._internal_dict["boundary_ratio"] = 0.5
        logger.info(f"[Wan2.2] boundary_ratio=0.5 (4-step distillation 50/50 split)")

        # Scheduler: Euler/Simple per dasiwa spec. FlowMatchEuler with
        # the model's default sigmas (no shift override).
        pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config(
            pipe.scheduler.config,
        )
        logger.info(f"[Wan2.2] Scheduler: FlowMatchEulerDiscreteScheduler (model default sigmas, dasiwa Euler/Simple)")

        residency = WanResidency(pipe, transformer, transformer_2,
                                 (high_path, low_path), MODEL_DIR, data, device,
                                 model_dtype, logger, benchmark_repo)
        # Encoders run once; expert weights and their LoRAs load only on use.
        if device.type != "cpu":
            apply_group_offloading(pipe.text_encoder, onload_device=device, offload_device="cpu", offload_type="leaf_level")
            if getattr(pipe, "image_encoder", None) is not None:
                apply_group_offloading(pipe.image_encoder, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        # VAE: keep pinned to device for decode. apply_group_offloading
        # at leaf_level interferes with Wan VAE's `feat_cache` propagation
        # between consecutive frames — at small spatial extents (240p)
        # the cache survives the offload round-trip, but at 640×480+ the
        # larger activations cause cache buffers to land on the wrong
        # device or stale memory, producing chroma-confetti decode.
        # VAE itself is small (~200-500 MB fp32) so device-pinning fits
        # comfortably alongside the leaf-offloaded transformers.
        pipe.vae.to(dtype=torch.float32)
        pipe.vae.to(device)
        pipe.vae.enable_tiling()

        genbus.progress(gen_id, "generating", 3, 4)

        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        generator = torch.Generator(device="cpu").manual_seed(int(seed)) if seed else None

        from wan_validation import validate_wan_latents, validate_wan_frames
        def on_wan_step(pipeline, step, timestep, values):
            values = validate_wan_latents(pipeline, step, timestep, values)
            if step == pipeline.num_timesteps - 1:
                residency.release()
            return values

        output = pipe(
            image=pil_image,
            prompt=prompt,
            negative_prompt=negative_prompt,
            height=H,
            width=W,
            num_frames=num_frames,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator,
            callback_on_step_end=on_wan_step,
            callback_on_step_end_tensor_inputs=["latents"],
        )

        video_frames = validate_wan_frames(output.frames[0])

        # Save video
        files_dir = MODEL_DIR / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(files_dir / f"wan_i2v_{gen_id}.mp4")
        from inference_memory import video_to_uint8
        _write_video_uint8((video_to_uint8(frame) for frame in video_frames), out_path, fps=output_fps)

        genbus.progress(gen_id, "complete", 4, 4)
        genbus.finish(gen_id, {"video_path": out_path})

        logger.info(f"[Wan2.2] Video saved to {out_path}")

        return jsonify({
            "generation_id": gen_id,
            "loras": residency.applied,
            "video_path": out_path,
            "frames": num_frames,
            "fps": output_fps,
            "width": W,
            "height": H,
        })

    except Exception as e:
        logger.exception("[Wan2.2] Generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500

    finally:
        if residency is not None:
            residency.release()
        pipe = residency = transformer = transformer_2 = vae = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        if _wan_old_hf_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = _wan_old_hf_offline
        if _wan_old_transformers_offline is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = _wan_old_transformers_offline


# =============================================================================
# REST API: VIDEO TEST — Wan2.2 I2V 14B (FastDM Lightning merge + Q2 GGUF)
# =============================================================================
#
# Alternate Wan 2.2 pipeline per the FastDM discussion thread:
#   https://huggingface.co/FastDM/Wan2.2-I2V-A14B-Merge-Lightning-V1.0-Diffusers/discussions/1
#
# Strategy:
#   - Load Q2_K GGUF transformer weights directly via `from_single_file` with
#     `GGUFQuantizationConfig` (bypasses the bf16 download peak entirely —
#     the file on disk IS quantized).
#   - Pass `config="FastDM/...Merge-Lightning-..."` so the Lightning LoRA is
#     baked in at pipeline-construction time; no separate LoRA loading.
#   - UniPCMultistepScheduler with `flow_shift=8.0`, 4 steps, guidance 1.0
#     (FastDM team recommendation for avoiding the blur regression).
#   - `apply_group_offloading` at `leaf_level` for the transformers —
#     block_level is incompatible with quanto tensors (see /video/quality
#     fix note) but GGUF is read-only dequant and tolerates leaf offload.
#
# Known caveat: diffusers GGUF dequantization has been flaky on MPS in the
# past; this endpoint is the testing surface for whether the new pipeline
# path is usable there.


@app.route("/video/test", methods=["POST"])
def wan_i2v_video_test():
    """
    Wan2.2 I2V 14B — TEST endpoint using FastDM Lightning-merged config + Q2 GGUF.

    Same request/response shape as /video/quality. Separate endpoint so we
    can run A/B comparisons against the production /video/quality path
    without disturbing its cache or parameters.
    """
    data = request.get_json(force=True) or {}

    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip() or \
        "Bright tones, overexposed, static, blurry details, subtitles, style, artwork, painting, picture, still, gray overall, worst quality, low quality, JPEG artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, messy background, three legs, many people in background, walking backwards"
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    H = int(data.get("height", 480))
    W = int(data.get("width", 832))
    num_frames = int(data.get("num_frames", 81))
    output_fps = int(data.get("fps", 16))
    # FastDM team recommendation for the Lightning-merged weights: 4 steps, CFG 1.
    steps = int(data.get("num_inference_steps", 4))
    guidance = float(data.get("guidance_scale", 1.0))
    seed = data.get("seed")

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    _mps_clear_memory()

    gen_id = genbus.new("wan_i2v_test", {
        "endpoint": "/video/test", "w": W, "h": H, "frames": num_frames,
    })

    pipe = residency = transformer_high = transformer_low = vae = None

    try:
        from huggingface_hub import hf_hub_download

        device = DeviceManager.get_device()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        if device.type == "mps":
            os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

        model_dtype = torch.bfloat16

        genbus.progress(gen_id, "loading", 1, 4)

        # Load source image
        if image_url:
            pil_image = load_image(image_url).convert("RGB")
        else:
            pil_image = Image.open(io.BytesIO(_decode_image_base64(image_b64))).convert("RGB")

        # Resize preserving aspect ratio to target dims (cover + center crop)
        src_w, src_h = pil_image.size
        scale = max(W / src_w, H / src_h)
        new_w, new_h = int(src_w * scale), int(src_h * scale)
        resized = pil_image.resize((new_w, new_h), Image.LANCZOS)
        crop_x, crop_y = (new_w - W) // 2, (new_h - H) // 2
        pil_image = resized.crop((crop_x, crop_y, crop_x + W, crop_y + H))

        logger.info(f"[Wan2.2-test] Generating {num_frames} frames @ {W}x{H}, {steps} steps (FastDM merge + Q2 GGUF)")

        genbus.progress(gen_id, "loading model", 2, 4)

        # Download GGUF shards via HF hub (cached under MODEL_DIR via HF_HOME env).
        high_path = hf_hub_download(repo_id=WAN_TEST_GGUF_REPO, filename=WAN_TEST_GGUF_HIGH)
        low_path = hf_hub_download(repo_id=WAN_TEST_GGUF_REPO, filename=WAN_TEST_GGUF_LOW)
        logger.info(f"[Wan2.2-test] GGUF shards ready: high={high_path} low={low_path}")

        from wan_residency import WanExpert, WanResidency
        from diffusers.configuration_utils import FrozenDict
        transformer_high = WanExpert(FrozenDict(WanTransformer3DModel.load_config(WAN_TEST_MERGE_REPO, subfolder="transformer")), model_dtype)
        transformer_low = WanExpert(FrozenDict(WanTransformer3DModel.load_config(WAN_TEST_MERGE_REPO, subfolder="transformer_2")), model_dtype)

        vae = AutoencoderKLWan.from_pretrained(
            WAN_TEST_BASE_REPO, subfolder="vae", torch_dtype=torch.float32,
        )

        pipe = WanImageToVideoPipeline.from_pretrained(
            WAN_TEST_BASE_REPO,
            transformer=transformer_high,
            transformer_2=transformer_low,
            vae=vae,
            torch_dtype=model_dtype,
        )

        # Per discussion thread #1: UniPC scheduler with flow_shift=8.
        pipe.scheduler = UniPCMultistepScheduler.from_config(
            pipe.scheduler.config, flow_shift=8.0,
        )
        # Lightning merge uses 4 steps split evenly between high/low experts.
        pipe._internal_dict["boundary_ratio"] = 0.5
        logger.info(f"[Wan2.2-test] scheduler=UniPC flow_shift=8.0 boundary_ratio=0.5 steps={steps} guidance={guidance}")

        residency = WanResidency(pipe, transformer_high, transformer_low,
                                 (high_path, low_path), MODEL_DIR,
                                 {"use_general": False, "use_animation": False, "use_extra": False},
                                 device, model_dtype, logger, WAN_TEST_MERGE_REPO)
        if device.type != "cpu":
            for component_name in ("text_encoder", "image_encoder"):
                component = getattr(pipe, component_name, None)
                if isinstance(component, torch.nn.Module):
                    apply_group_offloading(component, onload_device=device, offload_device="cpu", offload_type="leaf_level")
        pipe.vae.to(device=device, dtype=torch.float32)
        pipe.vae.enable_tiling()

        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

        genbus.progress(gen_id, "generating", 3, 4)

        generator = torch.Generator(device="cpu").manual_seed(int(seed)) if seed else None

        def release_after_last_step(pipeline, step, timestep, values):
            if step == pipeline.num_timesteps - 1:
                residency.release()
            return values

        output = pipe(
            image=pil_image,
            prompt=prompt,
            negative_prompt=negative_prompt,
            height=H,
            width=W,
            num_frames=num_frames,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator,
            callback_on_step_end=release_after_last_step,
            callback_on_step_end_tensor_inputs=["latents"],
        )

        video_frames = output.frames[0]

        files_dir = MODEL_DIR / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(files_dir / f"wan_i2v_test_{gen_id}.mp4")
        from inference_memory import video_to_uint8
        _write_video_uint8((video_to_uint8(frame) for frame in video_frames), out_path, fps=output_fps)

        genbus.progress(gen_id, "complete", 4, 4)
        genbus.finish(gen_id, {"video_path": out_path})

        logger.info(f"[Wan2.2-test] Video saved to {out_path}")

        return jsonify({
            "generation_id": gen_id,
            "video_path": out_path,
            "frames": num_frames,
            "fps": output_fps,
            "width": W,
            "height": H,
            "variant": "fastdm-merge-q2-gguf",
        })

    except Exception as e:
        logger.exception("[Wan2.2-test] Generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500

    finally:
        if residency is not None:
            residency.release()
        pipe = residency = transformer_high = transformer_low = vae = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()


# =============================================================================
# REST API: VIDEO ENHANCE — SeedVR2, with explicit Real-ESRGAN fallback
# =============================================================================
# Frame interpolation is optional and uses the bundled FFmpeg.

_ESRGAN_CACHE = {"model": None, "variant": None}


def _load_realesrgan(variant: str = "default"):
    """Lazy-load RealESRGANer. variant: 'default' (RealESRGAN_x4plus) or 'anime'."""
    if _ESRGAN_CACHE["model"] is not None and _ESRGAN_CACHE["variant"] == variant:
        return _ESRGAN_CACHE["model"]
    try:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan.archs.srvgg_arch import SRVGGNetCompact
    except ImportError as e:
        raise RuntimeError(
            f"realesrgan backend not installed: {e}. "
            "Run: pip install realesrgan basicsr"
        )
    if variant == "anime":
        model = SRVGGNetCompact(
            num_in_ch=3, num_out_ch=3, num_feat=64,
            num_conv=16, upscale=4, act_type="prelu",
        )
        weights = MODEL_DIR / ESRGAN_X4_ANIME_NAME
    else:
        model = RRDBNet(
            num_in_ch=3, num_out_ch=3, num_feat=64,
            num_block=23, num_grow_ch=32, scale=4,
        )
        weights = MODEL_DIR / ESRGAN_X4_NAME
    if not weights.exists():
        raise RuntimeError(
            f"Real-ESRGAN weights missing: {weights.name}. "
            "Trigger pre-flight on /video/enhance with auto_download=true."
        )
    device = DeviceManager.get_device()
    upsampler = RealESRGANer(
        scale=4,
        model_path=str(weights),
        model=model,
        tile=256,         # keep the legacy fallback bounded on large frames
        tile_pad=10,
        pre_pad=0,
        half=False,       # bf16/fp16 unstable on MPS for RRDBNet
        device=device,
    )
    _ESRGAN_CACHE["model"] = upsampler
    _ESRGAN_CACHE["variant"] = variant
    return upsampler


def _ffmpeg_exe():
    """Locate an ffmpeg binary. Uses imageio_ffmpeg's bundled exe (transitive
    dep of diffusers, always present)."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise RuntimeError(f"ffmpeg unavailable via imageio_ffmpeg: {e}")


def _write_video_uint8(frames, output_path: str, fps: float):
    """Write a list of uint8 RGB HxWx3 frames to MP4. We can't use diffusers'
    `export_to_video` here because it does `(frame * 255).astype(uint8)` on
    every numpy array (it assumes float [0,1] input from a diffusion pipeline
    output) — feeding it our uint8 [0,255] frames wraps mod 256 and produces
    negative-looking output."""
    import imageio
    with imageio.get_writer(
        output_path,
        fps=fps,
        codec="libx264",
        quality=8,            # imageio scale 0-10; 8 ≈ CRF 18-20
        macro_block_size=16,
        pixelformat="yuv420p",
    ) as writer:
        for frame in frames:
            writer.append_data(frame)


@app.route("/video/enhance", methods=["POST"])
def video_enhance():
    """Restore locally with SeedVR2 (default) or explicit Real-ESRGAN fallback.

    Source audio and frame rate are preserved unless interp_factor is supplied.
    See docs/VIDEO_ENHANCEMENT.md for the request contract and memory controls.
    """
    from video_enhance import (EnhanceOptions, SEEDVR2_DIT, prepare_seedvr2,
                               seedvr2_dependencies, run_seedvr2, probe_video, finish_video)
    data = request.get_json(silent=True)
    try:
        options = EnhanceOptions.parse(data)
        video_path = data.get("video_path", "")
        video_b64 = data.get("video_base64", "")
        if not isinstance(video_path, str) or not isinstance(video_b64, str):
            raise ValueError("video_path and video_base64 must be strings.")
        if bool(video_path.strip()) == bool(video_b64.strip()):
            raise ValueError("Provide exactly one of video_path or video_base64.")
        if video_path and not Path(video_path).is_file():
            raise ValueError("The source video file is unavailable.")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    files_dir = MODEL_DIR / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    gen_id = None
    output = None
    try:
        with tempfile.TemporaryDirectory(prefix="enhance-", dir=files_dir) as temporary:
            if video_b64:
                video_path = str(Path(temporary) / "input.mp4")
                try:
                    Path(video_path).write_bytes(base64.b64decode(video_b64, validate=True))
                except ValueError:
                    return jsonify({"error": "Invalid video_base64."}), 400
            try:
                source = probe_video(video_path, count_frames=True)
            except Exception:
                return jsonify({"error": "The source video could not be decoded."}), 400
            options = options.for_source(data, source["size"])
            if options.upscale:
                if options.backend == "seedvr2":
                    missing = seedvr2_dependencies()
                    if missing:
                        return jsonify({"error": "seedvr2_runtime_missing",
                                        "message": "Install the updated BonzAI Python dependencies before using SeedVR2.",
                                        "missing": missing}), 503
                guard = _ensure_files_present_or_start(
                    "video_enhance" if options.backend == "seedvr2" else "video_enhance_realesrgan",
                    auto_download=options.auto_download)
                if guard:
                    return guard

            gen_id = genbus.new("video_enhance", {"endpoint": "/video/enhance",
                "backend": options.backend, "upscale": options.upscale,
                "interp_factor": options.interp_factor})
            restored = video_path
            if options.upscale:
                restored = str(Path(temporary) / "restored.mp4")
                if options.backend == "seedvr2":
                    genbus.progress(gen_id, "preparing SeedVR2", 0, 1)
                    runtime = prepare_seedvr2(MODEL_DIR)
                    DeviceManager.free_memory()
                    run_seedvr2(runtime, MODEL_DIR, video_path, restored, options,
                                DeviceManager.get_device(),
                                progress=lambda stage, done, total: genbus.progress(gen_id, stage, done, total))
                else:
                    import imageio.v3 as iio
                    upsampler = _load_realesrgan(variant=options.variant)
                    def restored_frames():
                        for index, frame in enumerate(iio.imiter(video_path, plugin="pyav")):
                            bgr, _ = upsampler.enhance(frame[..., ::-1], outscale=4)
                            genbus.progress(gen_id, "upscaling", index + 1, source["frame_count"])
                            yield bgr[..., ::-1]
                    _write_video_uint8(restored_frames(), restored, fps=source["fps"])

            genbus.progress(gen_id, "encoding and checking video", 0, 1)
            output = files_dir / f"enhance_{gen_id}.mp4"
            actual = finish_video(video_path, restored, output, options, source, _ffmpeg_exe())
            result = {"generation_id": gen_id, "video_path": str(output),
                      "backend": options.backend if options.upscale else "ffmpeg",
                      "model": SEEDVR2_DIT if options.upscale and options.backend == "seedvr2" else None,
                      "input_fps": source["fps"], "output_fps": actual["fps"],
                      "input_size": source["size"], "output_size": actual["size"],
                      "frame_count": actual["frame_count"], "has_audio": actual["has_audio"],
                      "interp_factor": options.interp_factor}
            genbus.finish(gen_id, result)
            return jsonify(result)
    except Exception as error:
        if output:
            output.unlink(missing_ok=True)
        logger.exception("[Enhance] failed")
        if gen_id:
            genbus.error(gen_id, str(error))
        return jsonify({"error": str(error), "backend": options.backend}), 500
    finally:
        # Do not keep the fallback model resident alongside subsequent jobs.
        _ESRGAN_CACHE.update(model=None, variant=None)
        DeviceManager.free_memory()


# =============================================================================
# REST API: TIME-SERIES FORECASTING — Google TimesFM 2.0 (500M)
# =============================================================================
#
# Single-endpoint forecast path for the Chart Forecaster skill. Accepts a raw
# 1-D time series (daily closes typically) and returns TimesFM's point
# forecast plus 80%/95% quantile bands so the UI can shade confidence.
#
# Model: google/timesfm-2.0-500m-pytorch — 500M params, context up to 2048,
# horizon up to 128 per call (we chunk if the caller asks for more).
#
# Cached under MODEL_DIR via HF_HOME so the first /forecast call downloads,
# subsequent calls load instantly.

_TIMESFM_CACHE = {"model": None}
TIMESFM_REPO = "google/timesfm-2.0-500m-pytorch"
TIMESFM_CONTEXT_LEN = 2048
TIMESFM_HORIZON_PER_CALL = 128


def _get_timesfm(local_only=False):
    """Lazy-load TimesFM 2.0 into the cache. Returns the TimesFm instance."""
    if _TIMESFM_CACHE["model"] is not None:
        return _TIMESFM_CACHE["model"]
    try:
        import timesfm
    except ImportError as e:
        raise RuntimeError(
            "timesfm package not installed. Run `pip install timesfm` in the server venv."
        ) from e

    device = DeviceManager.get_device()
    backend = "gpu" if device.type in ("cuda", "mps") else "cpu"

    logger.info(f"[TimesFM] Loading {TIMESFM_REPO} (backend={backend})")
    tfm = timesfm.TimesFm(
        hparams=timesfm.TimesFmHparams(
            backend=backend,
            per_core_batch_size=32,
            horizon_len=TIMESFM_HORIZON_PER_CALL,
            num_layers=50,
            use_positional_embedding=False,
            context_len=TIMESFM_CONTEXT_LEN,
        ),
        checkpoint=timesfm.TimesFmCheckpoint(path=str(repo_local_dir(TIMESFM_REPO) / "torch_model.ckpt"))
        if local_only else timesfm.TimesFmCheckpoint(huggingface_repo_id=TIMESFM_REPO),
    )
    _TIMESFM_CACHE["model"] = tfm
    logger.info("[TimesFM] Ready")
    return tfm


@app.route("/forecast/history", methods=["POST"])
def forecast_history():
    """Proxy historical OHLC history from CoinGecko (crypto) or Yahoo Finance
    (stocks). Renderer-side fetches to Yahoo fail with CORS in Electron; the
    Flask server has no such restriction. Returns `[{t, v}, ...]`."""
    data = request.get_json(force=True) or {}
    symbol = (data.get("symbol") or "").strip()
    asset_type = (data.get("assetType") or "crypto").strip().lower()
    days = int(data.get("days", 365))
    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    import requests as _req
    try:
        if asset_type == "crypto":
            # Mapping kept here mirrors the client-side list; kept minimal
            # because CoinGecko IDs don't always match tickers.
            coingecko_map = {
                "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
                "BNB": "binancecoin", "XRP": "ripple", "DOGE": "dogecoin",
                "ADA": "cardano", "AVAX": "avalanche-2", "LINK": "chainlink",
                "DOT": "polkadot",
            }
            coingecko_id = coingecko_map.get(symbol.upper(), symbol.lower())
            url = (
                f"https://api.coingecko.com/api/v3/coins/{coingecko_id}"
                f"/market_chart?vs_currency=usd&days={days}&interval=daily"
            )
            r = _req.get(url, timeout=20)
            r.raise_for_status()
            body = r.json()
            series = [
                {"t": int(t // 1000), "v": float(v)}
                for (t, v) in (body.get("prices") or [])
            ]
        else:
            # Yahoo Finance public chart API — requires a browser-like
            # user-agent header to avoid 401.
            if days <= 365:
                yahoo_range = "1y"
            elif days <= 730:
                yahoo_range = "2y"
            elif days <= 1825:
                yahoo_range = "5y"
            else:
                yahoo_range = "max"
            url = (
                f"https://query1.finance.yahoo.com/v8/finance/chart/"
                f"{symbol}?range={yahoo_range}&interval=1d"
            )
            r = _req.get(
                url,
                timeout=20,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Accept": "application/json",
                },
            )
            r.raise_for_status()
            body = r.json()
            result = (body.get("chart", {}).get("result") or [None])[0]
            if not result:
                return jsonify({"error": "no data from Yahoo Finance"}), 502
            times = result.get("timestamp", [])
            closes = (result.get("indicators", {}).get("quote") or [{}])[0].get("close", [])
            series = []
            for i in range(len(times)):
                if i < len(closes) and closes[i] is not None:
                    series.append({"t": int(times[i]), "v": float(closes[i])})
            if days > 0:
                series = series[-days:]

        return jsonify({"symbol": symbol, "assetType": asset_type, "series": series})
    except Exception as e:
        logger.exception("[forecast/history] fetch failed for %s/%s", asset_type, symbol)
        return jsonify({"error": str(e), "symbol": symbol, "assetType": asset_type}), 502


@app.route("/forecast", methods=["POST"])
def forecast_timeseries():
    """
    Forecast a 1-D time series using Google TimesFM 2.0 (500M).

    Request JSON:
        {
            "series": [float, ...],   // recent history (most recent at end)
            "horizon": int,           // # future points to forecast (1..512)
            "freq": int               // 0=hourly, 1=daily, 2=weekly (default 1)
        }

    Response JSON:
        {
            "forecast": [float, ...],       // point forecast
            "lower80":  [float, ...],       // 80% PI lower
            "upper80":  [float, ...],       // 80% PI upper
            "lower95":  [float, ...],       // 95% PI lower
            "upper95":  [float, ...],       // 95% PI upper
            "model": "google/timesfm-2.0-500m-pytorch"
        }
    """
    import numpy as _np
    data = request.get_json(force=True) or {}
    series = data.get("series")
    if not isinstance(series, list) or len(series) < 16:
        return jsonify({"error": "Provide `series` as a list of >=16 numeric points."}), 400

    try:
        history = _np.asarray(series, dtype=_np.float32)
    except Exception as e:
        return jsonify({"error": f"Invalid series: {e}"}), 400

    horizon = int(data.get("horizon", 30))
    horizon = max(1, min(512, horizon))
    freq = int(data.get("freq", 1))  # 0 hourly, 1 daily, 2 weekly

    try:
        tfm = _get_timesfm(local_only=data.get("_benchmark") is True)
    except Exception as e:
        logger.exception("[TimesFM] Failed to load model")
        return jsonify({"error": str(e)}), 500

    # Trim to context_len to stay within the model's window.
    if history.shape[0] > TIMESFM_CONTEXT_LEN:
        history = history[-TIMESFM_CONTEXT_LEN:]

    try:
        # TimesFM's native horizon is 128 per call. Chunk by rolling the input.
        remaining = horizon
        point_forecast = []
        quantiles = []  # list of 10-element arrays (10%, 20%, ..., 100%)
        ctx = history.copy()
        while remaining > 0:
            step = min(remaining, TIMESFM_HORIZON_PER_CALL)
            point, quant = tfm.forecast([ctx], freq=[freq])
            # point[0] shape: (TIMESFM_HORIZON_PER_CALL,)
            # quant[0] shape: (TIMESFM_HORIZON_PER_CALL, 10)
            point_chunk = point[0][:step]
            quant_chunk = quant[0][:step]
            point_forecast.extend(point_chunk.tolist())
            quantiles.extend(quant_chunk.tolist())
            # Roll context forward: append the point forecast, trim oldest.
            ctx = _np.concatenate([ctx, point_chunk], axis=0)[-TIMESFM_CONTEXT_LEN:]
            remaining -= step

        q = _np.array(quantiles)  # shape (horizon, 10)
        # TimesFM quantile columns are at 0.1, 0.2, ..., 1.0 (i.e. 10%..100%).
        # 80% PI: quantile 0.1 → 0.9  → indices 0 and 8
        # 95% PI: quantile 0.025 → 0.975 — not exact in 10-quantile output,
        # so we approximate with 0.1/0.9 shifted outward by 1.5x the band.
        lower80 = q[:, 0].tolist()
        upper80 = q[:, 8].tolist()
        mean = _np.array(point_forecast)
        band80 = (q[:, 8] - q[:, 0]) * 0.5
        lower95 = (mean - band80 * 1.5).tolist()
        upper95 = (mean + band80 * 1.5).tolist()

        return jsonify({
            "forecast": [float(x) for x in point_forecast],
            "lower80": [float(x) for x in lower80],
            "upper80": [float(x) for x in upper80],
            "lower95": [float(x) for x in lower95],
            "upper95": [float(x) for x in upper95],
            "horizon": horizon,
            "freq": freq,
            "model": TIMESFM_REPO,
        })
    except Exception as e:
        logger.exception("[TimesFM] Forecast failed")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# REST API: TRAINING - DATASET MANAGEMENT
# =============================================================================

@app.route("/training/datasets", methods=["GET"])
def list_training_datasets():
    """List available training datasets."""
    datasets_dir = MODEL_DIR / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)
    
    datasets = []
    for d in datasets_dir.iterdir():
        if d.is_dir():
            meta_path = d / "metadata.json"
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
                    meta["path"] = str(d)
                    datasets.append(meta)
    
    return jsonify(_json_sanitize({"datasets": datasets})), 200


def _tokenize_training_text(tokenizer, texts, max_length):
    encoded = tokenizer(texts, truncation=True, max_length=max_length, padding="max_length")
    # EOS can equal PAD. Mask padding by attention, never by token identity.
    encoded["labels"] = [
        [token if attended else -100 for token, attended in zip(ids, mask)]
        for ids, mask in zip(encoded["input_ids"], encoded["attention_mask"])
    ]
    if not any(sum(mask) >= 2 for mask in encoded["attention_mask"]):
        raise ValueError("Training examples need at least two tokens")
    return encoded


def _validated_training_files(files):
    """Validate the complete upload before creating any files on disk."""
    if not isinstance(files, list) or not 1 <= len(files) <= 128:
        raise ValueError("Provide between 1 and 128 dataset files")
    reserved = {"metadata.json", "bonzai_training_provenance.json", "provenance.md"}
    seen, decoded, total = set(), [], 0
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("Invalid dataset file")
        name = item.get("filename")
        if (not isinstance(name, str) or not name or len(name) > 240
                or name in (".", "..") or any(c in name for c in '/\\:')
                or any(ord(c) < 32 for c in name) or name.endswith((".", " "))):
            raise ValueError("Dataset files must use plain filenames without paths")
        key = name.casefold()
        if key in reserved or key in seen:
            raise ValueError("Duplicate or reserved dataset filename")
        # Windows device names are invalid even with an extension.
        if key.split(".")[0] in {"con", "prn", "aux", "nul", *[f"com{i}" for i in range(1, 10)], *[f"lpt{i}" for i in range(1, 10)]}:
            raise ValueError("Reserved device filename")
        encoded = item.get("content_base64")
        if not isinstance(encoded, str) or len(encoded) > 24 * 1024 * 1024:
            raise ValueError("Dataset file exceeds the upload limit")
        try:
            content = base64.b64decode(encoded, validate=True)
        except Exception as exc:
            raise ValueError("Invalid base64 dataset content") from exc
        total += len(content)
        if not content or total > 64 * 1024 * 1024:
            raise ValueError("Dataset upload must contain nonempty files totaling at most 64 MiB")
        seen.add(key)
        decoded.append((name, content))
    return decoded


def _training_record_path(kind, identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", identifier):
        raise ValueError("Invalid training record identifier")
    root = (MODEL_DIR / kind).resolve()
    target = root / identifier
    if target.is_symlink() or target.resolve().parent != root:
        raise ValueError("Training record must remain inside its storage directory")
    return target


@app.route("/training/datasets", methods=["POST"])
def create_training_dataset():
    """Create a new training dataset from uploaded files."""
    if request.content_length and request.content_length > 90 * 1024 * 1024:
        return jsonify({"error": "Dataset upload exceeds 90 MiB"}), 413
    data = request.get_json(silent=True) or {}
    
    name = (data.get("name") or "").strip()
    dataset_type = (data.get("type") or "").strip()  # "text", "image", or "audio"
    files = data.get("files", [])  # List of {filename, content_base64}
    provenance = data.get("provenance") or data.get("training_provenance") or {}
    if not isinstance(provenance, dict):
        provenance = {}
    
    if not name:
        return jsonify({"error": "Missing 'name'"}), 400
    if dataset_type not in ("text", "image", "audio", "video"):
        return jsonify({"error": "Type must be 'text', 'image', 'audio', or 'video'"}), 400
    if not files:
        return jsonify({"error": "No files provided"}), 400
    
    try:
        validated_files = _validated_training_files(files)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    dataset_id = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
    dataset_dir = _training_record_path("datasets", dataset_id)
    dataset_dir.mkdir(parents=True, exist_ok=False)
    saved_files = []
    try:
        for filename, content in validated_files:
            with open(dataset_dir / filename, "xb") as out:
                out.write(content)
            saved_files.append(filename)
    except Exception:
        shutil.rmtree(dataset_dir)
        raise

    metadata = {
        "id": dataset_id,
        "name": name,
        "type": dataset_type,
        "files": saved_files,
        "num_files": len(saved_files),
        "provenance_schema": provenance.get("schema"),
        "data_owner_wallets": (provenance.get("dataset") or {}).get("dataOwnerWallets", []),
        "contribution_ids": (provenance.get("dataset") or {}).get("contributionIds", []),
        "origin_record_count": len(provenance.get("origins", [])),
        "provenance": provenance,
        "created_at": datetime.now().isoformat(),
    }
    
    _write_json_file(dataset_dir / "metadata.json", metadata)
    if provenance:
        _write_json_file(dataset_dir / "bonzai_training_provenance.json", provenance)
        with open(dataset_dir / "PROVENANCE.md", "w", encoding="utf-8") as f:
            f.write(_provenance_markdown({
                "model": {"id": "pending-training", "type": "dataset", "baseModel": ""},
                "dataset": provenance.get("dataset", {}),
                "attribution": provenance.get("attribution", {}),
                "origins": provenance.get("origins", []),
            }))
    
    return jsonify(_json_sanitize({"ok": True, "dataset": metadata})), 201


@app.route("/training/datasets/<dataset_id>", methods=["DELETE"])
def delete_training_dataset(dataset_id):
    """Delete a training dataset."""
    try:
        dataset_dir = _training_record_path("datasets", dataset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    shutil.rmtree(dataset_dir)
    return jsonify({"ok": True}), 200


# =============================================================================
# REST API: TRAINING - LLM FINETUNING (Cross-Platform)
# =============================================================================

@app.route("/training/llm/start", methods=["POST"])
def start_llm_finetuning():
    """
    Start LLM finetuning using LoRA/QLoRA.

    Supports: Qwen 3.5 0.8B, Qwen 3.6 27B
    Cross-platform: CUDA (with QLoRA), MPS, CPU

    Note: 4-bit quantization (QLoRA) only available on CUDA.
    """
    data = request.get_json(silent=True) or {}

    dataset_id = (data.get("dataset_id") or "").strip()
    base_model = data.get("base_model", "qwen3_5_0_8b")
    epochs = int(data.get("epochs", 3))
    batch_size = int(data.get("batch_size", 4))
    learning_rate = float(data.get("learning_rate", 2e-4))
    lora_r = int(data.get("lora_r", 16))
    lora_alpha = int(data.get("lora_alpha", 32))
    use_4bit = bool(data.get("use_4bit", True))
    artifact_type = data.get("artifact_type", "lora")
    if artifact_type not in ("lora", "checkpoint"):
        return jsonify({"error": "Choose lora or checkpoint output"}), 400
    if artifact_type == "checkpoint" and use_4bit:
        return jsonify({"error": "Standalone checkpoint export requires non-quantized training; disable 4-bit training"}), 400
    max_seq_length = int(data.get("max_seq_length", 2048))
    uncensor = bool(data.get("uncensor", False))
    
    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400
    
    try:
        dataset_dir = _training_record_path("datasets", dataset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    if base_model not in LLM_FINETUNE_MODELS:
        return jsonify({
            "error": f"Unsupported model: {base_model}",
            "supported": list(LLM_FINETUNE_MODELS.keys())
        }), 400
    
    training_id = hashlib.md5(f"llm_{dataset_id}_{time.time()}".encode()).hexdigest()[:16]
    
    def _train_worker():
        try:
            # Determine device
            device = DeviceManager.get_device()
            device_str = str(device)
            
            # QLoRA only works on CUDA
            actual_use_4bit = use_4bit and device.type == "cuda"
            if use_4bit and not actual_use_4bit:
                logger.warning(f"[LLM Training] 4-bit quantization only available on CUDA, using full precision on {device.type}")
            
            logger.info(f"[LLM Training] Starting on {device_str}, 4-bit={actual_use_4bit}")
            
            # Memory cleanup
            gc.collect()
            if device.type == "mps":
                torch.mps.empty_cache()
            elif device.type == "cuda":
                torch.cuda.empty_cache()
            
            # Emit progress helper
            def emit_progress(stage, epoch, total_epochs, loss=None, pct=0):
                socketio.emit("training_progress", _json_sanitize({
                    "training_id": training_id,
                    "stage": stage,
                    "epoch": epoch,
                    "total_epochs": total_epochs,
                    "loss": loss,
                    "progress": pct,
                }), namespace="/training")
                try:
                    socketio.sleep(0)
                except Exception:
                    pass
            
            emit_progress("loading_dataset", 0, epochs, pct=0)
            
            # Import training dependencies
            from datasets import Dataset
            from peft import LoraConfig, get_peft_model
            from transformers import (
                AutoModelForCausalLM,
                AutoTokenizer as HFAutoTokenizer,
                TrainingArguments,
                Trainer,
                TrainerCallback,
            )
            
            # Load dataset
            meta_path = dataset_dir / "metadata.json"
            with open(meta_path) as f:
                meta = json.load(f)
            dataset_provenance = _load_dataset_provenance(dataset_dir, data)
            
            # Prepare text data
            texts = []
            for filename in meta.get("files", []):
                file_path = dataset_dir / filename
                if file_path.suffix in (".txt", ".md", ".json", ".jsonl"):
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        if file_path.suffix == ".jsonl":
                            for line in content.strip().split("\n"):
                                try:
                                    item = json.loads(line)
                                    if "text" in item:
                                        texts.append(item["text"])
                                    elif "prompt" in item and "completion" in item:
                                        texts.append(f"{item['prompt']}\n{item['completion']}")
                                except:
                                    pass
                        else:
                            texts.append(content)
            provenance_training_text = _llm_provenance_training_text(dataset_provenance)
            if provenance_training_text:
                texts.append(provenance_training_text)
            
            if not texts:
                raise ValueError("No valid text data found in dataset")
            
            logger.info(f"[LLM Training] Found {len(texts)} text samples")
            emit_progress("loading_model", 0, epochs, pct=10)
            
            # Quantization config (CUDA only)
            bnb_config = None
            if actual_use_4bit:
                try:
                    from transformers import BitsAndBytesConfig
                    bnb_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_compute_dtype=torch.bfloat16,
                        bnb_4bit_use_double_quant=True,
                    )
                except ImportError:
                    logger.warning("[LLM Training] bitsandbytes not available, using full precision")
                    actual_use_4bit = False
                    bnb_config = None
            
            # Load tokenizer
            model_name = LLM_FINETUNE_MODELS[base_model]
            tokenizer = HFAutoTokenizer.from_pretrained(
                model_name, 
                token=_hf_token(),
                trust_remote_code=True,
            )
            tokenizer.pad_token = tokenizer.eos_token
            tokenizer.padding_side = "right"
            
            # Determine dtype based on device
            if device.type == "cuda":
                compute_dtype = torch.bfloat16
            elif device.type == "mps":
                compute_dtype = torch.float16  # MPS works better with float16
            else:
                compute_dtype = torch.float32
            
            # Load model with proper device mapping
            model_kwargs = {
                "torch_dtype": compute_dtype,
                "token": _hf_token(),
                "trust_remote_code": True,
                "low_cpu_mem_usage": True,
            }
            
            if actual_use_4bit and bnb_config:
                model_kwargs["quantization_config"] = bnb_config
                model_kwargs["device_map"] = "auto"
            elif device.type == "cuda":
                model_kwargs["device_map"] = "auto"
            # For MPS/CPU, we'll move the model manually after loading
            
            model = AutoModelForCausalLM.from_pretrained(model_name, **model_kwargs)
            
            # Move to device if not using device_map
            if "device_map" not in model_kwargs:
                model = model.to(device)
            
            # Prepare for training
            if actual_use_4bit:
                try:
                    from peft import prepare_model_for_kbit_training
                    model = prepare_model_for_kbit_training(model)
                except ImportError:
                    pass
            
            emit_progress("configuring_lora", 0, epochs, pct=20)
            
            # LoRA config
            lora_config = LoraConfig(
                r=lora_r,
                lora_alpha=lora_alpha,
                target_modules=["q_proj", "k_proj", "v_proj", "o_proj", 
                               "gate_proj", "up_proj", "down_proj"],
                lora_dropout=0.05,
                bias="none",
                task_type="CAUSAL_LM",
            )
            
            model = get_peft_model(model, lora_config)
            model.print_trainable_parameters()
            
            emit_progress("preparing_data", 0, epochs, pct=30)
            
            # Tokenize
            def tokenize_fn(examples):
                return _tokenize_training_text(tokenizer, examples["text"], max_seq_length)

            dataset = Dataset.from_dict({"text": texts})
            tokenized = dataset.map(tokenize_fn, batched=True, remove_columns=["text"])
            
            # Training args
            output_dir = MODEL_DIR / "trained" / training_id
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Adjust settings based on device
            training_args_kwargs = {
                "output_dir": str(output_dir),
                "num_train_epochs": epochs,
                "per_device_train_batch_size": batch_size,
                "gradient_accumulation_steps": 4,
                "learning_rate": learning_rate,
                "weight_decay": 0.01,
                "logging_steps": 10,
                "save_steps": 100,
                "save_total_limit": 2,
                "report_to": "none",
                "dataloader_pin_memory": False,  # Important for MPS compatibility
            }
            
            # Device-specific settings
            if device.type == "cuda":
                training_args_kwargs["fp16"] = not actual_use_4bit
                training_args_kwargs["bf16"] = actual_use_4bit
            elif device.type == "mps":
                training_args_kwargs["fp16"] = False
                training_args_kwargs["bf16"] = False
            else:
                training_args_kwargs["fp16"] = False
                training_args_kwargs["bf16"] = False
            
            training_args = TrainingArguments(**training_args_kwargs)
            
            # Custom callback for progress
            class ProgressCallback(TrainerCallback):
                def __init__(self):
                    self.current_epoch = 0
                    self.current_loss = None
                
                def on_log(self, args, state, control, logs=None, **kwargs):
                    if logs and "loss" in logs:
                        self.current_loss = logs["loss"]
                    if state.epoch:
                        self.current_epoch = int(state.epoch)
                        pct = 30 + (state.epoch / epochs) * 60
                        emit_progress("training", self.current_epoch, epochs, 
                                     self.current_loss, pct)
            
            emit_progress("training", 0, epochs, pct=30)
            
            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=tokenized,
                processing_class=tokenizer,
                callbacks=[ProgressCallback()],
            )
            
            # Train
            result = trainer.train()
            
            emit_progress("saving", epochs, epochs, pct=95)
            
            # Save LoRA weights
            if not math.isfinite(float(result.training_loss)):
                raise RuntimeError("Training produced non-finite loss; artifact was not exported")
            if artifact_type == "checkpoint":
                model = model.merge_and_unload(safe_merge=True)
                model.save_pretrained(str(output_dir / "checkpoint"), safe_serialization=True, max_shard_size="2GB")
                tokenizer.save_pretrained(str(output_dir / "checkpoint"))
            else:
                model.save_pretrained(str(output_dir / "lora"), safe_serialization=True)
                tokenizer.save_pretrained(str(output_dir / "lora"))
            
            # Save metadata
            train_meta = {
                "id": training_id,
                "type": "llm_checkpoint" if artifact_type == "checkpoint" else "llm_lora",
                "content_type": "text",
                "artifact_type": artifact_type,
                "training_method": "lora",
                "checkpoint_method": "merged_lora" if artifact_type == "checkpoint" else None,
                "base_model": base_model,
                "dataset_id": dataset_id,
                "epochs": epochs,
                "final_loss": result.training_loss,
                "lora_r": lora_r,
                "lora_alpha": lora_alpha,
                "device_used": device_str,
                "used_4bit": actual_use_4bit,
                "uncensor": uncensor,
                "provenance_schema": "bonzai-model-provenance-manifest",
                "data_owner_wallets": (dataset_provenance.get("dataset") or {}).get("dataOwnerWallets", []),
                "contribution_ids": (dataset_provenance.get("dataset") or {}).get("contributionIds", []),
                "origin_record_count": len(dataset_provenance.get("origins", [])),
                "model_disclosure": dataset_provenance.get("modelDisclosure", {}),
                "created_at": datetime.now().isoformat(),
            }
            model_provenance = _model_provenance_manifest(
                training_id,
                train_meta,
                meta,
                dataset_provenance,
                {
                    "base_model": base_model,
                    "epochs": epochs,
                    "batch_size": batch_size,
                    "learning_rate": learning_rate,
                    "lora_r": lora_r,
                    "lora_alpha": lora_alpha,
                    "use_4bit": actual_use_4bit,
                    "max_seq_length": max_seq_length,
                    "uncensor": uncensor,
                },
            )
            train_meta["model_provenance"] = model_provenance
            _write_json_file(output_dir / "metadata.json", train_meta)
            _write_model_provenance(output_dir, model_provenance)
            
            # Cleanup
            del model
            del trainer
            
            socketio.emit("training_complete", _json_sanitize({
                "training_id": training_id,
                "model_id": training_id,
                "final_loss": result.training_loss,
                "model_path": str(output_dir),
                "device_used": device_str,
            }), namespace="/training")
            
        except Exception as e:
            logger.exception("LLM training failed")
            socketio.emit("training_error", _json_sanitize({
                "training_id": training_id,
                "error": str(e),
            }), namespace="/training")
        finally:
            DeviceManager.free_memory()
    
    threading.Thread(target=lambda: _run_device_background(_train_worker, "/training/start"), daemon=True).start()
    
    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": "Training started",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - SDXL LORA (Cross-Platform)
# =============================================================================

@app.route("/training/sdxl/start", methods=["POST"])
def start_sdxl_lora_training():
    """
    Start image LoRA training from an image dataset.

    Cross-platform: CUDA, MPS (Apple Silicon), CPU
    Note: 8-bit Adam only available on CUDA with bitsandbytes.
    """
    data = request.get_json(silent=True) or {}
    
    dataset_id = (data.get("dataset_id") or "").strip()
    instance_prompt = (data.get("instance_prompt") or "").strip()
    class_prompt = data.get("class_prompt", "")
    epochs = int(data.get("epochs", 100))
    batch_size = int(data.get("batch_size", 1))
    learning_rate = float(data.get("learning_rate", 1e-4))
    lora_rank = int(data.get("lora_rank", 32))
    resolution = int(data.get("resolution", 1024))
    use_8bit_adam = bool(data.get("use_8bit_adam", True))
    uncensor = bool(data.get("uncensor", False))
    
    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400
    if not instance_prompt:
        return jsonify({"error": "Missing 'instance_prompt' (e.g., 'a photo of sks person')"}), 400
    
    try:
        dataset_dir = _training_record_path("datasets", dataset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    base_model = data.get("base_model", "sdxl-base-1.0")
    if base_model == "z-image-turbo":
        return jsonify({
            "error": "Z-Image training is not implemented by this UNet trainer. Use SDXL with an image-file dataset.",
            "code": "training_not_implemented",
        }), 501
    image_repo = IMAGE_FINETUNE_MODELS.get(base_model)
    if not image_repo:
        return jsonify({"error": f"Unsupported image base model: {base_model}", "supported": list(IMAGE_FINETUNE_MODELS.keys())}), 400

    guard = _repos_ready_or_resp(image_repo)
    if guard:
        return guard
    
    training_id = hashlib.md5(f"sdxl_{dataset_id}_{time.time()}".encode()).hexdigest()[:16]
    
    def _train_worker():
        try:
            # Determine device
            device = DeviceManager.get_device()
            device_str = str(device)
            
            # 8-bit Adam only works on CUDA
            actual_use_8bit = use_8bit_adam and device.type == "cuda"
            if use_8bit_adam and not actual_use_8bit:
                logger.warning(f"[SDXL Training] 8-bit Adam only available on CUDA, using standard Adam on {device.type}")
            
            logger.info(f"[SDXL Training] Starting on {device_str}, 8-bit={actual_use_8bit}")
            
            # Memory cleanup
            gc.collect()
            if device.type == "mps":
                torch.mps.empty_cache()
                torch.mps.synchronize()
            elif device.type == "cuda":
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            
            def emit_progress(stage, epoch, total_epochs, loss=None, pct=0):
                socketio.emit("training_progress", _json_sanitize({
                    "training_id": training_id,
                    "stage": stage,
                    "epoch": epoch,
                    "total_epochs": total_epochs,
                    "loss": loss,
                    "progress": pct,
                }), namespace="/training")
                try:
                    socketio.sleep(0)
                except Exception:
                    pass
            
            emit_progress("loading_images", 0, epochs, pct=0)
            
            # Load images from dataset
            meta_path = dataset_dir / "metadata.json"
            with open(meta_path) as f:
                meta = json.load(f)
            dataset_provenance = _load_dataset_provenance(dataset_dir, data)
            
            images = []
            for filename in meta.get("files", []):
                file_path = dataset_dir / filename
                if file_path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                    img = Image.open(file_path).convert("RGB")
                    img = img.resize((resolution, resolution), Image.LANCZOS)
                    images.append(img)
            
            if not images:
                raise ValueError("No valid images found in dataset")
            
            logger.info(f"[SDXL LoRA] Found {len(images)} training images")
            
            emit_progress("loading_model", 0, epochs, pct=10)
            
            # Determine dtype based on device
            if device.type == "cuda":
                dtype = torch.float16
            elif device.type == "mps":
                dtype = torch.float16
            else:
                dtype = torch.float32
            
            # Load selected image base model.
            from diffusers import AutoPipelineForText2Image
            pipe = AutoPipelineForText2Image.from_pretrained(
                str(repo_local_dir(image_repo)),
                torch_dtype=dtype,
                use_safetensors=True,
                local_files_only=True,
            )
            
            # Move components to device (handle models without text_encoder_2)
            unet = pipe.unet.to(device)
            vae = pipe.vae.to(device)
            text_encoder = pipe.text_encoder.to(device) if pipe.text_encoder else None
            text_encoder_2 = pipe.text_encoder_2.to(device) if hasattr(pipe, 'text_encoder_2') and pipe.text_encoder_2 else None
            tokenizer = pipe.tokenizer
            tokenizer_2 = getattr(pipe, 'tokenizer_2', None)
            
            # VAE needs float32 for stability on MPS
            if device.type == "mps":
                vae = vae.to(dtype=torch.float32)
            
            emit_progress("configuring_lora", 0, epochs, pct=20)
            
            # Add LoRA layers to UNet
            from peft import LoraConfig as PeftLoraConfig
            
            unet_lora_config = PeftLoraConfig(
                r=lora_rank,
                lora_alpha=lora_rank,
                init_lora_weights="gaussian",
                target_modules=["to_k", "to_q", "to_v", "to_out.0"],
            )
            
            unet.add_adapter(unet_lora_config)
            
            # Freeze non-LoRA params
            vae.requires_grad_(False)
            if text_encoder:
                text_encoder.requires_grad_(False)
            if text_encoder_2:
                text_encoder_2.requires_grad_(False)
            unet.requires_grad_(False)
            
            # Enable LoRA params
            lora_params = []
            for name, param in unet.named_parameters():
                if "lora" in name.lower():
                    param.requires_grad = True
                    param.data = param.data.float()
                    lora_params.append(param)
            
            logger.info(f"[SDXL LoRA] Trainable parameters: {sum(p.numel() for p in lora_params)}")
            
            emit_progress("preparing_data", 0, epochs, pct=30)
            
            # Encode prompts (handles both single and dual text encoder models)
            def encode_prompt(prompt):
                text_inputs = tokenizer(
                    prompt, padding="max_length", max_length=tokenizer.model_max_length,
                    truncation=True, return_tensors="pt"
                )
                text_input_ids = text_inputs.input_ids.to(device)

                with torch.no_grad():
                    prompt_embeds = text_encoder(text_input_ids, output_hidden_states=True)
                    pooled_prompt_embeds = prompt_embeds[0]
                    prompt_embeds = prompt_embeds.hidden_states[-2]

                # Dual text encoder (SDXL-style)
                if text_encoder_2 and tokenizer_2:
                    text_inputs_2 = tokenizer_2(
                        prompt, padding="max_length", max_length=tokenizer_2.model_max_length,
                        truncation=True, return_tensors="pt"
                    )
                    text_input_ids_2 = text_inputs_2.input_ids.to(device)
                    with torch.no_grad():
                        prompt_embeds_2 = text_encoder_2(text_input_ids_2, output_hidden_states=True)
                        pooled_prompt_embeds_2 = prompt_embeds_2[0]
                        prompt_embeds_2 = prompt_embeds_2.hidden_states[-2]
                    prompt_embeds = torch.cat([prompt_embeds, prompt_embeds_2], dim=-1)
                    return prompt_embeds, pooled_prompt_embeds_2

                return prompt_embeds, pooled_prompt_embeds
            
            prompt_embeds, pooled_embeds = encode_prompt(instance_prompt)
            
            # Encode images to latents
            from torchvision import transforms
            
            transform = transforms.Compose([
                transforms.ToTensor(),
                transforms.Normalize([0.5], [0.5]),
            ])
            
            latents_list = []
            vae_dtype = torch.float32
            vae.to(dtype=vae_dtype)
            for img in images:
                img_tensor = transform(img).unsqueeze(0).to(device, dtype=vae_dtype)
                with torch.no_grad():
                    latent = vae.encode(img_tensor).latent_dist.sample()
                    latent = latent * vae.config.scaling_factor
                latents_list.append(latent.to(device="cpu", dtype=dtype))
            
            # Optimizer
            if actual_use_8bit:
                try:
                    import bitsandbytes as bnb
                    optimizer = bnb.optim.AdamW8bit(lora_params, lr=learning_rate)
                except ImportError:
                    logger.warning("[SDXL LoRA] bitsandbytes not available, using standard AdamW")
                    optimizer = torch.optim.AdamW(lora_params, lr=learning_rate)
            else:
                optimizer = torch.optim.AdamW(lora_params, lr=learning_rate)
            
            # Scheduler
            from diffusers import DDPMScheduler
            noise_scheduler = DDPMScheduler.from_config(pipe.scheduler.config)
            
            total_steps = epochs * math.ceil(len(latents_list) / batch_size)
            from diffusers.optimization import get_scheduler
            lr_scheduler = get_scheduler(
                "cosine",
                optimizer=optimizer,
                num_warmup_steps=int(total_steps * 0.1),
                num_training_steps=total_steps,
            )
            
            emit_progress("training", 0, epochs, pct=30)
            
            # Training loop
            unet.train()
            global_step = 0
            
            for epoch in range(epochs):
                epoch_loss = 0.0
                
                order = torch.randperm(len(latents_list)).tolist()
                for offset in range(0, len(order), batch_size):
                    latent = torch.cat([latents_list[i] for i in order[offset:offset + batch_size]]).to(device)
                    count = latent.shape[0]
                    # Sample noise
                    noise = torch.randn_like(latent)
                    
                    # Sample timestep
                    timesteps = torch.randint(
                        0, noise_scheduler.config.num_train_timesteps,
                        (count,), device=device
                    ).long()
                    
                    # Add noise
                    noisy_latent = noise_scheduler.add_noise(latent, noise, timesteps)
                    
                    # Predict noise
                    added_cond_kwargs = {
                        "text_embeds": pooled_embeds.repeat(count, 1),
                        "time_ids": torch.tensor(
                            [[resolution, resolution, 0, 0, resolution, resolution]],
                            device=device, dtype=dtype
                        ).repeat(count, 1),
                    }
                    
                    noise_pred = unet(
                        noisy_latent,
                        timesteps,
                        encoder_hidden_states=prompt_embeds.repeat(count, 1, 1),
                        added_cond_kwargs=added_cond_kwargs,
                    ).sample
                    
                    # Loss
                    prediction_type = noise_scheduler.config.prediction_type
                    if prediction_type == "epsilon":
                        target = noise
                    elif prediction_type == "v_prediction":
                        target = noise_scheduler.get_velocity(latent, noise, timesteps)
                    else:
                        raise ValueError(f"Unsupported training prediction type: {prediction_type}")
                    loss = torch.nn.functional.mse_loss(noise_pred.float(), target.float())
                    if not torch.isfinite(loss):
                        raise RuntimeError("Image training produced non-finite loss")
                    
                    optimizer.zero_grad()
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(lora_params, 1.0)
                    optimizer.step()
                    lr_scheduler.step()
                    
                    epoch_loss += loss.item() * count
                    global_step += 1
                
                avg_loss = epoch_loss / len(latents_list)
                pct = 30 + ((epoch + 1) / epochs) * 60
                emit_progress("training", epoch + 1, epochs, avg_loss, pct)
                
                if (epoch + 1) % 10 == 0:
                    logger.info(f"[SDXL LoRA] Epoch {epoch + 1}/{epochs}, Loss: {avg_loss:.4f}")
                
                # Memory cleanup periodically
                if (epoch + 1) % 25 == 0:
                    gc.collect()
                    if device.type == "mps":
                        torch.mps.empty_cache()
                    elif device.type == "cuda":
                        torch.cuda.empty_cache()
            
            emit_progress("saving", epochs, epochs, pct=95)
            
            # Save LoRA weights
            output_dir = MODEL_DIR / "trained" / training_id
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Export portable Diffusers adapter weights, not the entire UNet.
            from peft.utils import get_peft_model_state_dict
            from diffusers.utils import convert_state_dict_to_diffusers
            StableDiffusionXLPipeline.save_lora_weights(
                str(output_dir / "lora"),
                unet_lora_layers=convert_state_dict_to_diffusers(get_peft_model_state_dict(unet)),
                safe_serialization=True,
            )
            
            # Save metadata
            train_meta = {
                "id": training_id,
                "type": "sdxl_lora",
                "content_type": "image",
                "artifact_type": "lora",
                "base_model": base_model,
                "dataset_id": dataset_id,
                "instance_prompt": instance_prompt,
                "epochs": epochs,
                "final_loss": avg_loss,
                "lora_rank": lora_rank,
                "resolution": resolution,
                "num_images": len(images),
                "device_used": device_str,
                "uncensor": uncensor,
                "provenance_schema": "bonzai-model-provenance-manifest",
                "data_owner_wallets": (dataset_provenance.get("dataset") or {}).get("dataOwnerWallets", []),
                "contribution_ids": (dataset_provenance.get("dataset") or {}).get("contributionIds", []),
                "origin_record_count": len(dataset_provenance.get("origins", [])),
                "model_disclosure": dataset_provenance.get("modelDisclosure", {}),
                "created_at": datetime.now().isoformat(),
            }
            model_provenance = _model_provenance_manifest(
                training_id,
                train_meta,
                meta,
                dataset_provenance,
                {
                    "base_model": base_model,
                    "instance_prompt": instance_prompt,
                    "epochs": epochs,
                    "batch_size": batch_size,
                    "learning_rate": learning_rate,
                    "lora_rank": lora_rank,
                    "resolution": resolution,
                    "use_8bit": actual_use_8bit,
                    "uncensor": uncensor,
                },
            )
            train_meta["model_provenance"] = model_provenance
            _write_json_file(output_dir / "metadata.json", train_meta)
            _write_model_provenance(output_dir, model_provenance)
            
            # Cleanup
            del unet, vae, text_encoder, text_encoder_2, pipe
            del latents_list, optimizer
            
            socketio.emit("training_complete", _json_sanitize({
                "training_id": training_id,
                "model_id": training_id,
                "final_loss": avg_loss,
                "model_path": str(output_dir),
                "device_used": device_str,
            }), namespace="/training")
            
        except Exception as e:
            logger.exception("SDXL LoRA training failed")
            socketio.emit("training_error", _json_sanitize({
                "training_id": training_id,
                "error": str(e),
            }), namespace="/training")
        finally:
            DeviceManager.free_memory()
    
    threading.Thread(target=lambda: _run_device_background(_train_worker, "/training/start"), daemon=True).start()
    
    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": "SDXL LoRA training started",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - AUDIO LORA
# =============================================================================

@app.route("/training/audio/start", methods=["POST"])
def start_audio_lora_training():
    """
    Start audio LoRA preparation from an audio dataset.

    This endpoint uses the same asynchronous training contract as the text and
    image trainers so the desktop UI can track text/image/audio jobs uniformly.
    """
    # The worker below prepares metadata only; it cannot produce trained weights.
    # Fail before accepting datasets or emitting misleading completion events.
    return jsonify({
        "error": "Audio LoRA training is not implemented. No training job was started.",
        "code": "training_not_implemented",
    }), 501

    data = request.get_json(silent=True) or {}

    dataset_id = (data.get("dataset_id") or "").strip()
    base_model = data.get("base_model", "ace-step")
    steps = int(data.get("steps", 600))
    batch_size = int(data.get("batch_size", 1))
    learning_rate = float(data.get("learning_rate", 1e-4))
    lora_rank = int(data.get("lora_rank", 16))
    uncensor = bool(data.get("uncensor", False))

    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400

    try:
        dataset_dir = _training_record_path("datasets", dataset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404

    meta_path = dataset_dir / "metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            dataset_meta = json.load(f)
        if dataset_meta.get("type") != "audio":
            return jsonify({"error": "Audio LoRA requires an audio dataset"}), 400

    training_id = hashlib.md5(f"audio_{dataset_id}_{time.time()}".encode()).hexdigest()[:16]

    def _train_worker():
        try:
            output_dir = MODEL_DIR / "trained" / training_id
            output_dir.mkdir(parents=True, exist_ok=True)
            dataset_meta = _read_json_file(dataset_dir / "metadata.json", {})
            dataset_provenance = _load_dataset_provenance(dataset_dir, data)

            total = max(1, min(steps, 20))
            for step in range(total):
                socketio.emit("training_progress", _json_sanitize({
                    "training_id": training_id,
                    "epoch": step + 1,
                    "total_epochs": total,
                    "stage": "preparing_audio_lora",
                    "loss": None,
                    "progress": int(((step + 1) / total) * 90),
                }), namespace="/training")
                time.sleep(0.15)

            train_meta = {
                "id": training_id,
                "type": "audio_lora",
                "base_model": base_model,
                "dataset_id": dataset_id,
                "steps": steps,
                "batch_size": batch_size,
                "learning_rate": learning_rate,
                "lora_rank": lora_rank,
                "uncensor": uncensor,
                "provenance_schema": "bonzai-model-provenance-manifest",
                "data_owner_wallets": (dataset_provenance.get("dataset") or {}).get("dataOwnerWallets", []),
                "contribution_ids": (dataset_provenance.get("dataset") or {}).get("contributionIds", []),
                "origin_record_count": len(dataset_provenance.get("origins", [])),
                "model_disclosure": dataset_provenance.get("modelDisclosure", {}),
                "created_at": datetime.now().isoformat(),
            }
            model_provenance = _model_provenance_manifest(
                training_id,
                train_meta,
                dataset_meta,
                dataset_provenance,
                {
                    "base_model": base_model,
                    "steps": steps,
                    "batch_size": batch_size,
                    "learning_rate": learning_rate,
                    "lora_rank": lora_rank,
                    "uncensor": uncensor,
                },
            )
            train_meta["model_provenance"] = model_provenance
            _write_json_file(output_dir / "metadata.json", train_meta)
            _write_model_provenance(output_dir, model_provenance)

            socketio.emit("training_complete", _json_sanitize({
                "training_id": training_id,
                "model_id": training_id,
                "model_path": str(output_dir),
            }), namespace="/training")
        except Exception as e:
            logger.exception("Audio LoRA training failed")
            socketio.emit("training_error", _json_sanitize({
                "training_id": training_id,
                "error": str(e),
            }), namespace="/training")

    threading.Thread(target=lambda: _run_device_background(_train_worker, "/training/start"), daemon=True).start()

    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": "Audio LoRA training started",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - VIDEO (Wan 2.2 LoRA)
# =============================================================================

@app.route("/training/video/start", methods=["POST"])
def start_video_lora_training():
    """
    Start video LoRA preparation from a video dataset.

    Uses the same async training contract as text/image/audio trainers.
    Currently a structured stub — emits real stage progress but does not
    perform actual Wan 2.2 LoRA training yet.
    """
    return jsonify({
        "error": "Video LoRA training is not implemented. No training job was started.",
        "code": "training_not_implemented",
    }), 501

    data = request.get_json(silent=True) or {}

    dataset_id = (data.get("dataset_id") or "").strip()
    base_model = data.get("base_model", "wan-2.2")
    steps = int(data.get("steps", 600))
    batch_size = int(data.get("batch_size", 1))
    learning_rate = float(data.get("learning_rate", 1e-4))
    lora_rank = int(data.get("lora_rank", 16))
    resolution = int(data.get("resolution", 480))
    num_frames = int(data.get("num_frames", 81))
    uncensor = bool(data.get("uncensor", False))

    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400

    try:
        dataset_dir = _training_record_path("datasets", dataset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404

    meta_path = dataset_dir / "metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            dataset_meta = json.load(f)
        if dataset_meta.get("type") != "video":
            return jsonify({"error": "Video LoRA requires a video dataset"}), 400

    training_id = hashlib.md5(f"video_{dataset_id}_{time.time()}".encode()).hexdigest()[:16]

    def _train_worker():
        try:
            output_dir = MODEL_DIR / "trained" / training_id
            output_dir.mkdir(parents=True, exist_ok=True)
            dataset_meta = _read_json_file(dataset_dir / "metadata.json", {})
            dataset_provenance = _load_dataset_provenance(dataset_dir, data)

            stages = [
                ("loading_data", "Loading video frames"),
                ("encoding_latents", "Encoding VAE latents"),
                ("configuring_lora", "Configuring LoRA adapter"),
                ("training", "Training video LoRA"),
                ("saving", "Saving adapter weights"),
            ]

            total_steps = max(1, min(steps, 20))
            for stage_idx, (stage_name, stage_label) in enumerate(stages):
                for step in range(total_steps):
                    overall_pct = int((stage_idx * 20 +
                                      (step + 1) / total_steps * 20))
                    socketio.emit("training_progress", _json_sanitize({
                        "training_id": training_id,
                        "epoch": step + 1,
                        "total_epochs": total_steps,
                        "stage": stage_name,
                        "loss": None,
                        "progress": min(overall_pct, 95),
                        "detail": stage_label,
                    }), namespace="/training")
                    time.sleep(0.1)

            train_meta = {
                "id": training_id,
                "type": "video_lora",
                "base_model": base_model,
                "dataset_id": dataset_id,
                "steps": steps,
                "batch_size": batch_size,
                "learning_rate": learning_rate,
                "lora_rank": lora_rank,
                "resolution": resolution,
                "num_frames": num_frames,
                "uncensor": uncensor,
                "provenance_schema": "bonzai-model-provenance-manifest",
                "data_owner_wallets": (dataset_provenance.get("dataset") or {}).get("dataOwnerWallets", []),
                "contribution_ids": (dataset_provenance.get("dataset") or {}).get("contributionIds", []),
                "origin_record_count": len(dataset_provenance.get("origins", [])),
                "model_disclosure": dataset_provenance.get("modelDisclosure", {}),
                "created_at": datetime.now().isoformat(),
            }
            model_provenance = _model_provenance_manifest(
                training_id,
                train_meta,
                dataset_meta,
                dataset_provenance,
                {
                    "base_model": base_model,
                    "steps": steps,
                    "batch_size": batch_size,
                    "learning_rate": learning_rate,
                    "lora_rank": lora_rank,
                    "resolution": resolution,
                    "num_frames": num_frames,
                    "uncensor": uncensor,
                },
            )
            train_meta["model_provenance"] = model_provenance
            _write_json_file(output_dir / "metadata.json", train_meta)
            _write_model_provenance(output_dir, model_provenance)

            socketio.emit("training_complete", _json_sanitize({
                "training_id": training_id,
                "model_id": training_id,
                "model_path": str(output_dir),
            }), namespace="/training")
        except Exception as e:
            logger.exception("Video LoRA training failed")
            socketio.emit("training_error", _json_sanitize({
                "training_id": training_id,
                "error": str(e),
            }), namespace="/training")

    threading.Thread(target=lambda: _run_device_background(_train_worker, "/training/start"), daemon=True).start()

    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": "Video LoRA training started",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - ABLITERATION (via OBLITERATUS)
# =============================================================================

# Models available for abliteration (≤14B only — larger models need 40GB+ VRAM
# for the activation probing step).  Keys match flagship.js LLM_BASE_MODELS.
ABLIT_MODELS = {
    "gemma_3_1b": "google/gemma-3-1b-it",
    "gemma_3_12b": "google/gemma-3-12b-it",
    "llama_3_1_8b": "meta-llama/Llama-3.1-8B-Instruct",
    "qwen3_5_0_8b": "Qwen/Qwen3.5-0.8B",
    "qwen3_5_2b": "Qwen/Qwen3.5-2B",
    "qwen3_5_4b": "Qwen/Qwen3.5-4B",
    "qwen3_5_9b": "Qwen/Qwen3.5-9B",
    "phi_4_mini": "microsoft/Phi-4-mini-instruct",
    "hermes_4_14b": "NousResearch/Hermes-4-14B",
    "mistral_small_3_2_24b": "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
    "nemotron_3_nano_4b": "nvidia/NVIDIA-Nemotron-3-Nano-4B-Instruct",
    "ministral_3b": "mistralai/Ministral-3-3B-Instruct-2512",
    "ministral_8b": "mistralai/Ministral-3-8B-Instruct-2512",
    "llm_glm_4_7": "THUDM/GLM-4-9B-Chat",
}

ABLIT_MODEL_INFO = [
    {"key": k, "name": v.split("/")[-1], "repo": v}
    for k, v in ABLIT_MODELS.items()
]


def _find_convert_script():
    """Locate convert_hf_to_gguf.py — bundled in src/server/scripts/ or llama.cpp clone."""
    candidates = [
        Path(__file__).parent / "scripts" / "convert_hf_to_gguf.py",
        MODEL_DIR / "bin" / "convert_hf_to_gguf.py",
        Path.home() / "llama.cpp" / "convert_hf_to_gguf.py",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


def _find_quantize_binary():
    """Locate llama-quantize binary (same directory as llama-server)."""
    bin_dir = USER_BIN_DIR
    candidates = [
        bin_dir / "llama-quantize",
        bin_dir / "quantize",
    ]
    # Also check platform-specific app bundle path
    if platform.system() == "Darwin":
        app_bin = (Path(__file__).parent.parent.parent / "bin" / "darwin-arm64")
        candidates += [app_bin / "llama-quantize", app_bin / "quantize"]
    elif platform.system() == "Linux":
        app_bin = (Path(__file__).parent.parent.parent / "bin" / "linux-x64")
        candidates += [app_bin / "llama-quantize", app_bin / "quantize"]

    for p in candidates:
        if p.exists():
            return str(p)
    # Fallback: check PATH
    which = shutil.which("llama-quantize") or shutil.which("quantize")
    return which


@app.route("/training/abliterate/start", methods=["POST"])
def start_abliteration():
    """
    Start abliteration of an LLM model via OBLITERATUS.

    Request body:
    {
        "base_model": "llama_3_1_8b",   // key from ABLIT_MODELS
        "method": "advanced",            // basic | advanced | nuclear
        "quantization": "Q4_K_M"        // Q2_K | Q3_K_M | Q4_K_M | Q5_K_M | Q8_0
    }

    Pipeline: OBLITERATUS (HF) → convert_hf_to_gguf.py → llama-quantize → GGUF
    """
    data = request.get_json(silent=True) or {}

    base_model = (data.get("base_model") or "").strip()
    method = (data.get("method") or "advanced").strip()
    quantization = (data.get("quantization") or "Q4_K_M").strip().upper()

    if not base_model:
        return jsonify({"error": "Missing 'base_model'"}), 400
    if base_model not in ABLIT_MODELS:
        return jsonify({"error": f"Unknown model: {base_model}", "supported": list(ABLIT_MODELS.keys())}), 400

    valid_methods = ("basic", "advanced", "aggressive", "surgical", "optimized", "inverted", "nuclear", "informed")
    if method not in valid_methods:
        return jsonify({"error": f"Invalid method: {method}", "valid": list(valid_methods)}), 400

    valid_quants = ("Q2_K", "Q3_K_M", "Q4_K_M", "Q5_K_M", "Q8_0", "F16")
    if quantization not in valid_quants:
        return jsonify({"error": f"Invalid quantization: {quantization}", "valid": list(valid_quants)}), 400

    training_id = hashlib.md5(f"ablit_{base_model}_{method}_{time.time()}".encode()).hexdigest()[:16]
    output_dir = MODEL_DIR / "trained" / training_id
    output_dir.mkdir(parents=True, exist_ok=True)

    hf_repo = ABLIT_MODELS[base_model]

    def _abliterate_worker():
        abl_dir = None
        f16_path = None
        quality_metrics = {}
        try:
            # ── Stage 1: Abliteration (OBLITERATUS) ─────────────────────
            STAGE_PCT = {
                "summon": (0, 15), "probe": (15, 35), "distill": (35, 55),
                "excise": (55, 75), "verify": (75, 90), "rebirth": (90, 100),
            }

            def emit_progress(stage, progress, detail="", **extra):
                payload = {
                    "training_id": training_id,
                    "stage": stage,
                    "epoch": 0,
                    "total_epochs": 0,
                    "loss": None,
                    "progress": int(progress),
                    "detail": detail,
                }
                payload.update(extra)
                socketio.emit("training_progress", _json_sanitize(payload), namespace="/training")
                try:
                    socketio.sleep(0)
                except Exception:
                    pass

            def on_stage(result):
                """OBLITERATUS stage callback — maps pipeline stages to SocketIO events."""
                nonlocal quality_metrics
                stage = result.stage   # "summon", "probe", "distill", "excise", "verify", "rebirth"
                status = result.status  # "running" or "done"
                lo, hi = STAGE_PCT.get(stage, (0, 100))
                pct = hi if status == "done" else lo
                stage_labels = {
                    "summon": "SUMMON", "probe": "PROBE", "distill": "DISTILL",
                    "excise": "EXCISE", "verify": "VERIFY", "rebirth": "REBIRTH",
                }
                label = stage_labels.get(stage, stage.upper())
                detail_msg = result.message or f"{label} {'complete' if status == 'done' else '...'}"
                extra = {}
                # On VERIFY done, include quality metrics
                if stage == "verify" and status == "done" and result.details:
                    quality_metrics = {k: v for k, v in result.details.items()
                                       if k in ("perplexity", "coherence", "refusal_rate",
                                                "kl_divergence", "spectral_certification", "degenerate_count")}
                    extra["quality_metrics"] = quality_metrics
                emit_progress(stage, pct, detail_msg, **extra)

            emit_progress("summon", 0, f"Loading {hf_repo}...")
            logger.info("Abliteration starting: %s method=%s quant=%s", hf_repo, method, quantization)

            from obliteratus.abliterate import AbliterationPipeline

            abl_dir = str(output_dir / "abliterated_hf")

            pipeline = AbliterationPipeline(
                model_name=hf_repo,
                method=method,
                output_dir=abl_dir,
                max_seq_length=512,
                on_stage=on_stage,
            )

            pipeline.run()

            # Read quality metrics from saved metadata if not captured via callback
            if not quality_metrics:
                meta_path = Path(abl_dir) / "abliteration_metadata.json"
                if meta_path.exists():
                    with open(meta_path) as f:
                        ablit_meta = json.load(f)
                    quality_metrics = ablit_meta.get("quality_metrics", {})

            # ── Stage 2: Convert HF → GGUF (f16) ──────────────────────
            convert_script = _find_convert_script()
            if not convert_script:
                raise FileNotFoundError(
                    "convert_hf_to_gguf.py not found. "
                    "Place it in src/server/scripts/ or ~/llama.cpp/"
                )

            f16_path = str(output_dir / f"{base_model}-abliterated-f16.gguf")
            emit_progress("converting", 0, "Converting HF → GGUF (f16)...")

            convert_cmd = [
                sys.executable, convert_script,
                abl_dir,
                "--outfile", f16_path,
                "--outtype", "f16",
            ]
            result = subprocess.run(
                convert_cmd,
                capture_output=True, text=True, timeout=1800,
            )
            if result.returncode != 0:
                raise RuntimeError(f"GGUF conversion failed: {result.stderr[:500]}")

            emit_progress("converting", 100, "GGUF conversion complete")

            # ── Stage 3: Quantize ──────────────────────────────────────
            if quantization != "F16":
                quant_bin = _find_quantize_binary()
                if not quant_bin:
                    logger.warning("llama-quantize not found, saving f16 GGUF only")
                    final_name = f"{base_model}-abliterated-f16.gguf"
                    final_path = f16_path
                else:
                    final_name = f"{base_model}-abliterated-{quantization.lower()}.gguf"
                    final_path = str(output_dir / final_name)
                    emit_progress("quantizing", 0, f"Quantizing to {quantization}...")

                    quant_cmd = [quant_bin, f16_path, final_path, quantization]
                    result = subprocess.run(
                        quant_cmd,
                        capture_output=True, text=True, timeout=3600,
                    )
                    if result.returncode != 0:
                        raise RuntimeError(f"Quantization failed: {result.stderr[:500]}")

                    # Remove intermediate f16 file
                    try:
                        os.remove(f16_path)
                    except OSError:
                        pass
                    f16_path = None

                    emit_progress("quantizing", 100, "Quantization complete")
            else:
                final_name = f"{base_model}-abliterated-f16.gguf"
                final_path = f16_path

            # ── Cleanup HF abliterated weights ─────────────────────────
            if abl_dir and Path(abl_dir).exists():
                try:
                    shutil.rmtree(abl_dir)
                except OSError:
                    pass
                abl_dir = None

            # ── Save metadata ──────────────────────────────────────────
            meta = {
                "id": training_id,
                "type": "abliteration",
                "base_model": base_model,
                "hf_repo": hf_repo,
                "method": method,
                "quantization": quantization if quantization != "F16" else "f16",
                "filename": final_name,
                "path": str(output_dir),
                "quality_metrics": quality_metrics,
                "created_at": datetime.now().isoformat(),
            }
            with open(output_dir / "metadata.json", "w") as f:
                json.dump(meta, f, indent=2)

            socketio.emit("training_complete", _json_sanitize({
                "training_id": training_id,
                "model_id": training_id,
                "model_path": str(final_path),
                "quality_metrics": quality_metrics,
                "filename": final_name,
                "type": "abliteration",
            }), namespace="/training")
            logger.info("Abliteration complete: %s → %s", base_model, final_name)

        except Exception as e:
            logger.exception("Abliteration failed")
            socketio.emit("training_error", _json_sanitize({
                "training_id": training_id,
                "error": str(e),
            }), namespace="/training")
        finally:
            # Cleanup on failure
            if abl_dir and Path(abl_dir).exists():
                shutil.rmtree(abl_dir, ignore_errors=True)
            if f16_path and Path(f16_path).exists():
                os.remove(f16_path)
            DeviceManager.free_memory()

    threading.Thread(target=lambda: _run_device_background(_abliterate_worker, "/abliteration/start"), daemon=True).start()

    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": f"Abliteration started: {base_model} ({method}, {quantization})",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - LIST TRAINED MODELS
# =============================================================================

from hub_publish import register_hub_publish
register_hub_publish(app, MODEL_DIR / "trained")


@app.route("/training/models", methods=["GET"])
def list_trained_models():
    """List all trained models (LoRAs, finetunes)."""
    trained_dir = MODEL_DIR / "trained"
    trained_dir.mkdir(parents=True, exist_ok=True)
    
    models = []
    for d in trained_dir.iterdir():
        if d.is_dir():
            meta_path = d / "metadata.json"
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
                    meta["path"] = str(d)
                    models.append(meta)
    
    return jsonify(_json_sanitize({"models": models})), 200


@app.route("/training/models/<model_id>", methods=["DELETE"])
def delete_trained_model(model_id):
    """Delete a trained model."""
    try:
        model_dir = _training_record_path("trained", model_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404
    
    shutil.rmtree(model_dir)
    return jsonify({"ok": True}), 200


@app.route("/training/models/<model_id>/provenance", methods=["GET"])
def get_trained_model_provenance(model_id):
    """Return record-level BonzAI provenance for a trained model when available."""
    try:
        model_dir = _training_record_path("trained", model_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404

    provenance = _read_json_file(model_dir / "bonzai_model_provenance.json", {})
    if not provenance:
        metadata = _read_json_file(model_dir / "metadata.json", {})
        provenance = metadata.get("model_provenance") or {}
    if not provenance:
        return jsonify({"error": "No provenance found for model"}), 404

    return jsonify(_json_sanitize({"provenance": provenance})), 200


@app.route("/training/models/<model_id>/economy", methods=["POST"])
def update_trained_model_economy(model_id):
    """Persist mint/token/registry state beside a trained model."""
    try:
        model_dir = _training_record_path("trained", model_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid economy payload"}), 400

    allowed_keys = {
        "nft",
        "fineTuneToken",
        "modelRegistry",
        "revenueRoute",
        "marketplace",
        "trainingMaterial",
        "contributionRouting",
        "tokenProfile",
        "validation",
    }
    patch = {key: data[key] for key in allowed_keys if key in data}
    if not patch:
        return jsonify({"error": "No economy fields provided"}), 400

    metadata_path = model_dir / "metadata.json"
    metadata = _read_json_file(metadata_path, {})
    economy = metadata.get("economy") if isinstance(metadata.get("economy"), dict) else {}
    economy.update(patch)
    economy["updated_at"] = datetime.now().isoformat()
    metadata["economy"] = economy

    for key, value in patch.items():
        metadata[key] = value

    _write_json_file(metadata_path, metadata)

    return jsonify(_json_sanitize({
        "ok": True,
        "economy": economy,
    })), 200


@app.route("/training/models/<model_id>/validate", methods=["POST"])
def validate_trained_model(model_id):
    """Versioned SHA256 of artifact bytes plus local structural checks, not an inference benchmark or independent attestation."""
    trained_root = (MODEL_DIR / "trained").resolve()
    model_dir = trained_root / model_id
    # The endpoint must never read or update a model outside its trained folder.
    try:
        model_dir = model_dir.resolve()
        model_dir.relative_to(trained_root)
        if model_dir == trained_root:
            raise ValueError("Invalid model directory")
    except (ValueError, OSError, RuntimeError):
        return jsonify({"error": "Model directory escapes the trained model folder"}), 422
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404

    metadata_path = model_dir / "metadata.json"
    if metadata_path.is_symlink():
        return jsonify({"error": "Symlinked model metadata cannot be validated"}), 422
    metadata = _read_json_file(metadata_path, {})
    artifacts = []
    errors = []
    warnings = []

    for path in sorted(model_dir.rglob("*"), key=lambda item: item.as_posix()):
        relative_path = str(path.relative_to(model_dir))
        # Generated training artifacts are regular files. Reject links rather
        # than following a link into unrelated local data (including directories).
        if path.is_symlink():
            errors.append(f"Symlink artifact cannot be validated: {relative_path}")
            continue
        if not path.is_file() or path == metadata_path:
            continue
        try:
            path.resolve().relative_to(model_dir)
            digest = hashlib.sha256()
            size = 0
            # O_NOFOLLOW prevents replacement with a file symlink between the
            # check above and opening. Hash large weights in bounded chunks.
            descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(descriptor, "rb") as handle:
                before = os.fstat(handle.fileno())
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
                    size += len(chunk)
                after = os.fstat(handle.fileno())
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino) or size != after.st_size:
                errors.append(f"Artifact changed during validation: {relative_path}")
                continue
        except (OSError, ValueError) as exc:
            errors.append(f"Could not hash {relative_path}: {type(exc).__name__}")
            continue
        if size > 0:
            artifacts.append({"path": relative_path, "bytes": size, "sha256": digest.hexdigest()})

    ggufs = [model_dir / item["path"] for item in artifacts if item["path"].lower().endswith(".gguf")]
    if ggufs:
        for path in ggufs:
            try:
                with open(path, "rb") as handle:
                    if handle.read(4) != b"GGUF":
                        errors.append(f"{path.name} is not a valid GGUF artifact")
            except OSError as exc:
                errors.append(f"Could not read {path.name}: {exc}")
    else:
        adapter_files = {Path(item["path"]).name for item in artifacts}
        if metadata.get("artifact_type") == "checkpoint":
            checkpoint = model_dir / "checkpoint"
            config_file = checkpoint / "config.json"
            checkpoint_config = _read_json_file(config_file, {}) if not config_file.is_symlink() else {}
            if not checkpoint_config.get("model_type"):
                errors.append("Standalone checkpoint is missing its model configuration")
            weight_paths = [model_dir / item["path"] for item in artifacts
                            if item["path"].startswith("checkpoint/") and item["path"].endswith(".safetensors")]
            if not weight_paths:
                errors.append("Standalone checkpoint has no safetensors weights")
            try:
                from safetensors import safe_open
                keys_by_file = {}
                for weights in weight_paths:
                    with safe_open(str(weights), framework="pt", device="cpu") as handle:
                        keys_by_file[weights.name] = set(handle.keys())
                index_file = checkpoint / "model.safetensors.index.json"
                if index_file.exists() and not index_file.is_symlink():
                    index = _read_json_file(index_file, {}).get("weight_map", {})
                    if not index or any(key not in keys_by_file.get(shard, set()) for key, shard in index.items()):
                        errors.append("Standalone checkpoint shard index is incomplete")
                elif "model.safetensors" not in keys_by_file:
                    errors.append("Sharded checkpoint is missing its index")
            except Exception as exc:
                errors.append(f"Could not validate checkpoint weights: {type(exc).__name__}")
            warnings.append("Artifact integrity is not an inference or quality evaluation")
        elif not ({"adapter_model.safetensors", "pytorch_lora_weights.safetensors"} & adapter_files):
            errors.append("No runnable GGUF or adapter weights were found")

    metrics = metadata.get("quality_metrics") or {}
    final_loss = metadata.get("final_loss")
    if final_loss is not None:
        try:
            if not math.isfinite(float(final_loss)):
                errors.append("Training loss is not finite")
        except (TypeError, ValueError):
            errors.append("Training loss is invalid")
    if metadata.get("type") == "abliteration" and not metrics:
        warnings.append("Abliteration quality metrics are missing")

    validation_payload = {
        "scheme": "bonzai-local-artifact-sha256-v1",
        "model_id": model_id,
        "model_kind": "abliterated" if metadata.get("type") == "abliteration" else "fine_tuned",
        "artifacts": artifacts,
        "metrics": metrics,
        "final_loss": final_loss,
        "errors": errors,
        "warnings": warnings,
    }
    digest = hashlib.sha256(json.dumps(validation_payload, sort_keys=True, default=str).encode()).hexdigest()
    validation = {
        "status": "passed" if not errors else "failed",
        "hash": f"0x{digest}",
        "validated_at": datetime.now().isoformat(),
        **validation_payload,
    }
    metadata["validation"] = validation
    economy = metadata.get("economy") if isinstance(metadata.get("economy"), dict) else {}
    economy["validation"] = validation
    metadata["economy"] = economy
    _write_json_file(metadata_path, metadata)
    return jsonify(_json_sanitize({"ok": not errors, "validation": validation})), 200 if not errors else 422


@app.route("/training/models/<model_id>/export", methods=["POST"])
def export_trained_model(model_id):
    """Export a trained model to a specified path."""
    try:
        model_dir = _training_record_path("trained", model_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404
    
    data = request.get_json(silent=True) or {}
    export_path = data.get("export_path")
    
    if not export_path:
        # Return the model directory path for Electron to handle
        return jsonify(_json_sanitize({
            "ok": True,
            "model_path": str(model_dir),
        })), 200
    
    # Copy to export path
    shutil.copytree(model_dir, export_path, dirs_exist_ok=True)
    
    return jsonify(_json_sanitize({
        "ok": True,
        "exported_to": export_path,
    })), 200


# =============================================================================
# REST API: TRAINING - DEVICE INFO
# =============================================================================

@app.route("/training/info", methods=["GET"])
def training_info():
    """Get training capabilities based on current device."""
    device = DeviceManager.get_device()
    
    # Check bitsandbytes availability (CUDA only)
    bnb_available = False
    if device.type == "cuda":
        try:
            import bitsandbytes
            bnb_available = True
        except ImportError:
            pass
    
    return jsonify(_json_sanitize({
        "device": str(device),
        "device_type": device.type,
        "capabilities": {
            "4bit_quantization": device.type == "cuda" and bnb_available,
            "8bit_adam": device.type == "cuda" and bnb_available,
            "fp16": device.type in ("cuda", "mps"),
            "bf16": device.type == "cuda",
        },
        "supported_llm_models": [{"key": k, "repo": v} for k, v in LLM_FINETUNE_MODELS.items()],
        "supported_image_models": [
            {"key": "sdxl-base-1.0", "repo": SDXL_BASE_REPO},
        ],
        "supported_audio_models": [],
        "supported_video_models": [],
        "training_modalities": {
            "text": {"implemented": True, "dataset_format": "text_jsonl"},
            "image": {"implemented": True, "dataset_format": "image_files", "desktop_import_supported": False},
            "audio": {"implemented": False},
            "video": {"implemented": False},
        },
        "supported_dataset_types": ["text", "image", "audio", "video"],
        "abliteration_models": ABLIT_MODEL_INFO,
        "abliteration_quantize_available": _find_quantize_binary() is not None,
        "abliteration_convert_available": _find_convert_script() is not None,
        "notes": [
            "QLoRA (4-bit) only available on CUDA with bitsandbytes",
            "MPS (Apple Silicon) uses float16 precision",
            "CPU training is slow but works for small models",
        ] if device.type != "cuda" else [],
    })), 200

# =============================================================================
# REST API: HEALTH & ROOT
# =============================================================================

# =============================================================================
# CROSS-PLATFORM VISION / OCR / CAPTIONING (llama.cpp GGUF + mmproj)
# =============================================================================

def _vision_bridge(image_b64, prompt, max_tokens):
    raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
    image = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
    normalized = io.BytesIO()
    image.save(normalized, format="JPEG", quality=92)
    response = requests.post(
        "http://127.0.0.1:3002/api/vision/analyze",
        json={
            "image_base64": base64.b64encode(normalized.getvalue()).decode("ascii"),
            "prompt": prompt,
            "max_tokens": max_tokens,
            "_benchmark": (request.get_json(silent=True) or {}).get("_benchmark") is True,
        },
        timeout=900,
    )
    payload = response.json()
    if not response.ok or payload.get("error"):
        raise RuntimeError(payload.get("error") or f"Vision bridge HTTP {response.status_code}")
    return (payload.get("response") or "").strip()

def _run_shared_vision(endpoint, pipeline, prompt, max_tokens, text_key="response", mode=None):
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image_base64") or data.get("image")
    if not image_b64:
        return jsonify({"error": "image_base64 is required"}), 400
    guard = _ensure_files_present_or_start(pipeline, auto_download=bool(data.get("auto_download", False)))
    if guard:
        return guard
    gen_id = genbus.new(pipeline, {"endpoint": endpoint, "prompt": prompt[:100]})
    try:
        genbus.progress(gen_id, "Analyzing image", 5, 10)
        text = _vision_bridge(image_b64, prompt, max_tokens)
        genbus.progress(gen_id, "Complete", 10, 10)
        genbus.finish(gen_id)
        result = {"success": True, text_key: text, "generation_id": gen_id}
        if mode is not None:
            result["mode"] = mode
        return jsonify(_json_sanitize(result))
    except Exception as e:
        logger.exception(f"[Vision] {endpoint} failed: {e}")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/vision/analyze", methods=["POST"])
def vision_analyze():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "Describe this image in detail.").strip()
    return _run_shared_vision("/vision/analyze", "vision", prompt, int(data.get("max_tokens", 512)))

@app.route("/vision/ocr", methods=["POST"])
def vision_ocr():
    data = request.get_json(silent=True) or {}
    mode = (data.get("mode") or "text").strip().lower()
    prompts = {
        "text": "Transcribe every visible character exactly. Preserve reading order and line breaks.",
        "formula": "Transcribe all formulas exactly in LaTeX. Return no commentary.",
        "table": "Transcribe the table as Markdown, preserving rows, columns, and values.",
        "full": "Transcribe all visible text, formulas, and tables in reading order as Markdown.",
    }
    return _run_shared_vision("/vision/ocr", "ocr", prompts.get(mode, prompts["text"]),
                              int(data.get("max_tokens", 4096)), "text", mode)

@app.route("/vision/caption", methods=["POST"])
def vision_caption():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "Describe the current video frame concisely.").strip()
    return _run_shared_vision("/vision/caption", "vision_caption", prompt, int(data.get("max_tokens", 200)))

@app.route("/vision/unload", methods=["POST"])
@app.route("/vision/ocr/unload", methods=["POST"])
@app.route("/vision/caption/unload", methods=["POST"])
def vision_unload():
    return jsonify({"success": True, "message": "Vision is managed by the cross-platform llama.cpp pool"})


@app.route("/")
def root():
    return jsonify(_json_sanitize({
        "message": "BonzAI Media Generation Server",
        "local_only": LOCAL_ONLY
    }))


@app.route("/config")
def config():
    """Return current server configuration including paths."""
    return jsonify(_json_sanitize({
        "model_dir": str(MODEL_DIR),
        "files_dir": str(FILES_DIR),
        "hf_home": os.environ.get("HF_HOME", ""),
        "local_only": LOCAL_ONLY,
    }))


from benchmark_environment import install_benchmark_environment
install_benchmark_environment(app, plan=_cached_plan_for, ready=_is_pipeline_complete,
    repo_dir=repo_local_dir, model_dir=MODEL_DIR, activity=genbus.snapshot, device=DeviceManager.get_device,
    extras=lambda key: [(Z_LOCAL_CHECKPOINT_NAME, False)] if key == 'image_quality' else [])


@app.route("/health")
def health():
    return jsonify(_json_sanitize({
        "status": "healthy",
        "device": str(DeviceManager.get_device()),
        "has_hf_token": bool(_hf_token()),
        "local_only": LOCAL_ONLY,
        "model_dir": str(MODEL_DIR),
    }))


@app.route("/memory/clear", methods=["POST", "OPTIONS"])
def memory_clear():
    """
    Clear GPU/CPU memory after generation to free resources.
    Called by frontend between generation tasks.
    Aggressively unloads ALL cached models to free maximum memory.

    Optional JSON body:
    - preserve_tts: bool - if true, keep voice prompt cache (for voice consistency during chat)
                           TTS models themselves are always unloaded to free VRAM.
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200

    try:
        # Check if we should preserve TTS models
        data = request.get_json(silent=True) or {}
        preserve_tts = data.get("preserve_tts", False)

        release_idle_caches(globals(), "/memory/clear")
        unloaded = []
        preserved = []

        # Unload ACE-Step v1.5 Diffusers pipeline
        global _ace_step_pipeline, _ace_step_offload
        if _ace_step_pipeline is not None:
            _ace_step_pipeline = None
            _ace_step_offload = None
            unloaded.append("ace_step_music")

        # Always unload Kokoro TTS pipeline (voice cache is preserved separately)
        global _kokoro_pipeline
        if _kokoro_pipeline is not None:
            try:
                del _kokoro_pipeline
            except:
                pass
            _kokoro_pipeline = None
            unloaded.append("kokoro_tts")

        # Always unload Chatterbox (voice reference paths remain cacheable).
        global _chatterbox_tts
        if _chatterbox_tts is not None:
            _chatterbox_tts = None
            unloaded.append("chatterbox_tts")


        # Voice prompt cache: preserve when preserve_tts=True (small, enables voice consistency)
        global _voice_prompt_cache
        if _voice_prompt_cache:
            cache_size = len(_voice_prompt_cache)
            if preserve_tts:
                preserved.append(f"voice_cache({cache_size})")
            else:
                _voice_prompt_cache.clear()
                unloaded.append(f"voice_cache({cache_size})")

        # Clear any GGUF model locks state
        global _GGUF_LOCKS_GUARD
        # Just trigger cleanup, don't delete the lock itself

        # Garbage collection
        gc.collect()

        # Clear PyTorch CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # Clear PyTorch MPS cache (Apple Silicon)
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
            torch.mps.synchronize()

        # Call device manager cleanup
        DeviceManager.free_memory()

        # Try to clear HuggingFace accelerate offload state if present
        try:
            from accelerate.hooks import remove_hook_from_module
            # This helps clear CPU offload hooks that hold model references
        except ImportError:
            pass

        logger.info(f"[Memory] Aggressively cleared RAM/VRAM. Unloaded: {unloaded or 'none cached'}, Preserved: {preserved or 'none'}")
        return jsonify({"success": True, "message": "Memory cleared", "unloaded": unloaded, "preserved": preserved})
    except Exception as e:
        logger.warning(f"[Memory] Clear failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/memory/status", methods=["GET"])
def memory_status():
    """Get current memory usage status."""
    try:
        import psutil
        process = psutil.Process()
        mem_info = process.memory_info()

        status = {
            "rss_gb": round(mem_info.rss / (1024**3), 2),
            "vms_gb": round(mem_info.vms / (1024**3), 2),
            "cached_models": [],
        }

        if _kokoro_pipeline is not None:
            status["cached_models"].append("kokoro_tts")
        if _chatterbox_tts is not None:
            status["cached_models"].append("chatterbox_tts")
        if _ace_step_pipeline is not None:
            status["cached_models"].append("ace_step_music")
        if _voice_prompt_cache:
            status["cached_models"].append(f"voice_cache({len(_voice_prompt_cache)})")

        if torch.cuda.is_available():
            status["cuda_allocated_gb"] = round(torch.cuda.memory_allocated() / (1024**3), 2)
            status["cuda_reserved_gb"] = round(torch.cuda.memory_reserved() / (1024**3), 2)

        return jsonify(status)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# MAIN
# =============================================================================

logger.info(f"HF_HOME={os.environ.get('HF_HOME')}")
logger.info(f"HF token present? {bool(_hf_token())}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="BonzAI Media Generation Server")
    parser.add_argument("--port", type=int, default=65000, help="Port to run the server on")
    args = parser.parse_args()

    logger.info("Starting BonzAI Media Generation Server")
    logger.info(f"Device: {DeviceManager.get_device()}")
    logger.info(f"Model directory: {MODEL_DIR}")
    socketio.run(app, host="0.0.0.0", port=args.port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
