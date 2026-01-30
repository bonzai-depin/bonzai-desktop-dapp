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
os.environ["TRANSFORMERS_ATTN_IMPLEMENTATION"] = "eager"

import re
import io
import time
import base64
import logging
import threading
import hashlib
import platform
import shutil
import subprocess
import gc
import stat
import json
import tempfile
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

# ============================================================================
# SOX MONKEY-PATCH: Replace sox binary dependency with pure Python
# ============================================================================
# The qwen_tts package uses sox.Transformer for audio normalization to -6dB.
# Instead of requiring the sox binary, we patch it with numpy-based normalization.


class _MockSoxTransformer:
    """Pure Python replacement for sox.Transformer used by qwen_tts."""

    def __init__(self):
        self._target_db = -6.0  # Default normalization level

    def norm(self, db_level=-6.0):
        """Set target normalization level in dB."""
        self._target_db = db_level
        return self

    def build_array(self, input_array, sample_rate_in=16000):
        """Normalize audio array to target dB level (replaces sox norm)."""
        audio = np.asarray(input_array, dtype=np.float32)

        # Calculate target amplitude from dB
        target_amplitude = 10 ** (self._target_db / 20.0)

        # Find current peak
        peak = np.max(np.abs(audio))

        if peak > 1e-8:  # Avoid division by zero
            # Scale to target amplitude
            normalized = audio * (target_amplitude / peak)
        else:
            normalized = audio

        return normalized.astype(np.float32)


class _MockSoxModule:
    """Mock sox module that provides Transformer class."""

    Transformer = _MockSoxTransformer


# Install the mock before qwen_tts imports sox
import sys

sys.modules["sox"] = _MockSoxModule()

# ============================================================================

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
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    GGUFQuantizationConfig,
    FluxPipeline,
    FluxImg2ImgPipeline,
    FluxTransformer2DModel,
    Flux2KleinPipeline,
    FlowMatchEulerDiscreteScheduler,
    AutoencoderKL,
    ZImagePipeline,
    ZImageTransformer2DModel,
    LTX2Pipeline,
    LTX2ImageToVideoPipeline,
    LTX2VideoTransformer3DModel,
    AutoencoderKLLTX2Video,
    AutoencoderKLLTX2Audio,
)
from diffusers.utils import load_image, export_to_video
from diffusers.hooks import apply_group_offloading

from transformers import (
    UMT5EncoderModel,
    AutoTokenizer,
    CLIPVisionModel,
    CLIPImageProcessor,
    T5EncoderModel,
    T5TokenizerFast,
    Gemma3ForConditionalGeneration,
    GemmaTokenizer,
)

# LTX-2 additional components
from diffusers.pipelines.ltx2.connectors import LTX2TextConnectors
from diffusers.pipelines.ltx2.vocoder import LTX2Vocoder

import wave

# =============================================================================
# CONFIGURATION
# =============================================================================

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bonzai-server")


def get_safe_model_dir() -> Path:
    safe = Path.home() / "bonzai-models"
    safe.mkdir(parents=True, exist_ok=True)
    return safe


MODEL_DIR = get_safe_model_dir()
USER_BIN_DIR = MODEL_DIR / "bin"
USER_BIN_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR = MODEL_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)

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

FLUX_KREA_REPO = "black-forest-labs/FLUX.1-Krea-dev"
FLUX_KREA_GGUF_NAME = normalize_model_filename(os.getenv("FLUX_GGUF_FILENAME", "flux1-krea-dev-q5_k_m.gguf").strip())
FLUX_KREA_GGUF_URL = os.getenv("FLUX_KREA_GGUF_URL",
    "https://huggingface.co/QuantStack/FLUX.1-Krea-dev-GGUF/resolve/main/flux1-krea-dev-Q5_K_M.gguf").strip()

# Flux Klein 4B - Fast turbo generation (standard HuggingFace loading)
FLUX_KLEIN_REPO = "black-forest-labs/FLUX.2-klein-4B"

Z_REPO = "Tongyi-MAI/Z-Image-Turbo"
Z_GGUF_NAME = "z_image_turbo-q5_k_m.gguf"
Z_GGUF_URL = "https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q5_K_M.gguf"

# LTX-2 (19B DiT Model) - /video endpoint supports:
# - Text-to-Video (t2v): Generate video from text prompt only
# - Image-to-Video (i2v): Generate video from image + text prompt
# Uses from_single_file with GGUF quantization (~10GB)
LTX2_REPO = "Lightricks/LTX-2"
LTX2_QUANTO_CACHE_DIR = MODEL_DIR / "ltx2_quanto_cache"

# LTX-2 GGUF (for /video endpoint) - Distilled Q3_K_S quantization
LTX2_GGUF_REPO = "vantagewithai/LTX-2-GGUF"
LTX2_GGUF_NAME = "ltx-2-19b-distilled-q3_k_s.gguf"
LTX2_GGUF_URL = "https://huggingface.co/vantagewithai/LTX-2-GGUF/resolve/main/distilled/ltx-2-19b-distilled-Q3_K_S.gguf"

# LTX-2 Image2Video Adapter LoRA - improves I2V quality
LTX2_I2V_LORA_REPO = "MachineDelusions/LTX-2_Image2Video_Adapter_LoRa"
LTX2_I2V_LORA_FILENAME = "LTX-2-Image2Vid-Adapter.safetensors"

CHATTERBOX_REPO = "ResembleAI/chatterbox"

CHATTERBOX_MULTILINGUAL_MODEL_ID = "onnx-community/chatterbox-multilingual-ONNX"

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

# Qwen3-VL 2B - Vision-language model with good cross-platform support
QWEN3_VL_REPO = "Qwen/Qwen3-VL-2B-Instruct"

# Qwen3-TTS - High-quality TTS with voice cloning and voice design
QWEN3_TTS_BASE_REPO = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"  # For voice cloning
QWEN3_TTS_DESIGN_REPO = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"  # For voice design from description

LLAMA_REPOS = {
    "llama-3.2-1b": "meta-llama/Llama-3.2-1B",
    "llama-3.2-3b": "meta-llama/Llama-3.2-3B",
    "llama-3.1-8b": "meta-llama/Llama-3.1-8B",
}

CHATTERBOX_LANGUAGES = {
    "ar": "Arabic", "da": "Danish", "de": "German", "el": "Greek", "en": "English",
    "es": "Spanish", "fi": "Finnish", "fr": "French", "he": "Hebrew", "hi": "Hindi",
    "it": "Italian", "ja": "Japanese", "ko": "Korean", "ms": "Malay", "nl": "Dutch",
    "no": "Norwegian", "pl": "Polish", "pt": "Portuguese", "ru": "Russian",
    "sv": "Swedish", "sw": "Swahili", "tr": "Turkish", "zh": "Chinese",
}


EXPECTED_SIZES = {
    "flux1-krea-dev-q5_k_m.gguf": 8_419_501_344,
    "z_image_turbo-q5_k_m.gguf": 5_522_742_336,
    "umt5-xxl-encoder-q3_k_m.gguf": 5_580_000_000,  # ~5.2GB GGUF text encoder
    "ltx-2-19b-distilled-q3_k_s.gguf": 9_283_503_264,  # 9.28GB Q3_K_S distilled
}

# =============================================================================
# ONNX / CHATTERBOX SETUP
# =============================================================================

_kakasi = None
_cangjie_data = None


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


class ChineseCangjieConverter:
    """Converts Chinese characters to Cangjie codes."""
    
    def __init__(self, cache_dir=None):
        global _cangjie_data
        self.word2cj = {}
        self.cj2word = {}
        self.segmenter = None
        
        if _cangjie_data is not None:
            self.word2cj, self.cj2word = _cangjie_data
        else:
            self._load_cangjie_mapping(cache_dir)
        self._init_segmenter()
    
    def _load_cangjie_mapping(self, cache_dir):
        global _cangjie_data
        try:
            from huggingface_hub import hf_hub_download
            import json
            cangjie_file = hf_hub_download(
                repo_id=CHATTERBOX_MULTILINGUAL_MODEL_ID,
                filename="Cangjie5_TC.json",
                cache_dir=cache_dir,
            )
            with open(cangjie_file, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            
            for entry in data:
                parts = entry.split("\t")
                if len(parts) >= 2:
                    word, code = parts[0], parts[1]
                    self.word2cj[word] = code
                    if code not in self.cj2word:
                        self.cj2word[code] = [word]
                    else:
                        self.cj2word[code].append(word)
            _cangjie_data = (self.word2cj, self.cj2word)
        except Exception as e:
            logger.warning(f"Could not load Cangjie mapping: {e}")
    
    def _init_segmenter(self):
        try:
            from pkuseg import pkuseg
            self.segmenter = pkuseg()
        except ImportError:
            self.segmenter = None
    
    def __call__(self, text):
        from unicodedata import category
        output = []
        full_text = " ".join(self.segmenter.cut(text)) if self.segmenter else text
        
        for t in full_text:
            if category(t) == "Lo":
                code = self.word2cj.get(t)
                if code is None:
                    output.append(t)
                    continue
                index = self.cj2word[code].index(t)
                index_str = str(index) if index > 0 else ""
                cangjie = code + index_str
                cj_tokens = "".join(f"[cj_{c}]" for c in cangjie) + "[cj_.]"
                output.append(cj_tokens)
            else:
                output.append(t)
        return "".join(output)


def _hiragana_normalize(text):
    """Japanese text normalization."""
    global _kakasi
    try:
        if _kakasi is None:
            import pykakasi
            _kakasi = pykakasi.kakasi()
        
        result = _kakasi.convert(text)
        out = []
        for r in result:
            inp, hira = r['orig'], r["hira"]
            if any(19968 <= ord(c) <= 40959 for c in inp):  # Has kanji
                if hira and hira[0] in ["は", "へ"]:
                    hira = " " + hira
                out.append(hira)
            elif all(12449 <= ord(c) <= 12538 for c in inp) if inp else False:  # All katakana
                out.append(inp)
            else:
                out.append(inp)
        
        import unicodedata
        return unicodedata.normalize('NFKD', "".join(out))
    except ImportError:
        return text


def _korean_normalize(text):
    """Korean text normalization."""
    def decompose_hangul(char):
        if not ('\uac00' <= char <= '\ud7af'):
            return char
        base = ord(char) - 0xAC00
        return (chr(0x1100 + base // (21 * 28)) +
                chr(0x1161 + (base % (21 * 28)) // 28) +
                (chr(0x11A7 + base % 28) if base % 28 > 0 else ''))
    return ''.join(decompose_hangul(c) for c in text).strip()


def _prepare_language(text, language_id, cache_dir=None):
    """Apply language-specific text processing."""
    if language_id == 'zh':
        text = ChineseCangjieConverter(cache_dir)(text)
    elif language_id == 'ja':
        text = _hiragana_normalize(text)
    elif language_id == 'ko':
        text = _korean_normalize(text)
    if language_id:
        text = f"[{language_id.lower()}]{text}"
    return text


class ChatterboxONNX:
    """
    Unified Chatterbox TTS using ONNX Runtime.
    Supports Turbo (English, fast) and Multilingual (23 languages).
    """
    
    sr = 24000
    START_SPEECH_TOKEN = 6561
    STOP_SPEECH_TOKEN = 6562
    SILENCE_TOKEN = 4299
    
    def __init__(self, model_type, speech_encoder, embed_tokens, language_model, cond_decoder, tokenizer, cache_dir=None):
        self.model_type = model_type
        self.speech_encoder = speech_encoder
        self.embed_tokens = embed_tokens
        self.language_model = language_model
        self.cond_decoder = cond_decoder
        self.tokenizer = tokenizer
        self.cache_dir = cache_dir
        
        # Model architecture - detect from ONNX inputs
        self._kv_dtype = np.float32
        layer_indices = set()
        for inp in self.language_model.get_inputs():
            if "past_key_values" in inp.name:
                if inp.type == 'tensor(float16)':
                    self._kv_dtype = np.float16
                # Extract layer number from name like "past_key_values.16.key"
                parts = inp.name.split(".")
                if len(parts) >= 2 and parts[1].isdigit():
                    layer_indices.add(int(parts[1]))

        # Detect actual number of layers from ONNX model inputs
        self._num_layers = max(layer_indices) + 1 if layer_indices else (16 if model_type == "turbo" else 30)
        self._num_kv_heads = 16
        self._head_dim = 64
        logger.info(f"[Chatterbox {model_type}] Detected {self._num_layers} transformer layers, dtype={self._kv_dtype}")
    
    @classmethod
    def from_pretrained(cls, model_type="multilingual", device="cpu", dtype="fp32", local_dir=None, local_files_only=True):
        """
        Load ChatterboxONNX from local directory (consistent with diffusion model pattern).

        Args:
            model_type: Must be "multilingual"
            device: "cpu" or "cuda"
            dtype: "fp32" or "q8"
            local_dir: Path to repo_local_dir(CHATTERBOX_MULTILINGUAL_MODEL_ID)
            local_files_only: If True, don't attempt network downloads
        """
        import onnxruntime as ort
        from transformers import AutoTokenizer

        if model_type != "multilingual":
            raise ValueError(f"model_type must be 'multilingual'")

        if local_dir is None:
            local_dir = repo_local_dir(CHATTERBOX_MULTILINGUAL_MODEL_ID)
        local_dir = Path(local_dir)

        # CoreML fails with external .onnx_data files - use CPU
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == "cuda" and torch.cuda.is_available() else ['CPUExecutionProvider']

        logger.info(f"[Chatterbox {model_type}] Loading ONNX models from {local_dir}...")

        def get_onnx_path(name):
            suffix = "" if dtype == "fp32" else "_quantized" if dtype == "q8" else f"_{dtype}"
            filename = f"{name}{suffix}.onnx"
            return str(local_dir / "onnx" / filename)

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        return cls(
            model_type=model_type,
            speech_encoder=ort.InferenceSession(get_onnx_path("speech_encoder"), opts, providers=providers),
            embed_tokens=ort.InferenceSession(get_onnx_path("embed_tokens"), opts, providers=providers),
            language_model=ort.InferenceSession(get_onnx_path("language_model"), opts, providers=providers),
            cond_decoder=ort.InferenceSession(get_onnx_path("conditional_decoder"), opts, providers=providers),
            tokenizer=AutoTokenizer.from_pretrained(str(local_dir), local_files_only=local_files_only),
            cache_dir=str(local_dir),
        )
    
    def _normalize_text(self, text):
        if not text or not text.strip():
            return "You need to add some text for me to talk."
        text = text.strip()
        if text[0].islower():
            text = text[0].upper() + text[1:]
        text = " ".join(text.split())
        for old, new in [("...", ", "), ("…", ", "), (":", ","), (" - ", ", "), (";", ", ")]:
            text = text.replace(old, new)
        if not any(text.endswith(p) for p in {".", "!", "?", "-", ","}):
            text += "."
        return text
    
    def generate(self, text, audio_prompt_path, language_id="en", max_new_tokens=1024,
                 repetition_penalty=1.2, temperature=1.0, exaggeration=0.5):
        # Text preprocessing
        if self.model_type == "multilingual":
            if language_id not in CHATTERBOX_LANGUAGES:
                raise ValueError(f"Unsupported language '{language_id}'")
            text = _prepare_language(text, language_id, self.cache_dir)
        else:
            text = self._normalize_text(text)
        
        audio = _load_audio_sf(audio_prompt_path, self.sr)[np.newaxis, :].astype(np.float32)
        input_ids = self.tokenizer(text, return_tensors="np")["input_ids"].astype(np.int64)
        
        def apply_penalty(gen_tokens, scores):
            score = np.take_along_axis(scores, gen_tokens, axis=1)
            score = np.where(score < 0, score * repetition_penalty, score / repetition_penalty)
            out = scores.copy()
            np.put_along_axis(out, gen_tokens, score, axis=1)
            return out
        
        gen_tokens = np.array([[self.START_SPEECH_TOKEN]], dtype=np.int64)
        cond_emb = prompt_token = spk_emb = spk_feat = None
        past_kv = attn_mask = pos_ids = None
        
        for i in range(max_new_tokens):
            # Embed tokens
            if self.model_type == "multilingual":
                p_ids = np.where(input_ids >= self.START_SPEECH_TOKEN, 0,
                                 np.arange(input_ids.shape[1])[np.newaxis, :] - 1).astype(np.int64)
                embed_in = {"input_ids": input_ids, "position_ids": p_ids,
                            "exaggeration": np.array([exaggeration], dtype=np.float32)}
            else:
                embed_in = {"input_ids": input_ids}
            
            embeds = self.embed_tokens.run(None, embed_in)[0]
            
            if i == 0:
                enc_out = self.speech_encoder.run(None, {"audio_values": audio})
                cond_emb, prompt_token, spk_emb, spk_feat = enc_out
                embeds = np.concatenate((cond_emb, embeds), axis=1)
                
                bs, seq_len, _ = embeds.shape
                past_kv = {f"past_key_values.{l}.{kv}": np.zeros([bs, self._num_kv_heads, 0, self._head_dim], dtype=self._kv_dtype)
                           for l in range(self._num_layers) for kv in ("key", "value")}
                attn_mask = np.ones((bs, seq_len), dtype=np.int64)
                pos_ids = np.arange(seq_len, dtype=np.int64).reshape(1, -1).repeat(bs, axis=0)
            
            lm_in = {"inputs_embeds": embeds, "attention_mask": attn_mask, **past_kv}
            if self.model_type == "turbo":
                lm_in["position_ids"] = pos_ids
            
            lm_out = self.language_model.run(None, lm_in)
            logits, present_kv = lm_out[0][:, -1, :], lm_out[1:]
            
            next_logits = apply_penalty(gen_tokens, logits)
            if temperature != 1.0:
                next_logits = next_logits / temperature
            
            next_tok = np.argmax(next_logits, axis=-1, keepdims=True).astype(np.int64)
            gen_tokens = np.concatenate((gen_tokens, next_tok), axis=-1)
            
            if (next_tok.flatten() == self.STOP_SPEECH_TOKEN).all():
                break
            
            input_ids = next_tok
            attn_mask = np.concatenate([attn_mask, np.ones((bs, 1), dtype=np.int64)], axis=1)
            if self.model_type == "turbo":
                pos_ids = pos_ids[:, -1:] + 1
            for j, key in enumerate(past_kv):
                past_kv[key] = present_kv[j]
        
        speech_tokens = gen_tokens[:, 1:-1]
        if self.model_type == "turbo":
            silence = np.full((speech_tokens.shape[0], 3), self.SILENCE_TOKEN, dtype=np.int64)
            speech_tokens = np.concatenate([prompt_token, speech_tokens, silence], axis=1)
        else:
            speech_tokens = np.concatenate([prompt_token, speech_tokens], axis=1)
        
        wav = self.cond_decoder.run(None, {
            "speech_tokens": speech_tokens, "speaker_embeddings": spk_emb, "speaker_features": spk_feat
        })[0]
        return np.squeeze(wav, axis=0)
    
    def save_audio(self, audio, path):
        import soundfile as sf
        sf.write(str(path), audio, self.sr)
    
    @staticmethod
    def get_supported_languages():
        return CHATTERBOX_LANGUAGES.copy()

# =============================================================================
# FLASK / SOCKET.IO SETUP
# =============================================================================

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bonzai-secret-key")
CORS(app, supports_credentials=True, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "X-Demo-Mode"],
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
# JWT AUTHENTICATION SYSTEM
# =============================================================================

# Configuration
JWT_SECRET = os.environ.get("BONZAI_JWT_SECRET", secrets.token_hex(32))
HMAC_SECRET = os.environ.get("BONZAI_HMAC_SECRET", secrets.token_hex(32))
ACCESS_TOKEN_EXPIRY = 6 * 60 * 60  # 6 hours
REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60  # 7 days
CHALLENGE_EXPIRY = 300  # 5 minutes

# Level requirements for each feature
LEVEL_REQUIREMENTS = {
    "text": 1,
    "audio": 2,
    "image": 3,
    "vision": 3,  # Vision analysis uses same level as image
    "video": 4,
    "3d": 5,
    "training": 6,
}

# Demo mode configuration
DEMO_PROMPTS = {
    "text": "Explain what makes a bonsai tree special in exactly 3 sentences.",
    "image": "A serene bonsai tree on a wooden table, soft natural lighting, minimalist",
    "video": "A bonsai tree gently swaying in a soft breeze, peaceful atmosphere",
    "audio": "peaceful japanese garden ambient sounds with gentle wind chimes",
}

# Rate limiting for demo mode
DEMO_RATE_LIMITS: Dict[str, Dict[str, int]] = {}  # IP -> {date: count}


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


def _check_demo_rate_limit(ip: str) -> bool:
    """
    Rate limiting disabled for desktop app.
    Previously limited to 3 demos per IP per day.
    """
    # Desktop app - no rate limiting needed
    return True


def require_auth(min_level: int = 0, allow_demo: bool = False):
    """
    Decorator to require valid JWT with minimum level.

    Args:
        min_level: Minimum level required (1-6)
        allow_demo: Whether to allow demo mode for this endpoint
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            # Check for demo mode
            if allow_demo and request.headers.get("X-Demo-Mode") == "true":
                ip = request.remote_addr or "unknown"
                if not _check_demo_rate_limit(ip):
                    return jsonify({"error": "Demo rate limit exceeded (3 per day)"}), 429

                # Set demo context
                request.auth_user = {"sub": "demo", "level": "DEMO", "level_value": 0, "demo_only": True}
                request.is_demo = True
                return f(*args, **kwargs)

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
            request.is_demo = False
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


@app.route("/auth/demo-token", methods=["POST"])
def auth_demo_token():
    """Get a limited demo token for trying the service."""
    ip = request.remote_addr or "unknown"

    if not _check_demo_rate_limit(ip):
        return jsonify({"error": "Demo rate limit exceeded (3 per day)"}), 429

    # Create demo token (5 minute expiry)
    demo_payload = {
        "sub": "demo",
        "level": "DEMO",
        "level_value": 0,
        "type": "demo",
        "demo_only": True,
    }
    demo_token = _create_jwt_token(demo_payload, 300)

    return jsonify({
        "demo_token": demo_token,
        "expires_in": 300,
        "allowed_prompts": DEMO_PROMPTS,
    })


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

class DeviceManager:
    @staticmethod
    def get_device() -> torch.device:
        if torch.backends.mps.is_available():
            return torch.device("mps")
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    @staticmethod
    def get_dtype(device: Optional[torch.device] = None) -> torch.dtype:
        device = device or DeviceManager.get_device()
        return torch.float16 if device.type in ("cuda", "mps") else torch.bfloat16

    @staticmethod
    def free_memory():
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        if torch.cuda.is_available():
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

    def new(self, kind: str, meta: Optional[Dict[str, Any]] = None, gen_id: Optional[str] = None) -> str:
        gid = gen_id or hashlib.md5(f"{kind}_{time.time()}".encode()).hexdigest()[:16]
        self._meta[gid] = {"kind": kind, "meta": meta or {}, "ts": time.time(), "stage": "starting"}
        socket_emit("gen_started", {"generation_id": gid, "kind": kind, "meta": meta or {}}, "/generation")
        socket_emit("gen_progress", {"generation_id": gid, "stage": "queued", "step": 0, "total": 1, "pct": 0}, "/generation")
        return gid

    def progress(self, generation_id: str, stage: str, step: int, total: int):
        """Report progress. Ensures step <= total and calculates percentage."""
        step = min(step, total)
        pct = round((step / max(total, 1)) * 100.0, 2)
        socket_emit("gen_progress", {
            "generation_id": generation_id,
            "stage": stage,
            "step": int(step),
            "total": int(total),
            "pct": pct
        }, "/generation")

    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        socket_emit("gen_finished", {"generation_id": generation_id, "payload": payload or {}}, "/generation")
        self._meta.pop(generation_id, None)

    def error(self, generation_id: str, message: str):
        socket_emit("gen_error", {"generation_id": generation_id, "error": message}, "/generation")
        self._meta.pop(generation_id, None)


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

    def new(self, name: str) -> PipelineDownload:
        pid = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
        pl = PipelineDownload(pipeline_id=pid, pipeline_name=name)
        with self._lock:
            self.pipelines[pid] = pl
        return pl

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
        self.emit(pl.pipeline_id)

    def mark_failed(self, pl: PipelineDownload, tid: str, msg: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "failed"
        t.error_message = msg
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


def _flux_patterns() -> List[str]:
    return [
        "model_index.json", "scheduler/**", "tokenizer/**", "tokenizer_2/**",
        "text_encoder/**", "text_encoder_2/**", "transformer/**", "vae/**",
    ]


def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id in ("black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-Krea-dev"):
        return _flux_patterns()
    if repo_id in (SDXL_BASE_REPO, SDXL_REFINER_REPO):
        return _sdxl_patterns()
    if repo_id == Z_REPO:
        return ["model_index.json", "scheduler/**", "tokenizer/**", "text_encoder/**",
                "transformer/**", "vae/**", "**/*.safetensors", "**/*.json", "**/*.bin"]
    if repo_id == CHATTERBOX_REPO:
        return ["**/*"]
    if repo_id == CHATTERBOX_MULTILINGUAL_MODEL_ID:
        # ONNX files for multilingual TTS + tokenizer files + default voice
        return ["onnx/**", "*.json", "*.txt", "*.wav", "tokenizer/**"]
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
    if repo_id == QWEN3_VL_REPO:
        # Qwen3-VL is a transformers vision-language model
        return [
            "*.json",
            "*.txt",
            "*.safetensors",
            "*.bin",
            "*.model",
            "tokenizer.model",
            "merges.txt",
            "vocab.json",
        ]
    return None


REPO_SPECS = {
    "black-forest-labs/FLUX.1-Krea-dev": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["text_encoder", "text_encoder_2", "vae"],
        "extra_dirs": ["scheduler"],
    },
    "stabilityai/stable-diffusion-xl-base-1.0": {
        "must_files": ["model_index.json"],
        "must_weight_dirs": ["unet", "vae"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "extra_dirs": ["text_encoder", "text_encoder_2", "scheduler"],
    },
    "stabilityai/stable-diffusion-xl-refiner-1.0": {
        "must_files": ["model_index.json"],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["scheduler"],
    },
    "Tongyi-MAI/Z-Image-Turbo": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "text_encoder"],
        "extra_dirs": ["scheduler"],
    },
    "ResembleAI/chatterbox": {
        "must_files": [], "must_tokenizers": [], "must_weight_dirs": [], "extra_dirs": [],
    },
    # Chatterbox Multilingual ONNX - check for ONNX model files
    "onnx-community/chatterbox-multilingual-ONNX": {
        "must_files": [],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": ["onnx"],
        "onnx_files": ["speech_encoder.onnx", "embed_tokens.onnx", "language_model.onnx", "conditional_decoder.onnx"],
    },
    # LTX-2: Only download subfolders needed for quanto quantization
    # Skip root safetensors files (43GB+)
    "Lightricks/LTX-2": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "audio_vae"],
        "extra_dirs": ["scheduler", "connectors", "vocoder"],
    },
    # Qwen3-VL 2B: Transformers vision-language model
    "Qwen/Qwen3-VL-2B-Instruct": {
        "must_files": ["config.json"],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": [],
        "fallback_any_weights": True,
    },
    # Qwen3-TTS: Text-to-speech models (no model_index.json, uses config.json)
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base": {
        "must_files": ["config.json"],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": ["speech_tokenizer"],
        "fallback_any_weights": True,
    },
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign": {
        "must_files": ["config.json"],
        "must_tokenizers": [],
        "must_weight_dirs": [],
        "extra_dirs": ["speech_tokenizer"],
        "fallback_any_weights": True,
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
        report["missing"].append("<entire repo>")
        return report
    spec = REPO_SPECS.get(repo_id, DEFAULT_SPEC)
    for f in spec.get("must_files", []):
        if not _nonzero(root / f):
            report["missing"].append(f)
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
    # Check for ONNX files (used by Chatterbox audio models)
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
            name = sf.get("name", "")
            if name:
                path = MODEL_DIR / name
                if not path.exists() or path.stat().st_size == 0:
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
    if pipeline in _plan_cache:
        return _plan_cache[pipeline]
    plan = _plan_for(pipeline)
    _plan_cache[pipeline] = plan
    return plan


def _expected_size(name: str, url: Optional[str] = None) -> int:
    # Normalize name for consistent lookups
    normalized_name = normalize_model_filename(name)
    if url:
        headers = {}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        try:
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
            size = int(r.headers.get("content-length", "0") or "0")
            if size > 0:
                EXPECTED_SIZES[normalized_name] = size
                return size
        except Exception:
            pass
    return int(EXPECTED_SIZES.get(normalized_name, 0) or 0)


def _sf(name, url):
    normalized_name = normalize_model_filename(name)
    return {"name": normalized_name, "url": url, "size": _expected_size(normalized_name, url)}


def _plan_for(pipeline: str) -> Dict[str, Any]:
    """
    Pipeline naming convention:
    - image_standard: SDXL base + refiner
    - image_turbo: FLUX Klein (fast generation, i2i)
    - image_quality: FLUX Krea (high quality)
    - image_advanced: Z turbo (advanced features)
    - audio: Chatterbox TTS
    - video_fast: LTX2 GGUF (fast video)
    - vision: Qwen3 VL (image analysis)
    """
    pipeline = pipeline.strip().lower()

    # Image pipelines
    if pipeline in ("image_standard", "sdxl"):
        return {"repos_to_fetch": [SDXL_BASE_REPO, SDXL_REFINER_REPO], "single_files": []}
    if pipeline in ("image_turbo", "flux_klein"):
        return {"repos_to_fetch": [FLUX_KLEIN_REPO], "single_files": []}
    if pipeline in ("image_quality", "flux_krea"):
        return {"repos_to_fetch": [FLUX_KREA_REPO], "single_files": [_sf(FLUX_KREA_GGUF_NAME, FLUX_KREA_GGUF_URL)]}
    if pipeline in ("image_advanced", "z_image_turbo"):
        return {"repos_to_fetch": [Z_REPO], "single_files": [_sf(Z_GGUF_NAME, Z_GGUF_URL)]}

    # Audio pipelines
    if pipeline in ("audio", "chatterbox"):
        return {"repos_to_fetch": [CHATTERBOX_MULTILINGUAL_MODEL_ID], "single_files": []}
    # Kokoro TTS auto-downloads via KPipeline - always report as ready
    if pipeline in ("audio_turbo", "kokoro"):
        return {"repos_to_fetch": [], "single_files": []}
    if pipeline in ("audio_quality_clone", "qwen3_tts_clone"):
        return {"repos_to_fetch": [QWEN3_TTS_BASE_REPO], "single_files": []}
    if pipeline in ("audio_quality_design", "qwen3_tts_design"):
        return {"repos_to_fetch": [QWEN3_TTS_DESIGN_REPO], "single_files": []}
    if pipeline in ("audio_quality_persona", "qwen3_tts_persona"):
        # Persona needs both models
        return {"repos_to_fetch": [QWEN3_TTS_BASE_REPO, QWEN3_TTS_DESIGN_REPO], "single_files": []}

    # Video pipelines
    if pipeline in ("video_fast", "ltx2_video_gguf"):
        # LTX-2 (19B DiT) with Q4_0 GGUF quantization
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

    # Vision pipeline
    if pipeline in ("vision", "qwen3_vision"):
        return {"repos_to_fetch": [QWEN3_VL_REPO], "single_files": []}

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
    ok = exists and (expected_size <= 0 or size_on_disk == expected_size)
    reason = None if ok or not exists else f"size_mismatch:{size_on_disk}!={expected_size}"
    return {
        "name": name, "url": url, "path": str(p),
        "exists": bool(exists), "ok": bool(ok),
        "size_on_disk": size_on_disk, "expected_size": int(expected_size or 0),
        "reason": reason,
    }


def _repos_ready_or_resp(*repo_ids: str):
    missing = []
    for rid in repo_ids:
        st = _repo_readiness(rid)
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
        st = _repo_readiness(rid)
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
            if getattr(it, "type", None) == "file" and _match(it.path):
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
    pl = download_manager.new(pipeline)
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
                        download_manager.mark_completed(pl, tid)
                except Exception as e:
                    if pl.cancelled:
                        download_manager.mark_cancelled(pl, tid)
                        break
                    download_manager.mark_failed(pl, tid, str(e))

            files_to_do = []
            for f in plan.get("single_files", []):
                name = (f or {}).get("name") or ""
                size_hint = int(EXPECTED_SIZES.get(name, 0))
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
                size_hint = int(EXPECTED_SIZES.get(name, 0))
                download_manager.update_progress(pl, tid, 0, size_hint or 1)
                try:
                    _download_single_file(pl, tid, name, url, size_hint=size_hint)
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
        if dest.exists() and (rsz == 0 or dest.stat().st_size == rsz):
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
        download_manager.update_progress(pl, tid, done, total)
        time.sleep(0)


def _download_single_file(pl: PipelineDownload, tid: str, name: str, url: str, size_hint: int = 0):
    # Normalize filename to lowercase for .gguf and .safetensors files
    normalized_name = normalize_model_filename(name)
    lock = _gguf_lock(normalized_name)
    with lock:
        headers = {}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        dest = MODEL_DIR / normalized_name
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        expected_size = _expected_size(normalized_name, url)
        if dest.exists() and dest.stat().st_size > 0:
            if expected_size <= 0 or dest.stat().st_size == expected_size:
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
            dest.unlink(missing_ok=True)
            raise ValueError(f"Downloaded {normalized_name} has size {dest.stat().st_size}, expected {expected_size}")
        download_manager.update_progress(pl, tid, expected_size or dest.stat().st_size, expected_size or dest.stat().st_size)


def _stream_download(url, dest, headers, update, is_cancelled=None):
    tmp = dest.with_suffix(dest.suffix + ".part")
    downloaded = tmp.stat().st_size if tmp.exists() else 0
    range_headers = dict(headers or {})
    if downloaded > 0:
        range_headers["Range"] = f"bytes={downloaded}-"
    with requests.get(url, headers=range_headers, stream=True, timeout=(10, 600)) as r:
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp, "ab") as f:
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
    if not pipeline:
        return jsonify(_json_sanitize({"error": "Provide 'pipeline'."})), 400
    try:
        plan = _cached_plan_for(pipeline)
    except ValueError as e:
        return jsonify(_json_sanitize({"error": str(e)})), 400
    
    repos_status = []
    for rid in plan.get("repos_to_fetch", []):
        repos_status.append(_repo_readiness(rid))
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
        os.path.expanduser("~"),
        "/tmp",
        "/var/folders",  # macOS temp
    ]

    # Normalize path to prevent directory traversal
    file_path = os.path.abspath(file_path)
    is_allowed = any(file_path.startswith(os.path.abspath(d)) for d in allowed_dirs)

    if not is_allowed:
        logger.warning(f"[Media] Blocked access to path outside allowed dirs: {file_path}")
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


@app.route("/image/standard", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["image"], allow_demo=True)
def image_standard_sdxl():
    import logging as _logging
    _logging.getLogger("transformers.tokenization_utils_base").setLevel(_logging.ERROR)

    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    negative_prompt = data.get("negative_prompt", "bad anatomy, extra hands, extra legs, extra fingers, poorly drawn face, fused face, cloned face")
    height = int(data.get("height", 1024))
    width  = int(data.get("width", 1024))

    ckpt_filename = (data.get("ckpt") or "cyberrealistic.safetensors").strip()
    lora_filename = (data.get("lora") or "cyberrealistic.safetensors").strip()
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
                    ).to(device)
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
                ).to(device)

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

        compel_base = _make_compel(base)
        with torch.inference_mode():
            prompt_embeds_base, pooled_base = compel_base(prompt)
            neg_embeds_base, neg_pooled_base = compel_base(negative_prompt)
            prompt_embeds_base, neg_embeds_base = _pad_seq_len(prompt_embeds_base, neg_embeds_base)

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

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("sdxl_intermediate") as is_offline:
            refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                str(repo_local_dir(SDXL_REFINER_REPO)),
                text_encoder_2=getattr(base, "text_encoder_2", None),
                vae=getattr(base, "vae", None),
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16",
                local_files_only=is_offline,
            ).to(device)

        if lora_filename:
            lp = (MODEL_DIR / lora_filename).resolve()
            if lp.exists() and lp.stat().st_size > 0:
                _apply_lora(refiner, lp, lora_strength, "refiner")

        try:
            if device.type == "cuda":
                refiner.unet = torch.compile(refiner.unet, mode="reduce-overhead", fullgraph=True)
        except Exception:
            pass

        compel_ref = _make_compel(refiner)
        with torch.inference_mode():
            prompt_embeds_ref, pooled_ref = compel_ref(prompt)
            neg_embeds_ref, neg_pooled_ref = compel_ref(negative_prompt)
            prompt_embeds_ref, neg_embeds_ref = _pad_seq_len(prompt_embeds_ref, neg_embeds_ref)

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

        buf = BytesIO()
        image.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize({
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "image": encoded,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("SDXL intermediate failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - Z-IMAGE TURBO
# =============================================================================

@app.route("/image/advanced", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["image"], allow_demo=True)
def z_image_advanced():
    """Generate image using Z-Image-Turbo (advanced mode)."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip() or (
        "blurry, low quality, distorted, jpeg artifacts, text, watermark"
    )
    H = int(data.get("height", 512))
    W = int(data.get("width", 512))
    steps = int(data.get("steps", 9))
    seed = data.get("seed", None)
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400

    guard = _ensure_files_present_or_start("z_image_turbo", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("z_image_advanced", {"endpoint": "/image/advanced", "w": W, "h": H, "steps": steps})

    try:
        genbus.progress(gen_id, "loading", 0, 3)

        device = DeviceManager.get_device()
        if device.type == "cuda":
            compute_dtype = torch.bfloat16
        elif device.type == "mps":
            compute_dtype = torch.bfloat16
        else:
            compute_dtype = torch.float32

        base_root = repo_local_dir(Z_REPO)

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("z_image_turbo") as is_offline:
            pipe = ZImagePipeline.from_pretrained(
                str(base_root),
                torch_dtype=compute_dtype,
                local_files_only=is_offline,
                low_cpu_mem_usage=False,
            )
        pipe = pipe.to(device)

        generator = (
            torch.Generator(device=device).manual_seed(seed)
            if isinstance(seed, int)
            else None
        )

        genbus.progress(gen_id, "generating", 1, 3)

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

        genbus.progress(gen_id, "finalizing", 2, 3)

        buf = BytesIO()
        image.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")

        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"ok": True})

        return jsonify(_json_sanitize({
            "ok": True,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "image": encoded,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        })), 201

    except Exception as e:
        logger.exception("Z-Image-Turbo failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - FLUX KLEIN 4B (TURBO)
# =============================================================================

@app.route("/image/turbo", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["image"], allow_demo=True)
def image_turbo_flux_klein():
    """Generate image using FLUX Klein 4B (fast turbo mode)."""
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    h = int(data.get("height", 1024))
    w = int(data.get("width", 1024))
    steps = int(data.get("steps", 4))  # Klein is optimized for 4 steps
    guidance = float(data.get("guidance_scale", 1.0))  # Klein uses guidance_scale=1.0
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    guard = _ensure_files_present_or_start("flux_klein", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("flux_klein", {"endpoint": "/image/turbo", "prompt": prompt})

    try:
        genbus.progress(gen_id, "loading", 0, 3)

        device = DeviceManager.get_device()
        if device.type == "cuda":
            compute_dtype = torch.bfloat16
        elif device.type == "mps":
            compute_dtype = torch.float16
        else:
            compute_dtype = torch.float32

        # Load Flux2KleinPipeline (specific to FLUX.2-klein-4B)
        with offline_mode_if_complete("flux_klein") as is_offline:
            pipe = Flux2KleinPipeline.from_pretrained(
                str(repo_local_dir(FLUX_KLEIN_REPO)),
                torch_dtype=compute_dtype,
                local_files_only=is_offline,
            )
            pipe.enable_model_cpu_offload()  # Save VRAM by offloading to CPU

        genbus.progress(gen_id, "generating", 1, 3)

        image = pipe(
            prompt=prompt,
            guidance_scale=guidance,
            height=h,
            width=w,
            num_inference_steps=steps,
            generator=torch.Generator(device=device).manual_seed(0) if device.type != "mps" else None
        ).images[0]

        genbus.progress(gen_id, "finalizing", 2, 3)

        buf = BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"ok": True})

        return jsonify(_json_sanitize({
            "prompt": prompt, "image": b64, "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("FLUX Klein generation failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        # Explicitly delete pipeline to free memory
        if 'pipe' in dir():
            del pipe
        gc.collect()
        DeviceManager.free_memory()


@app.route("/image/image/turbo", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["image"], allow_demo=True)
def image_turbo_flux_klein_i2i():
    """Generate image-to-image using FLUX Klein 4B (fast turbo edit mode)."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    h = int(data.get("height", 1024))
    w = int(data.get("width", 1024))
    steps = int(data.get("steps", 4))  # Klein is optimized for 4 steps
    guidance = float(data.get("guidance_scale", 1.0))  # Klein uses guidance_scale=1.0
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400
    if not image_b64 and not image_url:
        return jsonify(_json_sanitize({"error": "Provide 'image_base64' or 'image_url'"})), 400

    guard = _ensure_files_present_or_start("flux_klein", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("flux_klein_i2i", {"endpoint": "/image/image/turbo", "w": w, "h": h, "steps": steps})

    try:
        genbus.progress(gen_id, "loading", 0, 4)
        logger.info(f"[FluxKleinI2I] Starting - device detection...")

        device = DeviceManager.get_device()
        if device.type == "cuda":
            compute_dtype = torch.bfloat16
        elif device.type == "mps":
            compute_dtype = torch.float16
        else:
            compute_dtype = torch.float32

        logger.info(f"[FluxKleinI2I] Device: {device}, dtype: {compute_dtype}")

        # Load Flux2KleinPipeline (supports both T2I and I2I via image parameter)
        logger.info(f"[FluxKleinI2I] Loading pipeline from {FLUX_KLEIN_REPO}...")
        genbus.progress(gen_id, "loading model", 1, 4)

        with offline_mode_if_complete("flux_klein") as is_offline:
            pipe = Flux2KleinPipeline.from_pretrained(
                str(repo_local_dir(FLUX_KLEIN_REPO)),
                torch_dtype=compute_dtype,
                local_files_only=is_offline,
            )
            pipe.enable_model_cpu_offload()  # Save VRAM by offloading to CPU

        logger.info(f"[FluxKleinI2I] Pipeline loaded, processing input image...")
        genbus.progress(gen_id, "processing image", 2, 4)

        # Load input image
        init_img = load_image(image_url).convert("RGB") if image_url else _img_b64_to_pil(image_b64)
        logger.info(f"[FluxKleinI2I] Input image size: {init_img.size}")

        logger.info(f"[FluxKleinI2I] Starting generation with {steps} steps...")
        genbus.progress(gen_id, "generating", 3, 4)

        image = pipe(
            prompt=prompt,
            image=init_img,  # Flux2KleinPipeline uses image as condition
            guidance_scale=guidance,
            height=h,
            width=w,
            num_inference_steps=steps,
            generator=torch.Generator(device=device).manual_seed(0) if device.type != "mps" else None
        ).images[0]

        logger.info(f"[FluxKleinI2I] Generation complete!")

        genbus.progress(gen_id, "finalizing", 4, 5)

        buf = BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        genbus.progress(gen_id, "complete", 5, 5)
        genbus.finish(gen_id, {"ok": True})

        return jsonify(_json_sanitize({
            "prompt": prompt, "image": b64, "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("FLUX Klein I2I generation failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        # Explicitly delete pipeline to free memory
        try:
            del pipe
        except:
            pass
        gc.collect()
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - FLUX KREA
# =============================================================================

@app.route("/image/quality", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["image"], allow_demo=True)
def image_quality_flux_krea():
    """Generate image using FLUX Krea."""
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    h = int(data.get("height", 512))
    w = int(data.get("width", 768))
    steps = int(data.get("steps", 35))
    auto_dl = bool(data.get("auto_download", False))
    
    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    guard = _ensure_files_present_or_start("flux_krea", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("flux_krea", {"endpoint": "/image/quality", "prompt": prompt})
    
    try:
        genbus.progress(gen_id, "loading", 0, 3)
        
        device = DeviceManager.get_device()
        if device.type == "cuda":
            compute_dtype = torch.bfloat16
        elif device.type == "mps":
            compute_dtype = torch.float16
        else:
            compute_dtype = torch.float32

        tr_cfg = repo_local_dir(FLUX_KREA_REPO) / "transformer" / "config.json"

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("flux_krea") as is_offline:
            transformer = FluxTransformer2DModel.from_single_file(
                str(MODEL_DIR / FLUX_KREA_GGUF_NAME),
                config=str(tr_cfg),
                quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
                dtype=compute_dtype,
            ).to(device)

            pipe = FluxPipeline.from_pretrained(
                str(repo_local_dir(FLUX_KREA_REPO)),
                transformer=transformer,
                dtype=compute_dtype,
                local_files_only=is_offline,
            ).to(device)

        pipe.text_encoder = pipe.text_encoder.to(dtype=compute_dtype)
        pipe.text_encoder_2 = pipe.text_encoder_2.to(dtype=compute_dtype)
        if hasattr(pipe, 'vae'):
            pipe.vae = pipe.vae.to(dtype=compute_dtype)

        genbus.progress(gen_id, "generating", 1, 3)

        image = pipe(
            prompt=prompt,
            guidance_scale=3.5,
            height=h,
            width=w,
            num_inference_steps=steps
        ).images[0]

        genbus.progress(gen_id, "finalizing", 2, 3)

        buf = BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"ok": True})
        
        return jsonify(_json_sanitize({
            "prompt": prompt, "image": b64, "generation_id": gen_id, 
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("FLUX Krea generation failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()


# =============================================================================
# REST API: AUDIO GENERATION - CHATTERBOX
# =============================================================================

@app.route("/audio", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["audio"], allow_demo=True)
def audio_multilingual():
    '''Multilingual TTS with 23 languages and emotion control (ONNX).'''
    data = request.get_json(silent=True) or {}

    prompt = (data.get("prompt") or "").strip()
    language = (data.get("language") or "en").strip().lower()
    synthesis_b64 = (data.get("synthesis_base64") or "").strip()
    synthesis_url = (data.get("synthesis_url") or "").strip()
    exaggeration = float(data.get("exaggeration", 0.5))
    max_tokens = int(data.get("max_tokens", 1024))
    temperature = float(data.get("temperature", 1.0))
    repetition_penalty = float(data.get("repetition_penalty", 1.2))
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if language not in CHATTERBOX_LANGUAGES:
        return jsonify({
            "error": f"Unsupported language '{language}'",
            "supported": list(CHATTERBOX_LANGUAGES.keys())
        }), 400

    # Check if required files are present, otherwise trigger download UI
    guard = _ensure_files_present_or_start("chatterbox", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("chatterbox_multilingual", {"endpoint": "/audio", "language": language})
    local_dir = repo_local_dir(CHATTERBOX_MULTILINGUAL_MODEL_ID)

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 3)

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("chatterbox") as is_offline:
            model = ChatterboxONNX.from_pretrained(
                model_type="multilingual", device="cpu", local_dir=str(local_dir),
                local_files_only=is_offline
            )

        temp_file = None
        audio_path = None

        if synthesis_url:
            temp_file = str(FILES_DIR / f"_ref_{int(time.time())}.wav")
            resp = requests.get(synthesis_url, timeout=30)
            resp.raise_for_status()
            with open(temp_file, "wb") as f:
                f.write(resp.content)
            audio_path = temp_file
        elif synthesis_b64:
            temp_file = str(FILES_DIR / f"_ref_{int(time.time())}.wav")
            with open(temp_file, "wb") as f:
                f.write(base64.b64decode(synthesis_b64))
            audio_path = temp_file
        else:
            # Use default voice from local repo
            audio_path = str(local_dir / "default_voice.wav")

        genbus.progress(gen_id, "generating", 1, 3)

        wav = model.generate(
            text=prompt, audio_prompt_path=audio_path, language_id=language,
            exaggeration=exaggeration, max_new_tokens=max_tokens,
            temperature=temperature, repetition_penalty=repetition_penalty
        )

        genbus.progress(gen_id, "finalizing", 2, 3)

        out_path = str(FILES_DIR / f"tts_{language}_{int(time.time())}.wav")
        model.save_audio(wav, out_path)

        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)
        del model, wav

        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"audio_path": out_path})
        
        return jsonify({
            "ok": True, "audio_path": out_path, "model": "multilingual-onnx",
            "language": language, "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201
    
    except Exception as e:
        logger.exception("Multilingual TTS failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


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
@require_auth(min_level=LEVEL_REQUIREMENTS["audio"], allow_demo=True)
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
        for i, (gs, ps, audio) in enumerate(pipeline(prompt, voice=voice, speed=speed)):
            audio_segments.append(audio)

        # Concatenate all audio segments
        if audio_segments:
            full_audio = np.concatenate(audio_segments)
        else:
            raise ValueError("No audio generated")

        genbus.progress(gen_id, "saving", 2, 3)

        # Save to file (24kHz sample rate)
        out_name = f"kokoro_{int(time.time())}_{gen_id[:8]}.wav"
        out_path = str(FILES_DIR / out_name)

        # Convert to int16 WAV
        audio_int16 = (full_audio * 32767).astype(np.int16)

        with wave.open(out_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(24000)  # Kokoro outputs at 24kHz
            wav_file.writeframes(audio_int16.tobytes())

        genbus.finish(gen_id, {"audio_path": out_path})
        logger.info(f"[Kokoro] Generated audio: {out_path}")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "model": "kokoro",
            "voice": voice,
            "gender": KOKORO_VOICES[voice]["gender"],
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Kokoro TTS failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


# =============================================================================
# REST API: QWEN3-TTS - High-Quality Voice Design & Cloning
# =============================================================================

# Model caches
_qwen3_tts_base = None
_qwen3_tts_design = None
_qwen3_tts_lock = threading.Lock()

# Voice prompt cache for reusing designed voices
_voice_prompt_cache = {}


def _load_qwen3_tts_base():
    """Load Qwen3-TTS Base model for voice cloning."""
    global _qwen3_tts_base

    with _qwen3_tts_lock:
        if _qwen3_tts_base is not None:
            return _qwen3_tts_base

        from qwen_tts import Qwen3TTSModel

        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        logger.info(f"[Qwen3-TTS] Loading Base model on {device}...")

        # Attention implementation: flash_attention_2 for CUDA, sdpa for MPS, eager for CPU
        if device.type == "cuda":
            attn_impl = "flash_attention_2"
        elif device.type == "mps":
            attn_impl = "sdpa"
        else:
            attn_impl = "eager"

        # Use local path if available, otherwise fall back to repo name
        local_dir = repo_local_dir(QWEN3_TTS_BASE_REPO)
        model_path = str(local_dir) if local_dir.exists() else QWEN3_TTS_BASE_REPO

        with offline_mode_if_complete("audio_quality_clone") as is_offline:
            _qwen3_tts_base = Qwen3TTSModel.from_pretrained(
                model_path,
                device_map=str(device),
                torch_dtype=dtype,
                attn_implementation=attn_impl,
                local_files_only=is_offline,
            )

        logger.info("[Qwen3-TTS] Base model loaded successfully")
        return _qwen3_tts_base


def _load_qwen3_tts_design():
    """Load Qwen3-TTS VoiceDesign model for creating voices from descriptions."""
    global _qwen3_tts_design

    with _qwen3_tts_lock:
        if _qwen3_tts_design is not None:
            return _qwen3_tts_design

        from qwen_tts import Qwen3TTSModel

        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        logger.info(f"[Qwen3-TTS] Loading VoiceDesign model on {device}...")

        # Attention implementation: flash_attention_2 for CUDA, sdpa for MPS, eager for CPU
        if device.type == "cuda":
            attn_impl = "flash_attention_2"
        elif device.type == "mps":
            attn_impl = "sdpa"
        else:
            attn_impl = "eager"

        # Use local path if available, otherwise fall back to repo name
        local_dir = repo_local_dir(QWEN3_TTS_DESIGN_REPO)
        model_path = str(local_dir) if local_dir.exists() else QWEN3_TTS_DESIGN_REPO

        with offline_mode_if_complete("audio_quality_design") as is_offline:
            _qwen3_tts_design = Qwen3TTSModel.from_pretrained(
                model_path,
                device_map=str(device),
                torch_dtype=dtype,
                attn_implementation=attn_impl,
                local_files_only=is_offline,
            )

        logger.info("[Qwen3-TTS] VoiceDesign model loaded successfully")
        return _qwen3_tts_design


@app.route("/audio/quality/design", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["audio"], allow_demo=True)
def audio_quality_design():
    """
    Design a voice from a text description using Qwen3-TTS VoiceDesign.

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

    gen_id = genbus.new("qwen3_tts_design", {"endpoint": "/audio/quality/design", "voice_id": voice_id})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 4)

        model = _load_qwen3_tts_design()

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
        base_model = _load_qwen3_tts_base()
        voice_prompt = base_model.create_voice_clone_prompt(
            ref_audio=(wavs[0], sr),
            ref_text=text,
        )
        _voice_prompt_cache[voice_id] = {
            "prompt": voice_prompt,
            "ref_audio_path": out_path,
            "ref_text": text,
            "instruct": instruct,
            "created_at": time.time(),
        }

        genbus.progress(gen_id, "complete", 3, 4)
        genbus.finish(gen_id, {"audio_path": out_path, "voice_id": voice_id})

        logger.info(f"[Qwen3-TTS] Voice designed: {out_path} (voice_id: {voice_id})")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "voice_id": voice_id,
            "voice_prompt_cached": True,
            "model": "qwen3-tts-voicedesign",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Qwen3-TTS VoiceDesign failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/quality/clone", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["audio"], allow_demo=True)
def audio_quality_clone():
    """
    Generate speech using voice cloning with Qwen3-TTS Base.

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

    gen_id = genbus.new("qwen3_tts_clone", {"endpoint": "/audio/quality/clone", "voice_id": voice_id or "custom"})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 4)

        model = _load_qwen3_tts_base()

        genbus.progress(gen_id, "preparing voice", 1, 4)

        voice_prompt = None

        # Try to get cached voice prompt
        if voice_id and voice_id in _voice_prompt_cache:
            voice_prompt = _voice_prompt_cache[voice_id]["prompt"]
            logger.info(f"[Qwen3-TTS] Using cached voice prompt: {voice_id}")
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
            voice_prompt = model.create_voice_clone_prompt(
                ref_audio=(ref_audio, sr),
                ref_text=ref_text,
            )

            # Cache if voice_id provided
            if voice_id:
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

        genbus.finish(gen_id, {"audio_path": out_path})
        logger.info(f"[Qwen3-TTS] Voice cloned: {out_path}")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "voice_id": voice_id or None,
            "model": "qwen3-tts-base",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Qwen3-TTS Clone failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()


@app.route("/audio/quality/persona", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["audio"], allow_demo=True)
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
            "sample_text": "Sample text for voice design" (optional)
        },
        "language": "English" (default),
        "force_redesign": false (recreate voice even if cached),
        "auto_download": false
    }
    """
    data = request.get_json(silent=True) or {}

    text = (data.get("text") or "").strip()
    persona = data.get("persona") or {}
    language = (data.get("language") or "English").strip()
    force_redesign = bool(data.get("force_redesign", False))
    auto_dl = bool(data.get("auto_download", False))

    if not text:
        return jsonify({"error": "Missing 'text' to synthesize"}), 400

    voice_id = (persona.get("voice_id") or "").strip()
    instruct = (persona.get("instruct") or "").strip()
    sample_text = (persona.get("sample_text") or "").strip()

    if not voice_id:
        return jsonify({"error": "Missing 'persona.voice_id'"}), 400
    if not instruct and voice_id not in _voice_prompt_cache:
        return jsonify({"error": "Missing 'persona.instruct' for new persona"}), 400

    # Check if required files are present (both models)
    guard = _ensure_files_present_or_start("audio_quality_persona", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("qwen3_tts_persona", {"endpoint": "/audio/quality/persona", "voice_id": voice_id})

    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 5)

        # Check if voice is already cached
        need_design = force_redesign or voice_id not in _voice_prompt_cache

        if need_design:
            if not instruct:
                return jsonify({"error": f"Persona '{voice_id}' not cached. Provide 'persona.instruct' to design it."}), 400

            genbus.progress(gen_id, "designing voice", 1, 5)

            # Use sample_text or generate a reasonable sample
            if not sample_text:
                sample_text = "Hello, this is my voice. I hope you like it."

            # Design the voice
            design_model = _load_qwen3_tts_design()
            wavs, sr = design_model.generate_voice_design(
                text=sample_text,
                language=language,
                instruct=instruct,
            )

            # Save reference audio
            ref_path = str(FILES_DIR / f"persona_{voice_id}_ref.wav")
            import soundfile as sf
            sf.write(ref_path, wavs[0], sr)

            genbus.progress(gen_id, "creating voice prompt", 2, 5)

            # Create clone prompt
            clone_model = _load_qwen3_tts_base()
            voice_prompt = clone_model.create_voice_clone_prompt(
                ref_audio=(wavs[0], sr),
                ref_text=sample_text,
            )

            # Cache the prompt
            _voice_prompt_cache[voice_id] = {
                "prompt": voice_prompt,
                "ref_audio_path": ref_path,
                "ref_text": sample_text,
                "instruct": instruct,
                "created_at": time.time(),
            }

            logger.info(f"[Qwen3-TTS] Persona voice designed: {voice_id}")
        else:
            genbus.progress(gen_id, "using cached voice", 1, 5)
            logger.info(f"[Qwen3-TTS] Using cached persona: {voice_id}")

        genbus.progress(gen_id, "generating speech", 3, 5)

        # Generate speech with the persona voice
        clone_model = _load_qwen3_tts_base()
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

        import soundfile as sf
        sf.write(out_path, wavs[0], sr)

        genbus.finish(gen_id, {"audio_path": out_path})
        logger.info(f"[Qwen3-TTS] Persona speech: {out_path}")

        return jsonify({
            "ok": True,
            "audio_path": out_path,
            "voice_id": voice_id,
            "voice_designed": need_design,
            "model": "qwen3-tts-persona",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url(),
        }), 201

    except Exception as e:
        logger.exception("Qwen3-TTS Persona failed")
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


@app.route("/audio/info", methods=["GET"])
def audio_info():
    '''Audio model capabilities.'''
    return jsonify({
        "models": {
            "multilingual": {
                "name": "Chatterbox Multilingual (ONNX)",
                "endpoint": "/audio",
                "languages": CHATTERBOX_LANGUAGES,
                "features": ["emotion_exaggeration", "voice_cloning", "23_languages"],
                "requires_voice_reference": False,
            },
            "turbo": {
                "name": "Kokoro TTS",
                "endpoint": "/audio/turbo",
                "voices": KOKORO_VOICES,
                "default_voices": KOKORO_DEFAULT_VOICE,
                "features": ["fast_inference", "multiple_voices", "gender_selection", "speed_control"],
                "requires_voice_reference": False,
            },
            "quality_design": {
                "name": "Qwen3-TTS VoiceDesign",
                "endpoint": "/audio/quality/design",
                "features": ["voice_design_from_description", "high_quality", "expressive"],
                "requires_voice_reference": False,
                "description": "Create a voice from text description (age, gender, style)",
            },
            "quality_clone": {
                "name": "Qwen3-TTS Clone",
                "endpoint": "/audio/quality/clone",
                "features": ["voice_cloning", "high_quality", "reusable_voice_prompts"],
                "requires_voice_reference": True,
                "description": "Clone speech from a reference audio or cached voice",
            },
            "quality_persona": {
                "name": "Qwen3-TTS Persona",
                "endpoint": "/audio/quality/persona",
                "features": ["voice_design", "voice_cloning", "persona_caching", "high_quality"],
                "requires_voice_reference": False,
                "description": "Design a persona voice and generate speech (combines design + clone)",
            },
        },
        "cached_voices": list(_voice_prompt_cache.keys()),
        "note": "Turbo uses Kokoro for fast inference, Quality uses Qwen3-TTS for high-quality output",
    }), 200

# =============================================================================
# REST API: LTX-2 VIDEO (GGUF) - Text-to-Video and Image-to-Video
# =============================================================================

@app.route("/video", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["video"], allow_demo=True)
def ltx2_gguf_video():
    """
    LTX-2 (19B DiT) Video generation using distilled Q3_K_S GGUF quantization.

    Supports two modes:
    - "t2v" (text-to-video): Generate video from text prompt only
    - "i2v" (image-to-video): Generate video from image + text prompt

    Uses from_single_file to load the GGUF-quantized transformer directly.
    Distilled model works best with 8-10 steps and CFG=1.
    """
    data = request.get_json(force=True) or {}

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
                pil_image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")

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

            # Motion fix: light preprocessing to help video models generate motion
            import numpy as _np
            _buf = io.BytesIO()
            pil_image.save(_buf, format="JPEG", quality=90)
            _buf.seek(0)
            pil_image = Image.open(_buf).convert("RGB")
            _arr = _np.asarray(pil_image).astype(_np.float32)
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
            config=LTX2_REPO,
            subfolder="transformer",
            quantization_config=quantization_config,
            torch_dtype=model_dtype,
        )

        # Load the appropriate pipeline based on mode
        if mode == "t2v":
            # Text-to-Video pipeline
            pipe = LTX2Pipeline.from_pretrained(
                LTX2_REPO,
                transformer=transformer,
                torch_dtype=model_dtype,
            )
        else:
            # Image-to-Video pipeline
            pipe = LTX2ImageToVideoPipeline.from_pretrained(
                LTX2_REPO,
                transformer=transformer,
                torch_dtype=model_dtype,
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
        pipe.enable_model_cpu_offload()
        
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
                decode_timestep=0.05,  # Motion fix: lower decode_timestep improves motion
                output_type="np",
                return_dict=False,
            )

        # Convert video to uint8
        import numpy as np
        video = np.nan_to_num(video, nan=0.0, posinf=1.0, neginf=0.0)
        video = np.clip(video, 0, 1)
        video = (video * 255).round().astype("uint8")

        # Convert video to tensor for encoding
        video = torch.from_numpy(video)

        # Save video with audio using encode_video
        from diffusers.pipelines.ltx2.export_utils import encode_video
        files_dir = MODEL_DIR / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(files_dir / f"ltx2_{mode}_{gen_id}.mp4")

        # Get audio sample rate from vocoder if available
        audio_sr = 24000
        if hasattr(pipe, 'vocoder') and hasattr(pipe.vocoder, 'config'):
            audio_sr = getattr(pipe.vocoder.config, 'output_sampling_rate', 24000)

        encode_video(
            video[0],
            fps=frame_rate,
            audio=audio[0].float().cpu() if audio is not None else None,
            audio_sample_rate=audio_sr,
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


@app.route("/training/datasets", methods=["POST"])
def create_training_dataset():
    """Create a new training dataset from uploaded files."""
    data = request.get_json(silent=True) or {}
    
    name = (data.get("name") or "").strip()
    dataset_type = (data.get("type") or "").strip()  # "text" or "image"
    files = data.get("files", [])  # List of {filename, content_base64}
    
    if not name:
        return jsonify({"error": "Missing 'name'"}), 400
    if dataset_type not in ("text", "image"):
        return jsonify({"error": "Type must be 'text' or 'image'"}), 400
    if not files:
        return jsonify({"error": "No files provided"}), 400
    
    dataset_id = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
    dataset_dir = MODEL_DIR / "datasets" / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    saved_files = []
    for f in files:
        filename = f.get("filename", f"file_{len(saved_files)}")
        content = base64.b64decode(f.get("content_base64", ""))
        file_path = dataset_dir / filename
        with open(file_path, "wb") as out:
            out.write(content)
        saved_files.append(filename)
    
    metadata = {
        "id": dataset_id,
        "name": name,
        "type": dataset_type,
        "files": saved_files,
        "num_files": len(saved_files),
        "created_at": datetime.now().isoformat(),
    }
    
    with open(dataset_dir / "metadata.json", "w") as f:
        json.dump(metadata, f)
    
    return jsonify(_json_sanitize({"ok": True, "dataset": metadata})), 201


@app.route("/training/datasets/<dataset_id>", methods=["DELETE"])
def delete_training_dataset(dataset_id):
    """Delete a training dataset."""
    dataset_dir = MODEL_DIR / "datasets" / dataset_id
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    shutil.rmtree(dataset_dir)
    return jsonify({"ok": True}), 200


# =============================================================================
# REST API: TRAINING - LLM FINETUNING (Cross-Platform)
# =============================================================================

@app.route("/training/llm/start", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["training"], allow_demo=False)
def start_llm_finetuning():
    """
    Start LLM finetuning using LoRA/QLoRA.
    
    Supports: Llama 3.2 1B, 3B, Llama 3.1 8B
    Cross-platform: CUDA (with QLoRA), MPS, CPU
    
    Note: 4-bit quantization (QLoRA) only available on CUDA.
    """
    data = request.get_json(silent=True) or {}
    
    dataset_id = (data.get("dataset_id") or "").strip()
    base_model = data.get("base_model", "llama-3.2-1b")
    epochs = int(data.get("epochs", 3))
    batch_size = int(data.get("batch_size", 4))
    learning_rate = float(data.get("learning_rate", 2e-4))
    lora_r = int(data.get("lora_r", 16))
    lora_alpha = int(data.get("lora_alpha", 32))
    use_4bit = bool(data.get("use_4bit", True))
    max_seq_length = int(data.get("max_seq_length", 2048))
    
    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400
    
    dataset_dir = MODEL_DIR / "datasets" / dataset_id
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    if base_model not in LLAMA_REPOS:
        return jsonify({
            "error": f"Unsupported model: {base_model}",
            "supported": list(LLAMA_REPOS.keys())
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
            model_name = LLAMA_REPOS[base_model]
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
                return tokenizer(
                    examples["text"],
                    truncation=True,
                    max_length=max_seq_length,
                    padding="max_length",
                )
            
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
                training_args_kwargs["use_mps_device"] = True
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
                tokenizer=tokenizer,
                callbacks=[ProgressCallback()],
            )
            
            # Train
            result = trainer.train()
            
            emit_progress("saving", epochs, epochs, pct=95)
            
            # Save LoRA weights
            model.save_pretrained(str(output_dir / "lora"))
            tokenizer.save_pretrained(str(output_dir / "tokenizer"))
            
            # Save metadata
            train_meta = {
                "id": training_id,
                "type": "llm_lora",
                "base_model": base_model,
                "dataset_id": dataset_id,
                "epochs": epochs,
                "final_loss": result.training_loss,
                "lora_r": lora_r,
                "lora_alpha": lora_alpha,
                "device_used": device_str,
                "used_4bit": actual_use_4bit,
                "created_at": datetime.now().isoformat(),
            }
            with open(output_dir / "metadata.json", "w") as f:
                json.dump(train_meta, f)
            
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
    
    threading.Thread(target=_train_worker, daemon=True).start()
    
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
@require_auth(min_level=LEVEL_REQUIREMENTS["training"], allow_demo=False)
def start_sdxl_lora_training():
    """
    Start SDXL LoRA training from image dataset.
    
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
    
    if not dataset_id:
        return jsonify({"error": "Missing 'dataset_id'"}), 400
    if not instance_prompt:
        return jsonify({"error": "Missing 'instance_prompt' (e.g., 'a photo of sks person')"}), 400
    
    dataset_dir = MODEL_DIR / "datasets" / dataset_id
    if not dataset_dir.exists():
        return jsonify({"error": "Dataset not found"}), 404
    
    # Verify SDXL base is available
    guard = _repos_ready_or_resp(SDXL_BASE_REPO)
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
            
            # Load SDXL with map_location for cross-platform compatibility
            pipe = StableDiffusionXLPipeline.from_pretrained(
                str(repo_local_dir(SDXL_BASE_REPO)),
                torch_dtype=dtype,
                use_safetensors=True,
                local_files_only=True,
            )
            
            # Move components to device
            unet = pipe.unet.to(device)
            vae = pipe.vae.to(device)
            text_encoder = pipe.text_encoder.to(device)
            text_encoder_2 = pipe.text_encoder_2.to(device)
            tokenizer = pipe.tokenizer
            tokenizer_2 = pipe.tokenizer_2
            
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
            text_encoder.requires_grad_(False)
            text_encoder_2.requires_grad_(False)
            unet.requires_grad_(False)
            
            # Enable LoRA params
            lora_params = []
            for name, param in unet.named_parameters():
                if "lora" in name.lower():
                    param.requires_grad = True
                    lora_params.append(param)
            
            logger.info(f"[SDXL LoRA] Trainable parameters: {sum(p.numel() for p in lora_params)}")
            
            emit_progress("preparing_data", 0, epochs, pct=30)
            
            # Encode prompts
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
            
            prompt_embeds, pooled_embeds = encode_prompt(instance_prompt)
            
            # Encode images to latents
            from torchvision import transforms
            
            transform = transforms.Compose([
                transforms.ToTensor(),
                transforms.Normalize([0.5], [0.5]),
            ])
            
            latents_list = []
            vae_dtype = torch.float32 if device.type == "mps" else dtype
            for img in images:
                img_tensor = transform(img).unsqueeze(0).to(device, dtype=vae_dtype)
                with torch.no_grad():
                    latent = vae.encode(img_tensor).latent_dist.sample()
                    latent = latent * vae.config.scaling_factor
                latents_list.append(latent.to(dtype))
            
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
            noise_scheduler = pipe.scheduler
            
            total_steps = epochs * len(latents_list)
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
                
                for i, latent in enumerate(latents_list):
                    # Sample noise
                    noise = torch.randn_like(latent)
                    
                    # Sample timestep
                    timesteps = torch.randint(
                        0, noise_scheduler.config.num_train_timesteps,
                        (1,), device=device
                    ).long()
                    
                    # Add noise
                    noisy_latent = noise_scheduler.add_noise(latent, noise, timesteps)
                    
                    # Predict noise
                    added_cond_kwargs = {
                        "text_embeds": pooled_embeds.repeat(1, 1),
                        "time_ids": torch.tensor(
                            [[resolution, resolution, 0, 0, resolution, resolution]],
                            device=device, dtype=dtype
                        ),
                    }
                    
                    noise_pred = unet(
                        noisy_latent,
                        timesteps,
                        encoder_hidden_states=prompt_embeds,
                        added_cond_kwargs=added_cond_kwargs,
                    ).sample
                    
                    # Loss
                    loss = torch.nn.functional.mse_loss(noise_pred.float(), noise.float())
                    
                    optimizer.zero_grad()
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(lora_params, 1.0)
                    optimizer.step()
                    lr_scheduler.step()
                    
                    epoch_loss += loss.item()
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
            
            # Save using PEFT's method
            unet.save_pretrained(str(output_dir / "lora"))
            
            # Save metadata
            train_meta = {
                "id": training_id,
                "type": "sdxl_lora",
                "base_model": "sdxl-base-1.0",
                "dataset_id": dataset_id,
                "instance_prompt": instance_prompt,
                "epochs": epochs,
                "final_loss": avg_loss,
                "lora_rank": lora_rank,
                "resolution": resolution,
                "num_images": len(images),
                "device_used": device_str,
                "created_at": datetime.now().isoformat(),
            }
            with open(output_dir / "metadata.json", "w") as f:
                json.dump(train_meta, f)
            
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
    
    threading.Thread(target=_train_worker, daemon=True).start()
    
    return jsonify(_json_sanitize({
        "ok": True,
        "training_id": training_id,
        "message": "SDXL LoRA training started",
        "device": str(DeviceManager.get_device()),
    })), 202


# =============================================================================
# REST API: TRAINING - LIST TRAINED MODELS
# =============================================================================

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
    model_dir = MODEL_DIR / "trained" / model_id
    if not model_dir.exists():
        return jsonify({"error": "Model not found"}), 404
    
    shutil.rmtree(model_dir)
    return jsonify({"ok": True}), 200


@app.route("/training/models/<model_id>/export", methods=["POST"])
def export_trained_model(model_id):
    """Export a trained model to a specified path."""
    model_dir = MODEL_DIR / "trained" / model_id
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
        "supported_llm_models": list(LLAMA_REPOS.keys()),
        "supported_image_models": ["sdxl-base-1.0"],
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
# VISION ANALYSIS (Qwen3-VL 2B)
# =============================================================================

# Global cache for vision model
_qwen3_vl_model = None
_qwen3_vl_processor = None
_qwen3_vl_lock = threading.Lock()


def _load_qwen3_vision():
    """Load Qwen3-VL 2B model for vision analysis."""
    global _qwen3_vl_model, _qwen3_vl_processor

    with _qwen3_vl_lock:
        if _qwen3_vl_model is not None:
            return _qwen3_vl_model, _qwen3_vl_processor

        from transformers import Qwen3VLForConditionalGeneration, AutoProcessor

        # Get local repo path
        local_dir = repo_local_dir(QWEN3_VL_REPO)
        model_path = str(local_dir) if local_dir.exists() else QWEN3_VL_REPO

        logger.info(f"[Vision] Loading Qwen3-VL 2B from {model_path}")

        # Load model exactly as in reference: dtype="auto", device_map="auto"
        model = Qwen3VLForConditionalGeneration.from_pretrained(
            model_path,
            torch_dtype="auto",
            device_map="auto",
            local_files_only=LOCAL_ONLY,
        )

        # Qwen3-VL uses 32px patch size - set min/max pixels to avoid split_sizes errors
        # min_pixels: minimum image size (256 tokens worth = 256 * 32 * 32)
        # max_pixels: maximum to balance speed/memory (1280 tokens worth)
        min_pixels = 256 * 32 * 32   # ~262k pixels
        max_pixels = 1280 * 32 * 32  # ~1.3M pixels

        processor = AutoProcessor.from_pretrained(
            model_path,
            local_files_only=LOCAL_ONLY,
            min_pixels=min_pixels,
            max_pixels=max_pixels,
        )

        _qwen3_vl_model = model
        _qwen3_vl_processor = processor

        logger.info("[Vision] Qwen3-VL 2B loaded successfully")
        return model, processor


def _unload_qwen3_vision():
    """Unload Qwen3-VL model to free memory."""
    global _qwen3_vl_model, _qwen3_vl_processor

    with _qwen3_vl_lock:
        if _qwen3_vl_model is not None:
            del _qwen3_vl_model
            _qwen3_vl_model = None
        if _qwen3_vl_processor is not None:
            del _qwen3_vl_processor
            _qwen3_vl_processor = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("[Vision] Qwen3-VL model unloaded")


@app.route("/vision/analyze", methods=["POST"])
@require_auth(min_level=LEVEL_REQUIREMENTS["vision"], allow_demo=True)
def vision_analyze():
    """
    Analyze an image using Qwen3-VL 2B vision-language model.

    Request body:
    {
        "image_base64": "...",  # Base64 encoded image (required)
        "prompt": "...",        # Analysis prompt (optional, defaults to describe)
        "max_tokens": 512,      # Max response tokens (optional)
        "auto_download": false  # Start download if model missing (optional)
    }

    Returns:
    {
        "success": true,
        "response": "...",      # Model's text response
        "generation_id": "..."
    }
    """
    data = request.get_json(silent=True) or {}

    image_b64 = data.get("image_base64") or data.get("image")
    if not image_b64:
        return jsonify({"error": "image_base64 is required"}), 400

    prompt = (data.get("prompt") or "Describe this image in detail.").strip()
    max_tokens = int(data.get("max_tokens", 512))
    auto_dl = bool(data.get("auto_download", False))

    # Check if model is available
    guard = _ensure_files_present_or_start("qwen3_vision", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("qwen3_vision", {"endpoint": "/vision/analyze", "prompt": prompt[:100]})

    try:
        genbus.progress(gen_id, "Loading vision model", 1, 10)

        # Load model (cached after first load)
        model, processor = _load_qwen3_vision()

        genbus.progress(gen_id, "Processing image", 3, 10)

        # Extract raw base64 data and validate image
        if image_b64.startswith("data:"):
            # Parse data URL: data:image/jpeg;base64,<data>
            header, b64_data = image_b64.split(",", 1)
        else:
            b64_data = image_b64

        # Decode and ensure RGB format
        image_bytes = base64.b64decode(b64_data)
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to RGB if needed (removes alpha channel, handles palette images)
        if image.mode != "RGB":
            image = image.convert("RGB")

        logger.info(f"[Vision] Input image size: {image.size}")

        genbus.progress(gen_id, "Analyzing image", 5, 10)

        # Use qwen_vl_utils for proper image processing (avoids split_sizes errors)
        from qwen_vl_utils import process_vision_info

        # Build message for Qwen3-VL format
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "image": image,  # PIL Image
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        # Apply chat template to get the text
        text = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        # Use process_vision_info to properly extract and process image
        image_inputs, video_inputs = process_vision_info(messages)

        # Process inputs with the processor
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to(model.device)

        # Generate response with anti-repetition settings
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                repetition_penalty=1.2,      # Penalize repeated tokens
                no_repeat_ngram_size=4,       # Prevent 4-gram repetition
                do_sample=False,              # Greedy decoding for consistency
            )
            # Trim input tokens from output
            generated_ids_trimmed = [
                out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            response = processor.batch_decode(
                generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
            )[0]

        genbus.progress(gen_id, "Complete", 10, 10)
        genbus.finish(gen_id)

        return jsonify(_json_sanitize({
            "success": True,
            "response": response,
            "generation_id": gen_id,
        }))

    except Exception as e:
        logger.exception(f"[Vision] Analysis failed: {e}")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500


@app.route("/vision/unload", methods=["POST"])
def vision_unload():
    """Unload the vision model to free memory."""
    _unload_qwen3_vision()
    return jsonify({"success": True, "message": "Vision model unloaded"})


@app.route("/")
def root():
    return jsonify(_json_sanitize({
        "message": "BonzAI Media Generation Server",
        "local_only": LOCAL_ONLY
    }))


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
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200

    try:
        unloaded = []

        # Unload Kokoro TTS pipeline
        global _kokoro_pipeline
        if _kokoro_pipeline is not None:
            try:
                del _kokoro_pipeline
            except:
                pass
            _kokoro_pipeline = None
            unloaded.append("kokoro_tts")

        # Unload Qwen3 TTS models
        global _qwen3_tts_base, _qwen3_tts_design
        if _qwen3_tts_base is not None:
            try:
                if hasattr(_qwen3_tts_base, 'to'):
                    _qwen3_tts_base.to('cpu')
                del _qwen3_tts_base
            except:
                pass
            _qwen3_tts_base = None
            unloaded.append("qwen3_tts_base")
        if _qwen3_tts_design is not None:
            try:
                if hasattr(_qwen3_tts_design, 'to'):
                    _qwen3_tts_design.to('cpu')
                del _qwen3_tts_design
            except:
                pass
            _qwen3_tts_design = None
            unloaded.append("qwen3_tts_design")

        # Unload Qwen3 Vision model
        global _qwen3_vl_model, _qwen3_vl_processor
        if _qwen3_vl_model is not None:
            try:
                if hasattr(_qwen3_vl_model, 'to'):
                    _qwen3_vl_model.to('cpu')
                del _qwen3_vl_model
            except:
                pass
            _qwen3_vl_model = None
            unloaded.append("qwen3_vl")
        if _qwen3_vl_processor is not None:
            try:
                del _qwen3_vl_processor
            except:
                pass
            _qwen3_vl_processor = None

        # Clear voice prompt cache (can hold large tensors)
        global _voice_prompt_cache
        if _voice_prompt_cache:
            cache_size = len(_voice_prompt_cache)
            _voice_prompt_cache.clear()
            unloaded.append(f"voice_cache({cache_size})")

        # Clear any GGUF model locks state
        global _GGUF_LOCKS_GUARD
        # Just trigger cleanup, don't delete the lock itself

        # Force garbage collection - multiple passes to handle circular refs
        for _ in range(5):
            gc.collect()

        # Clear PyTorch CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            # Also clear CUDA memory pools
            try:
                torch.cuda.memory.empty_cache()
            except:
                pass

        # Clear PyTorch MPS cache (Apple Silicon)
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
            torch.mps.synchronize()

        # Call device manager cleanup
        DeviceManager.free_memory()

        # More aggressive garbage collection after device cleanup
        for _ in range(3):
            gc.collect()

        # Final MPS sync
        if torch.backends.mps.is_available():
            torch.mps.synchronize()
            torch.mps.empty_cache()

        # Try to clear HuggingFace accelerate offload state if present
        try:
            from accelerate.hooks import remove_hook_from_module
            # This helps clear CPU offload hooks that hold model references
        except ImportError:
            pass

        logger.info(f"[Memory] Aggressively cleared RAM/VRAM. Unloaded: {unloaded or 'none cached'}")
        return jsonify({"success": True, "message": "Memory cleared", "unloaded": unloaded})
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
        if _qwen3_tts_base is not None:
            status["cached_models"].append("qwen3_tts_base")
        if _qwen3_tts_design is not None:
            status["cached_models"].append("qwen3_tts_design")
        if _qwen3_vl_model is not None:
            status["cached_models"].append("qwen3_vl")
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