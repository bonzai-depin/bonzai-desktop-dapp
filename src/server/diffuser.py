#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BonzAI Media Generation Server
==============================
Clean, consolidated version with:
- Unified video encoding (no duplicate functions)
- Proper progress reporting for all pipelines
- Blend interpolation (no ghosting artifacts)
- WAN 2.2 I2V with Q4 GGUF quantization
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
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    GGUFQuantizationConfig,
    FluxPipeline,
    FluxImg2ImgPipeline,
    FluxTransformer2DModel,
    Flux2KleinPipeline,
    FlowMatchEulerDiscreteScheduler,
    AutoencoderKL,
    AutoencoderKLWan,
    WanImageToVideoPipeline,
    WanTransformer3DModel,
    ZImagePipeline,
    ZImageTransformer2DModel,
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
from diffusers.video_processor import VideoProcessor
from diffusers.utils.torch_utils import randn_tensor

# optimum-quanto for int8 quantization (LTX-2 turbo)
try:
    from optimum.quanto import freeze, qint8, quantize
    QUANTO_AVAILABLE = True
except ImportError:
    QUANTO_AVAILABLE = False
    logger = logging.getLogger("bonzai-server")
    logger.warning("optimum-quanto not installed. LTX-2 turbo will use fallback quantization.")

import wave
import copy

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

# Model repositories
SDXL_BASE_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"

FLUX_KREA_REPO = "black-forest-labs/FLUX.1-Krea-dev"
FLUX_KREA_GGUF_NAME = os.getenv("FLUX_GGUF_FILENAME", "flux1-krea-dev-Q5_K_M.gguf").strip()
FLUX_KREA_GGUF_URL = os.getenv("FLUX_KREA_GGUF_URL",
    "https://huggingface.co/QuantStack/FLUX.1-Krea-dev-GGUF/resolve/main/flux1-krea-dev-Q5_K_M.gguf").strip()

# Flux Klein 4B - Fast turbo generation (standard HuggingFace loading)
FLUX_KLEIN_REPO = "black-forest-labs/FLUX.2-klein-4B"

Z_REPO = "Tongyi-MAI/Z-Image-Turbo"
Z_GGUF_NAME = "z_image_turbo-Q5_K_M.gguf"
Z_GGUF_URL = "https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q5_K_M.gguf"

# WAN 2.2 I2V Model Configuration (Q4 GGUF for better quality - ~9.65GB each)
WAN_REPO = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
WAN22_GGUF_HIGH_NAME = "Wan2.2-Q4-High.gguf"
WAN22_GGUF_HIGH_URL = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/HighNoise/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf"
WAN22_GGUF_LOW_NAME = "Wan2.2-Q4-Low.gguf"
WAN22_GGUF_LOW_URL = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/LowNoise/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf"
WAN_21_VAE_NAME = "wan_2.1_vae.safetensors"
WAN_21_VAE_URL = "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors"

# LTX-2 (19B DiT Model) - Uses optimum-quanto int8 quantization
# Loads transformer from repo subfolder, quantizes on first run, caches for reuse
# Quanto INT8 is preferred over FP8 for MPS compatibility and memory efficiency
# VAEs loaded from repo subfolders (vae/, audio_vae/)
LTX2_REPO = "Lightricks/LTX-2"
LTX2_QUANTO_CACHE_DIR = MODEL_DIR / "ltx2_quanto_cache"

CHATTERBOX_REPO = "ResembleAI/chatterbox"

CHATTERBOX_MULTILINGUAL_MODEL_ID = "onnx-community/chatterbox-multilingual-ONNX"

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
    "flux1-krea-dev-Q5_K_M.gguf": 8_419_501_344,
    "z_image_turbo-Q5_K_M.gguf": 5_522_742_336,
    "Wan2.2-Q4-High.gguf": 9_651_739_136,  # ~9.65GB Q4
    "Wan2.2-Q4-Low.gguf": 9_651_739_136,  # ~9.65GB Q4
    "wan_2.1_vae.safetensors": 253_815_318,  # ~242MB split VAE
    "umt5-xxl-encoder-Q3_K_M.gguf": 5_580_000_000,  # ~5.2GB GGUF text encoder
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
    def from_pretrained(cls, model_type="multilingual", device="cpu", dtype="fp32", cache_dir=None, local_files_only=True):
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from transformers import AutoTokenizer

        if model_type != "multilingual":
            raise ValueError(f"model_type must be 'multilingual'")

        model_id = CHATTERBOX_MULTILINGUAL_MODEL_ID

        # CoreML fails with external .onnx_data files - use CPU
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == "cuda" and torch.cuda.is_available() else ['CPUExecutionProvider']

        logger.info(f"[Chatterbox {model_type}] Loading ONNX models (local_files_only={local_files_only})...")

        def download(name):
            suffix = "" if dtype == "fp32" else "_quantized" if dtype == "q8" else f"_{dtype}"
            filename = f"{name}{suffix}.onnx"
            path = hf_hub_download(model_id, subfolder="onnx", filename=filename, cache_dir=cache_dir, local_files_only=local_files_only)
            try:
                hf_hub_download(model_id, subfolder="onnx", filename=f"{filename}_data", cache_dir=cache_dir, local_files_only=local_files_only)
            except:
                pass
            return path

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        return cls(
            model_type=model_type,
            speech_encoder=ort.InferenceSession(download("speech_encoder"), opts, providers=providers),
            embed_tokens=ort.InferenceSession(download("embed_tokens"), opts, providers=providers),
            language_model=ort.InferenceSession(download("language_model"), opts, providers=providers),
            cond_decoder=ort.InferenceSession(download("conditional_decoder"), opts, providers=providers),
            tokenizer=AutoTokenizer.from_pretrained(model_id, cache_dir=cache_dir, local_files_only=local_files_only),
            cache_dir=cache_dir,
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
CORS(app)

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
# LTX-2 QUANTO QUANTIZATION HELPERS
# =============================================================================

def quanto_gc():
    """Aggressive garbage collection to free VRAM after quanto operations."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
        torch.mps.synchronize()


def quantize_quanto_int8(module: torch.nn.Module, name: str) -> torch.nn.Module:
    """Quantize a module to int8 using optimum-quanto and freeze it."""
    if not QUANTO_AVAILABLE:
        logger.warning(f"[quanto] optimum-quanto not available, skipping quantization for {name}")
        return module
    logger.info(f"[quanto] Quantizing {name} -> qint8 ...")
    quantize(module, weights=qint8)
    freeze(module)
    module.eval()
    return module


def load_or_build_quantized(cache_path: Path, build_fn, name: str) -> torch.nn.Module:
    """Load cached quantized model or build, quantize, and cache it."""
    if cache_path.exists():
        logger.info(f"[cache] Loading {name} from: {cache_path}")
        try:
            return torch.load(cache_path, map_location="cpu", weights_only=False)
        except Exception as e:
            logger.warning(f"[cache] Failed to load {name}, rebuilding: {e}")

    logger.info(f"[cache] Building {name} (first run, will be cached)...")
    module = build_fn()

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        torch.save(module, cache_path)
        logger.info(f"[cache] Saved {name} to: {cache_path}")
    except Exception as e:
        logger.warning(f"[cache] Failed to save {name}: {e}")

    return module


# =============================================================================
# LTX-2 GROUP SWAP HOOKS (Memory-Efficient Transformer Inference)
# =============================================================================

@dataclass
class GroupSwapState:
    """Manages moving transformer blocks between CPU and GPU for memory efficiency."""
    blocks: List[torch.nn.Module]
    device: torch.device
    group_size: int
    keep_non_block_on_gpu: bool
    non_block_modules: List[torch.nn.Module]
    current_group_start: Optional[int] = None

    def _move_group(self, start: int, target) -> None:
        end = min(start + self.group_size, len(self.blocks))
        for j in range(start, end):
            self.blocks[j].to(target)

    def ensure_group_loaded(self, i: int) -> None:
        start = (i // self.group_size) * self.group_size
        if self.current_group_start == start:
            return
        # Load new group
        self._move_group(start, self.device)
        if not self.keep_non_block_on_gpu:
            for m in self.non_block_modules:
                m.to(self.device)
        # Unload old group
        if self.current_group_start is not None:
            self._move_group(self.current_group_start, "cpu")
        self.current_group_start = start

    def unload_all(self) -> None:
        if self.current_group_start is not None:
            self._move_group(self.current_group_start, "cpu")
            self.current_group_start = None
        if not self.keep_non_block_on_gpu:
            for m in self.non_block_modules:
                m.to("cpu")


def attach_group_swap_hooks(
    transformer: torch.nn.Module,
    group_size: int,
    device: torch.device,
    keep_non_block_on_gpu: bool = True,
) -> GroupSwapState:
    """Register hooks to swap transformer blocks during forward pass for memory efficiency."""
    blocks = list(transformer.transformer_blocks)
    non_block = [
        child for name, child in transformer.named_children()
        if name != "transformer_blocks"
    ]

    state = GroupSwapState(
        blocks=blocks,
        device=device,
        group_size=int(group_size),
        keep_non_block_on_gpu=bool(keep_non_block_on_gpu),
        non_block_modules=non_block,
    )

    # Move everything to CPU initially
    transformer.to("cpu")
    for b in blocks:
        b.to("cpu")

    # Keep non-block modules on device if requested
    target_dev = device if keep_non_block_on_gpu else "cpu"
    for m in non_block:
        m.to(target_dev)

    # Register pre-hooks to load blocks on demand
    for i in range(len(blocks)):
        def make_hook(idx):
            return lambda m, inp: state.ensure_group_loaded(idx)
        blocks[i].register_forward_pre_hook(make_hook(i), with_kwargs=False)

    # Register cleanup hook after full forward pass
    def cleanup_hook(module, inputs, output):
        state.unload_all()
        return output

    transformer.register_forward_hook(cleanup_hook, with_kwargs=False)
    return state


def move_module_root_tensors(module: torch.nn.Module, device) -> None:
    """Move tensors directly attached to module (not in submodules)."""
    for name, p in list(module.named_parameters(recurse=False)):
        p.data = p.data.to(device)
    for name, b in list(module.named_buffers(recurse=False)):
        setattr(module, name, b.to(device))


# =============================================================================
# LTX-2 TEXT EMBEDDING HELPERS
# =============================================================================

def pack_text_embeds(
    text_hidden_states: torch.Tensor,
    sequence_lengths: torch.Tensor,
    device,
    padding_side: str = "left",
    scale_factor: int = 8,
    eps: float = 1e-6,
) -> torch.Tensor:
    """Pack text embeddings, matching LTX2 pipeline behavior."""
    batch_size, seq_len, hidden_dim, num_layers = text_hidden_states.shape
    original_dtype = text_hidden_states.dtype
    token_indices = torch.arange(seq_len, device=device).unsqueeze(0)

    if padding_side == "right":
        mask = token_indices < sequence_lengths[:, None]
    else:
        start_indices = seq_len - sequence_lengths[:, None]
        mask = token_indices >= start_indices

    mask = mask[:, :, None, None]
    masked_states = text_hidden_states.masked_fill(~mask, 0.0)
    num_valid = (sequence_lengths * hidden_dim).view(batch_size, 1, 1, 1)
    masked_mean = masked_states.sum(dim=(1, 2), keepdim=True) / (num_valid + eps)

    x_min = text_hidden_states.masked_fill(~mask, float("inf")).amin(dim=(1, 2), keepdim=True)
    x_max = text_hidden_states.masked_fill(~mask, float("-inf")).amax(dim=(1, 2), keepdim=True)

    normalized = (text_hidden_states - masked_mean) / (x_max - x_min + eps)
    normalized = normalized * scale_factor
    normalized = normalized.flatten(2)
    mask_flat = mask.squeeze(-1).expand(-1, -1, hidden_dim * num_layers)
    normalized = normalized.masked_fill(~mask_flat, 0.0)

    return normalized.to(dtype=original_dtype)


@torch.no_grad()
def get_gemma_embeds(
    prompt,
    tokenizer,
    text_encoder,
    device: torch.device,
    dtype: Optional[torch.dtype] = None,
):
    """Generate prompt embeddings and masks using Gemma."""
    prompts = [prompt] if isinstance(prompt, str) else prompt
    prompts = [p.strip() for p in prompts]

    tokenizer.padding_side = "left"
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    inputs = tokenizer(
        prompts,
        padding="max_length",
        max_length=1024,
        truncation=True,
        return_tensors="pt",
    )

    input_ids = inputs.input_ids.to(device)
    attn_mask = inputs.attention_mask.to(device)

    text_encoder.to(device)
    out = text_encoder(
        input_ids=input_ids,
        attention_mask=attn_mask,
        output_hidden_states=True
    )

    hidden_states = torch.stack(out.hidden_states, dim=-1)
    embeds = pack_text_embeds(
        hidden_states,
        attn_mask.sum(dim=-1),
        device=device,
        padding_side="left",
    )

    if dtype:
        embeds = embeds.to(dtype=dtype)

    return embeds, attn_mask


# =============================================================================
# LTX-2 LATENT PACKING/UNPACKING
# =============================================================================

def ltx2_pack_latents(latents: torch.Tensor, patch_size: int = 1, patch_size_t: int = 1) -> torch.Tensor:
    """Pack latents for LTX-2 transformer input."""
    b, c, f, h, w = latents.shape
    latents = latents.reshape(
        b, -1, f // patch_size_t, patch_size_t,
        h // patch_size, patch_size, w // patch_size, patch_size
    )
    latents = latents.permute(0, 2, 4, 6, 1, 3, 5, 7).flatten(4, 7).flatten(1, 3)
    return latents


def ltx2_unpack_latents(
    latents: torch.Tensor,
    num_frames: int,
    height: int,
    width: int,
    patch_size: int = 1,
    patch_size_t: int = 1
) -> torch.Tensor:
    """Unpack latents from LTX-2 transformer output."""
    b = latents.size(0)
    latents = latents.reshape(
        b, num_frames, height, width, -1,
        patch_size_t, patch_size, patch_size
    )
    latents = latents.permute(0, 4, 1, 5, 2, 6, 3, 7).flatten(6, 7).flatten(4, 5).flatten(2, 3)
    return latents


# =============================================================================
# LTX-2 CUSTOM DENOISING LOOP
# =============================================================================

@torch.no_grad()
def ltx2_denoise(
    *,
    image,
    prompt_embeds: torch.Tensor,
    prompt_mask: torch.Tensor,
    neg_embeds: torch.Tensor,
    neg_mask: torch.Tensor,
    scheduler,
    vae,
    audio_vae,
    connectors,
    transformer,
    num_frames: int,
    fps: float,
    height: int,
    width: int,
    steps: int,
    guidance: float,
    device: torch.device,
    dtype: torch.dtype,
    generator: torch.Generator,
    swap_state: Optional[GroupSwapState] = None,
    gen_id: Optional[str] = None,
):
    """Core LTX-2 denoising loop. Returns raw latents (video, audio)."""
    connectors.to(device)
    vae.to(device)

    if swap_state:
        for m in swap_state.non_block_modules:
            m.to(device)
    move_module_root_tensors(transformer, device)

    video_processor = VideoProcessor(vae_scale_factor=32, resample="bilinear")

    # Move embeddings to device (they may be on CPU from text encoder)
    prompt_embeds = prompt_embeds.to(device)
    prompt_mask = prompt_mask.to(device)
    neg_embeds = neg_embeds.to(device)
    neg_mask = neg_mask.to(device)

    do_cfg = guidance > 1.0
    if do_cfg:
        prompt_embeds = torch.cat([neg_embeds, prompt_embeds], dim=0)
        prompt_mask = torch.cat([neg_mask, prompt_mask], dim=0)

    add_mask = (1 - prompt_mask.to(prompt_embeds.dtype)) * -1e6

    # Run connectors on CPU for MPS compatibility (RoPE uses float64 internally)
    if device.type == "mps":
        connectors_device = torch.device("cpu")
        connectors.to(connectors_device)
        conn_embeds, conn_audio, conn_mask = connectors(
            prompt_embeds.to(connectors_device),
            add_mask.to(connectors_device),
            additive_mask=True
        )
        # Move results back to MPS
        conn_embeds = conn_embeds.to(device)
        conn_audio = conn_audio.to(device) if conn_audio is not None else None
        conn_mask = conn_mask.to(device) if conn_mask is not None else None
        connectors.to(device)  # Move back for any future use
    else:
        conn_embeds, conn_audio, conn_mask = connectors(
            prompt_embeds, add_mask, additive_mask=True
        )

    # Encode Image (Init Latents)
    img_t = video_processor.preprocess(image, height=height, width=width).to(device=device, dtype=dtype)

    h_lat, w_lat = height // 32, width // 32
    f_lat = (num_frames - 1) // 8 + 1

    init_latents = vae.encode(img_t[0].unsqueeze(0).unsqueeze(2)).latent_dist.mode()
    init_latents = init_latents.float()
    # Reshape mean/std for broadcasting with 5D latent tensor [batch, channels, frames, height, width]
    latents_mean = vae.latents_mean.to(device).view(1, -1, 1, 1, 1)
    latents_std = vae.latents_std.to(device).view(1, -1, 1, 1, 1)
    init_latents = (init_latents - latents_mean) * vae.config.scaling_factor / latents_std
    init_latents = init_latents.repeat(1, 1, f_lat, 1, 1)

    mask = torch.zeros((1, 1, f_lat, h_lat, w_lat), device=device, dtype=torch.float32)
    mask[:, :, 0] = 1.0

    noise = randn_tensor(
        (1, init_latents.shape[1], f_lat, h_lat, w_lat),
        generator=generator, device=device, dtype=torch.float32
    )
    latents = init_latents * mask + noise * (1 - mask)

    patch_size = transformer.config.patch_size
    patch_size_t = transformer.config.patch_size_t
    conditioning_mask = ltx2_pack_latents(mask, patch_size, patch_size_t).squeeze(-1)
    latents = ltx2_pack_latents(latents, patch_size, patch_size_t)

    if do_cfg:
        conditioning_mask = torch.cat([conditioning_mask] * 2, dim=0)

    # Prepare Audio Latents (following gist approach)
    # Shape: [B, C, L, M] -> pack -> [B, L, C*M]
    audio_dur = num_frames / fps
    audio_vae_temporal_ratio = getattr(audio_vae.config, 'temporal_compression_ratio', 4)
    audio_vae_mel_ratio = getattr(audio_vae.config, 'mel_compression_ratio', 4)
    audio_frames = round(audio_dur * (audio_vae.config.sample_rate / audio_vae.config.mel_hop_length / audio_vae_temporal_ratio))
    latent_mel_bins = audio_vae.config.mel_bins // audio_vae_mel_ratio
    num_audio_channels = audio_vae.config.latent_channels
    audio_latents = randn_tensor(
        (1, num_audio_channels, audio_frames, latent_mel_bins),
        generator=generator, device=device, dtype=torch.float32
    )
    # Pack: [B, C, L, M] -> [B, L, C*M] (matching gist's pack_audio_latents)
    audio_latents = audio_latents.transpose(1, 2).flatten(2, 3)

    sigmas = np.linspace(1.0, 1 / steps, steps)

    seq_len = f_lat * h_lat * w_lat
    base_seq_len, max_seq_len = 1024, 4096
    base_shift, max_shift = 0.95, 2.05
    slope = (max_shift - base_shift) / (max_seq_len - base_seq_len)
    mu = seq_len * slope + (base_shift - slope * base_seq_len)

    audio_scheduler = copy.deepcopy(scheduler)
    scheduler.set_timesteps(sigmas=sigmas, device=device, mu=mu)
    audio_scheduler.set_timesteps(sigmas=sigmas, device=device, mu=mu)
    timesteps = scheduler.timesteps

    video_coords = transformer.rope.prepare_video_coords(
        latents.shape[0], f_lat, h_lat, w_lat, device, fps
    )
    audio_coords = transformer.audio_rope.prepare_audio_coords(
        audio_latents.shape[0], audio_frames, device
    )

    logger.info(f"[LTX-2] Starting denoising ({steps} steps)...")

    # MPS workaround: monkey-patch torch.linspace to avoid float64 (MPS doesn't support it)
    _original_linspace = torch.linspace
    def _mps_safe_linspace(*args, **kwargs):
        if kwargs.get('device') is not None:
            dev = kwargs['device']
            if hasattr(dev, 'type') and dev.type == 'mps':
                if kwargs.get('dtype') == torch.float64:
                    kwargs['dtype'] = torch.float32
            elif isinstance(dev, str) and dev == 'mps':
                if kwargs.get('dtype') == torch.float64:
                    kwargs['dtype'] = torch.float32
        return _original_linspace(*args, **kwargs)

    if device.type == "mps":
        torch.linspace = _mps_safe_linspace

    try:
        for i, t in enumerate(timesteps):
            vid_in = torch.cat([latents] * 2) if do_cfg else latents
            aud_in = torch.cat([audio_latents] * 2) if do_cfg else audio_latents

            vid_in = vid_in.to(dtype)
            aud_in = aud_in.to(dtype)

            ts_vid = t.expand(vid_in.shape[0]).unsqueeze(-1) * (1 - conditioning_mask)
            ts_aud = t.expand(vid_in.shape[0])

            with transformer.cache_context("cond_uncond"):
                noise_v, noise_a = transformer(
                    hidden_states=vid_in,
                    audio_hidden_states=aud_in,
                    encoder_hidden_states=conn_embeds,
                    audio_encoder_hidden_states=conn_audio,
                    timestep=ts_vid,
                    audio_timestep=ts_aud,
                    encoder_attention_mask=conn_mask,
                    audio_encoder_attention_mask=conn_mask,
                    num_frames=f_lat,
                    height=h_lat,
                    width=w_lat,
                    fps=fps,
                    audio_num_frames=audio_frames,
                    video_coords=video_coords,
                    audio_coords=audio_coords,
                    return_dict=False,
                )

            noise_v, noise_a = noise_v.float(), noise_a.float()

            if do_cfg:
                v_u, v_t = noise_v.chunk(2)
                a_u, a_t = noise_a.chunk(2)
                noise_v = v_u + guidance * (v_t - v_u)
                noise_a = a_u + guidance * (a_t - a_u)

            v_unpacked = ltx2_unpack_latents(latents, f_lat, h_lat, w_lat, patch_size, patch_size_t)
            n_unpacked = ltx2_unpack_latents(noise_v, f_lat, h_lat, w_lat, patch_size, patch_size_t)

            pred_v = scheduler.step(
                n_unpacked[:, :, 1:], t, v_unpacked[:, :, 1:], return_dict=False
            )[0]

            v_unpacked = torch.cat([v_unpacked[:, :, :1], pred_v], dim=2)
            latents = ltx2_pack_latents(v_unpacked, patch_size, patch_size_t)

            audio_latents = audio_scheduler.step(
                noise_a, t, audio_latents, return_dict=False
            )[0]

            if gen_id and i % 5 == 0:
                genbus.progress(gen_id, "generating", i + 1, steps)
    finally:
        # Restore original torch.linspace
        if device.type == "mps":
            torch.linspace = _original_linspace

    if swap_state:
        swap_state.unload_all()
        for m in swap_state.non_block_modules:
            m.to("cpu")
    move_module_root_tensors(transformer, "cpu")

    latents = ltx2_unpack_latents(latents, f_lat, h_lat, w_lat, patch_size, patch_size_t)
    # Reshape mean/std for broadcasting with 5D latent tensor [B, C, F, H, W]
    latents_std = vae.latents_std.to(device).view(1, -1, 1, 1, 1)
    latents_mean = vae.latents_mean.to(device).view(1, -1, 1, 1, 1)
    latents = (latents * latents_std / vae.config.scaling_factor) + latents_mean

    # Audio latents: unflatten first from [B, L, C*M] to [B, L, C, M], then denormalize
    audio_latents = audio_latents.unflatten(2, (-1, latent_mel_bins))  # [B, L, C, M]
    # Reshape audio mean/std for broadcasting with [B, L, C, M]
    audio_latents_std = audio_vae.latents_std.to(device).view(1, 1, -1, 1)
    audio_latents_mean = audio_vae.latents_mean.to(device).view(1, 1, -1, 1)
    audio_latents = (audio_latents * audio_latents_std) + audio_latents_mean
    audio_latents = audio_latents.transpose(1, 2)  # [B, C, L, M]

    return latents, audio_latents


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
# WATERMARK
# =============================================================================

BONZAI_WM_PATH = Path(__file__).parent / "bonzai.png"


def _apply_watermark(image: Image.Image) -> Image.Image:
    try:
        wm = Image.open(BONZAI_WM_PATH).convert("RGBA").resize((64, 64))
        base = image.convert("RGBA")
        x, y = base.width - wm.width - 4, base.height - wm.height - 4
        base.alpha_composite(wm, (x, y))
        return base.convert("RGB")
    except Exception as e:
        logger.warning(f"Watermark failed: {e}")
        return image


def _apply_watermark_frames(frames: List[Image.Image]) -> List[Image.Image]:
    return [_apply_watermark(f) for f in frames]


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


def _wan_patterns() -> List[str]:
    return [
        "model_index.json", "scheduler/**", "tokenizer/**", "text_encoder/**",
        "transformer/**", "transformer_2/**", "vae/**",
        "**/*.json", "**/*.safetensors", "**/*.bin",
    ]


def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id in ("black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-Krea-dev"):
        return _flux_patterns()
    if repo_id in (SDXL_BASE_REPO, SDXL_REFINER_REPO):
        return _sdxl_patterns()
    if repo_id == Z_REPO:
        return ["model_index.json", "scheduler/**", "tokenizer/**", "text_encoder/**",
                "transformer/**", "vae/**", "**/*.safetensors", "**/*.json", "**/*.bin"]
    if repo_id == WAN_REPO:
        return _wan_patterns()
    if repo_id == CHATTERBOX_REPO:
        return ["**/*"]
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
    "Wan-AI/Wan2.2-I2V-A14B-Diffusers": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["text_encoder", "vae"],
        "extra_dirs": ["scheduler", "transformer", "transformer_2"],
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
        with offline_mode_if_complete("wan_video"):
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
    if url:
        headers = {}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        try:
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
            size = int(r.headers.get("content-length", "0") or "0")
            if size > 0:
                EXPECTED_SIZES[name] = size
                return size
        except Exception:
            pass
    return int(EXPECTED_SIZES.get(name, 0) or 0)


def _sf(name, url):
    return {"name": name, "url": url, "size": _expected_size(name, url)}


def _plan_for(pipeline: str) -> Dict[str, Any]:
    pipeline = pipeline.strip().lower()
    if pipeline == "flux_krea":
        return {"repos_to_fetch": [FLUX_KREA_REPO], "single_files": [_sf(FLUX_KREA_GGUF_NAME, FLUX_KREA_GGUF_URL)]}
    if pipeline == "flux_klein":
        return {"repos_to_fetch": [FLUX_KLEIN_REPO], "single_files": []}
    if pipeline == "wan_video":
        # WAN 2.2 with Q4 GGUF for memory efficiency (~9.65GB each)
        # Includes GGUF text encoder for additional memory savings on MPS
        return {
            "repos_to_fetch": [WAN_REPO],
            "single_files": [
                _sf(WAN22_GGUF_HIGH_NAME, WAN22_GGUF_HIGH_URL),
                _sf(WAN22_GGUF_LOW_NAME, WAN22_GGUF_LOW_URL),
                _sf(WAN_21_VAE_NAME, WAN_21_VAE_URL),
            ],
        }
    if pipeline == "ltx2_video":
        # LTX-2 (19B DiT) with quanto int8 quantization (cached after first run)
        # All components from repo subfolders, skip root safetensors files
        return {
            "repos_to_fetch": [LTX2_REPO],
            "single_files": [],
        }
    if pipeline == "sdxl":
        return {"repos_to_fetch": [SDXL_BASE_REPO, SDXL_REFINER_REPO], "single_files": []}
    if pipeline == "z_image_turbo":
        return {"repos_to_fetch": [Z_REPO], "single_files": [_sf(Z_GGUF_NAME, Z_GGUF_URL)]}
    if pipeline == "chatterbox":
        # Use the ONNX repo for inference (multilingual only)
        return {"repos_to_fetch": [CHATTERBOX_MULTILINGUAL_MODEL_ID], "single_files": []}
    raise ValueError(f"Unknown pipeline: {pipeline}")


# =============================================================================
# FILE STATUS & DOWNLOAD HELPERS
# =============================================================================

def _single_file_status(entry: Dict[str, Any]) -> Dict[str, Any]:
    name = (entry or {}).get("name") or ""
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
    lock = _gguf_lock(name)
    with lock:
        headers = {}
        if url.startswith("https://huggingface.co/") and _hf_token():
            headers["Authorization"] = f"Bearer {_hf_token()}"
        dest = MODEL_DIR / name
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        expected_size = _expected_size(name, url)
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
            raise ValueError(f"Downloaded {name} has size {dest.stat().st_size}, expected {expected_size}")
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
            # Check if values are in [-1, 1] range (Wan VAE output) or [0, 1] range
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
# IMAGE PREPROCESSING
# =============================================================================

def center_crop_to_aspect(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    w, h = img.size
    if w <= 0 or h <= 0:
        return img
    target_ar = float(target_w) / float(target_h)
    src_ar = float(w) / float(h)
    if abs(src_ar - target_ar) < 1e-6:
        return img
    if src_ar > target_ar:
        new_w = int(round(h * target_ar))
        left = (w - new_w) // 2
        box = (left, 0, left + new_w, h)
    else:
        new_h = int(round(w / target_ar))
        top = (h - new_h) // 2
        box = (0, top, w, top + new_h)
    return img.crop(box)


def _motionfix_preprocess(img: Image.Image, jpeg_q: int = 90, noise_std: float = 0.1) -> Image.Image:
    """Light preprocessing to help video models generate motion."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=max(10, min(95, int(jpeg_q))))
    buf.seek(0)
    comp = Image.open(buf).convert("RGB")
    arr = np.asarray(comp).astype(np.float32)
    if noise_std > 0:
        arr += np.random.normal(scale=float(noise_std), size=arr.shape)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def _ffmpeg_h264_roundtrip(
    img: Image.Image,
    target_w: int,
    target_h: int,
    crf: int = 10,
    downscale: float = 0.5,
) -> Image.Image:
    """H.264 encode/decode roundtrip to help video model motion."""
    ffmpeg = get_ffmpeg_binary_path()
    iw, ih = img.size
    dw = max(2, int(iw * downscale) // 2 * 2)
    dh = max(2, int(ih * downscale) // 2 * 2)
    tw = max(2, int(target_w) // 2 * 2)
    th = max(2, int(target_h) // 2 * 2)
    
    tmp_dir = Path(tempfile.mkdtemp())
    in_png = tmp_dir / "in.png"
    mid_mp4 = tmp_dir / "mid.mp4"
    out_png = tmp_dir / "out.png"
    
    try:
        img.convert("RGB").save(in_png, "PNG")
        subprocess.run([
            ffmpeg, "-y", "-i", str(in_png),
            "-vf", f"scale={dw}:{dh}:flags=bicubic",
            "-c:v", "libx264", "-crf", str(int(crf)),
            "-preset", "veryfast", "-tune", "stillimage",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(mid_mp4)
        ], check=True, capture_output=True)
        subprocess.run([
            ffmpeg, "-y", "-i", str(mid_mp4),
            "-vf", f"scale={tw}:{th}:flags=bicubic",
            "-frames:v", "1", str(out_png)
        ], check=True, capture_output=True)
        return Image.open(out_png).convert("RGB")
    except Exception as e:
        logger.warning(f"[ffmpeg_roundtrip] Falling back: {e}")
        return img.resize((tw, th), Image.LANCZOS)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _round_hw_for_vae(h: int, w: int, ratio: int = 8) -> Tuple[int, int]:
    return h - (h % ratio), w - (w % ratio)


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

        buf = BytesIO(); _apply_watermark(image).save(buf, format="PNG")
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
        _apply_watermark(image).save(buf, format="PNG")
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
        _apply_watermark(image).save(buf, format="PNG")
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
        DeviceManager.free_memory()


@app.route("/image/image/turbo", methods=["POST"])
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
        _apply_watermark(image).save(buf, format="PNG")
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
        DeviceManager.free_memory()


# =============================================================================
# REST API: IMAGE GENERATION - FLUX KREA
# =============================================================================

@app.route("/image/quality", methods=["POST"])
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
        _apply_watermark(image).save(buf, format="PNG")
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
    
    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if language not in CHATTERBOX_LANGUAGES:
        return jsonify({
            "error": f"Unsupported language '{language}'",
            "supported": list(CHATTERBOX_LANGUAGES.keys())
        }), 400
    
    gen_id = genbus.new("chatterbox_multilingual", {"endpoint": "/audio", "language": language})
    
    try:
        gc.collect()
        genbus.progress(gen_id, "loading", 0, 3)

        # Use offline mode if pipeline is fully downloaded
        with offline_mode_if_complete("chatterbox") as is_offline:
            model = ChatterboxONNX.from_pretrained(
                model_type="multilingual", device="cpu", cache_dir=str(MODEL_DIR / "hf"),
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
            # Use default voice
            from huggingface_hub import hf_hub_download
            audio_path = hf_hub_download(
                repo_id=CHATTERBOX_MULTILINGUAL_MODEL_ID,
                filename="default_voice.wav",
                cache_dir=str(MODEL_DIR / "hf")
            )

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
                "requires_voice_reference": False,  # Has default voice
            },
        },
        "note": "Uses ONNX for inference",
    }), 200
# =============================================================================
# REST API: WAN VIDEO
# =============================================================================

@app.route("/image/video/quality", methods=["POST"])
def wan_image_to_video():
    """
    Wan 2.2 I2V-A14B with MoE switching.

    Uses Q4 quantization (~9.65GB) for better quality than Q2_K,
    automatically scales resolution to fit available memory.
    """
    data = request.get_json(force=True) or {}
    
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip()
    H = int(data.get("height", 480))
    W = int(data.get("width", 832))
    frames_count = int(data.get("frames", 81))
    fps = int(data.get("fps", 16))
    steps = int(data.get("steps", 40))
    guidance = float(data.get("guidance_scale", 3.5))
    seed = data.get("seed")
    auto_dl = bool(data.get("auto_download", False))
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    
    # Options
    quantization = data.get("quantization", "auto")  # "auto", "q3", "q5"
    vae_decode_chunk_size = int(data.get("vae_decode_chunk_size", 1))
    # sequential_cfg: True = 2 forward passes/step (less memory), False = batched (faster)
    # Default: "auto" - choose based on available memory
    sequential_cfg_param = data.get("sequential_cfg", "auto")
    # skip_moe_switch: Skip switching between HighNoise/LowNoise models (faster but lower quality)
    # Default: "auto" - skip on MPS for speed, use on CUDA for quality
    skip_moe_switch_param = data.get("skip_moe_switch", "auto")
    # fast_mode: Pre-dequantize GGUF weights for faster MPS inference
    # Uses more memory (~14GB) but avoids repeated dequantization overhead
    # Default: "auto" - enable on MPS with >20GB available RAM
    fast_mode_param = data.get("fast_mode", "auto")
    
    _mps_clear_memory()
    
    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400
    
    guard = _ensure_files_present_or_start("wan_video", auto_download=auto_dl)
    if guard:
        return guard
    
    gen_id = genbus.new("wan22_i2v_a14b", {
        "endpoint": "/image/video/quality", "w": W, "h": H, "frames": frames_count,
    })
    
    # Wan VAE normalization constants (shared between Wan 2.1 and 2.2)
    WAN_LATENTS_MEAN = torch.tensor([
        -0.7571, -0.7089, -0.9113, 0.1075, -0.1745, 0.9653, -0.1517, 1.5508,
        0.4134, -0.0715, 0.5517, -0.3632, -0.1922, -0.9497, 0.2503, -0.2921
    ])
    WAN_LATENTS_STD = torch.tensor([
        2.8184, 1.4541, 2.3275, 2.6558, 1.2196, 1.7708, 2.6052, 2.0743,
        3.2687, 2.1526, 2.8652, 1.5579, 1.6382, 1.1253, 2.8251, 1.9160
    ])
    
    def get_system_memory_gb() -> float:
        """Get total system memory in GB."""
        try:
            import psutil
            return psutil.virtual_memory().total / (1024**3)
        except:
            return 16  # Conservative fallback
    
    def aggressive_cleanup():
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
            torch.mps.synchronize()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
    
    # Check if we should run in offline mode (all files present)
    _wan_offline = _is_pipeline_complete("wan_video")
    _wan_old_hf_offline = os.environ.get("HF_HUB_OFFLINE")
    _wan_old_transformers_offline = os.environ.get("TRANSFORMERS_OFFLINE")
    if _wan_offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        logger.info("[wan_video] Running in offline mode (all files present)")

    try:
        device = DeviceManager.get_device()
        aggressive_cleanup()

        if device.type == "mps":
            os.environ["DIFFUSERS_ATTENTION_BACKEND"] = "eager"
            # MPS optimization: suggest memory limit to avoid fragmentation
            try:
                # Allow MPS to use most of unified memory
                torch.mps.set_per_process_memory_fraction(0.9)
            except Exception:
                pass  # Older PyTorch versions don't have this

        # Dtype configuration for Wan video on different devices:
        # - CUDA: bfloat16 for everything (fast, accurate)
        # - MPS: float16 for GGUF transformer (GGUF has issues with float32 dequant),
        #        float32 for scheduler/latent operations (precision)
        if device.type == "cuda":
            compute_dtype = torch.bfloat16
            gguf_compute_dtype = torch.bfloat16
            storage_dtype = torch.float16
        elif device.type == "mps":
            # MPS: Use float16 for GGUF (works better than float32 for quantized weights)
            # but float32 for scheduler operations to avoid precision loss
            compute_dtype = torch.float32  # For scheduler, latents
            gguf_compute_dtype = torch.float16  # For transformer forward passes
            storage_dtype = torch.float32
        else:
            compute_dtype = torch.float32
            gguf_compute_dtype = torch.float32
            storage_dtype = torch.float32
        
        total_ram_gb = get_system_memory_gb()
        logger.info(f"[Wan] Device: {device.type}, System RAM: {total_ram_gb:.0f}GB")
        
        # ============================================================
        # MEMORY-BASED CONFIGURATION
        # ============================================================
        # Q4: ~9.65GB model, better quality than Q2_K
        # ============================================================

        # Use Q4 quantization (better quality than Q2_K, ~9.65GB each)
        gguf_high_name = WAN22_GGUF_HIGH_NAME
        gguf_low_name = WAN22_GGUF_LOW_NAME
        model_overhead_gb = 12  # ~9.65GB model + overhead

        gguf_high_path = MODEL_DIR / gguf_high_name
        gguf_low_path = MODEL_DIR / gguf_low_name

        logger.info(f"[Wan] Using Q4 quantization (~9.65GB per model)")

        genbus.progress(gen_id, "loading", 0, 3)

        # Load image
        if image_url:
            pil_image = load_image(image_url).convert("RGB")
        else:
            pil_image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
        
        # Normalize dimensions
        mod = 32
        H = max(mod, (H // mod) * mod)
        W = max(mod, (W // mod) * mod)
        frames_count = ((frames_count - 1) // 4) * 4 + 1
        
        # Calculate memory budget and scale if needed
        if device.type == "mps":
            # MPS unified memory is shared with OS, need larger overhead
            # Components: transformer ~9.65GB, text encoder ~5.2GB (GGUF), VAE ~1GB, CLIP ~1GB
            # Plus activations, gradients, and OS pressure
            mps_overhead_gb = 16  # Conservative estimate for all components
            available_gb = total_ram_gb - mps_overhead_gb - 6  # 6GB OS headroom
            # Empirical: MPS needs ~1GB per 1000 tokens due to memory fragmentation
            max_tokens = int(available_gb * 1000)
            max_tokens = max(5000, min(max_tokens, 20000))  # Cap at 20k tokens for MPS
        elif device.type == "cuda":
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            available_gb = vram_gb - model_overhead_gb
            max_tokens = int(available_gb * 3000)  # CUDA more efficient
            max_tokens = max(10000, min(max_tokens, 150000))
        else:
            max_tokens = 10000
        
        # Calculate current token count
        latent_t = (frames_count - 1) // 4 + 1
        latent_h = H // 8
        latent_w = W // 8
        token_count = latent_t * latent_h * latent_w
        
        logger.info(f"[Wan] Requested: {frames_count} frames @ {W}x{H} = {token_count} tokens")
        logger.info(f"[Wan] Memory budget: {available_gb:.1f}GB available -> max {max_tokens} tokens")

        # Determine sequential_cfg based on available memory
        # Batched CFG (sequential_cfg=False) is ~2x faster but uses ~2x memory for activations
        if sequential_cfg_param == "auto":
            # Use batched CFG if we have enough headroom
            # MPS: unified memory is more flexible, lower threshold
            # CUDA: dedicated VRAM, need more headroom
            if device.type == "cuda" and available_gb > 10:
                sequential_cfg = False
                logger.info("[Wan] Using batched CFG (faster, enough VRAM)")
            elif device.type == "mps":
                # MPS: Always use sequential CFG due to unified memory pressure
                # Batched CFG doubles activation memory and causes OOM on most systems
                sequential_cfg = True
                logger.info("[Wan] Using sequential CFG (memory-safe for MPS)")
            else:
                sequential_cfg = True
                logger.info("[Wan] Using sequential CFG (memory-efficient)")
        else:
            sequential_cfg = bool(sequential_cfg_param)
        
        # Scale down if needed - prioritize keeping frame count for duration
        if token_count > max_tokens:
            # Calculate required scale factor
            scale_needed = max_tokens / token_count
            
            # Reduce spatial resolution to fit, keep temporal (frames)
            spatial_scale = scale_needed ** 0.5
            new_H = max(mod, int(H * spatial_scale) // mod * mod)
            new_W = max(mod, int(W * spatial_scale) // mod * mod)
            
            # Ensure minimum resolution
            new_H = max(256, new_H)
            new_W = max(256, new_W)
            
            new_latent_h = new_H // 8
            new_latent_w = new_W // 8
            new_tokens = latent_t * new_latent_h * new_latent_w
            
            # If still too high, also reduce frames
            if new_tokens > max_tokens:
                frame_scale = max_tokens / new_tokens
                new_frames = max(17, int(frames_count * frame_scale))
                new_frames = ((new_frames - 1) // 4) * 4 + 1
                new_latent_t = (new_frames - 1) // 4 + 1
                new_tokens = new_latent_t * new_latent_h * new_latent_w
                frames_count = new_frames
            
            H, W = new_H, new_W
            latent_t = (frames_count - 1) // 4 + 1
            latent_h = H // 8
            latent_w = W // 8
            token_count = latent_t * latent_h * latent_w
            
            logger.warning(f"[Wan] Scaled to {frames_count} frames @ {W}x{H} = {token_count} tokens")
        
        pil_image = pil_image.resize((W, H), Image.LANCZOS)
        
        if not negative_prompt:
            negative_prompt = "blurry, low quality, distorted, deformed"
        
        base_path = repo_local_dir(WAN_REPO)
        vae_path = MODEL_DIR / WAN_21_VAE_NAME
        
        video_duration = frames_count / fps
        logger.info(f"[Wan] Target: {frames_count} frames @ {fps}fps = {video_duration:.1f}s")
        
        # ============================================================
        # PHASE 1: TEXT ENCODING
        # ============================================================
        aggressive_cleanup()

        logger.info("[Wan] Loading text encoder...")
        tokenizer = AutoTokenizer.from_pretrained(base_path, subfolder="tokenizer", local_files_only=_wan_offline)

        # On MPS, run text encoding on CPU to save GPU memory (~20GB text encoder)
        # This is slower but allows video generation to fit in memory
        text_encode_device = "cpu" if device.type == "mps" else device
        text_encode_dtype = torch.float32 if device.type == "mps" else compute_dtype

        if device.type == "mps":
            logger.info("[Wan] Using CPU for text encoding to save MPS memory")

        text_encoder = UMT5EncoderModel.from_pretrained(
            base_path, subfolder="text_encoder", torch_dtype=text_encode_dtype,
            local_files_only=_wan_offline, low_cpu_mem_usage=True,
        ).to(text_encode_device)
        text_encoder.eval()

        max_seq_len = 512
        with torch.no_grad():
            pos_ids = tokenizer(prompt, padding="max_length", max_length=max_seq_len, truncation=True, return_tensors="pt").input_ids.to(text_encode_device)
            prompt_embeds = text_encoder(pos_ids)[0].to("cpu", dtype=storage_dtype)
            neg_ids = tokenizer(negative_prompt, padding="max_length", max_length=max_seq_len, truncation=True, return_tensors="pt").input_ids.to(text_encode_device)
            negative_embeds = text_encoder(neg_ids)[0].to("cpu", dtype=storage_dtype)

        del pos_ids, neg_ids, tokenizer, text_encoder
        aggressive_cleanup()
        
        # ============================================================
        # PHASE 2: CLIP ENCODING (if needed)
        # ============================================================
        
        config_path = base_path / "transformer" / "config.json"
        with open(config_path, 'r') as f:
            transformer_config = json.load(f)
        
        image_embeds = None
        if transformer_config.get('image_dim') is not None:
            aggressive_cleanup()
            clip_processor = CLIPImageProcessor.from_pretrained(base_path, subfolder="image_processor", local_files_only=_wan_offline)
            clip_encoder = CLIPVisionModel.from_pretrained(
                base_path, subfolder="image_encoder", torch_dtype=torch.float32,
                local_files_only=_wan_offline, low_cpu_mem_usage=True,
            ).to(device)
            clip_encoder.eval()
            
            with torch.no_grad():
                clip_inputs = clip_processor(images=pil_image, return_tensors="pt")
                clip_inputs = {k: v.to(device) for k, v in clip_inputs.items()}
                image_embeds = clip_encoder(**clip_inputs, output_hidden_states=True).hidden_states[-2]
                image_embeds = image_embeds.to("cpu", dtype=storage_dtype)
            
            del clip_inputs, clip_processor
            clip_encoder.to("cpu")
            del clip_encoder
            aggressive_cleanup()
        
        # ============================================================
        # PHASE 3: VAE ENCODING
        # ============================================================
        aggressive_cleanup()
        
        logger.info("[Wan] Loading VAE...")
        vae = AutoencoderKLWan.from_single_file(str(vae_path), torch_dtype=torch.float32)
        vae.to(device)
        vae.eval()
        if hasattr(vae, "enable_tiling"):
            vae.enable_tiling()
        if hasattr(vae, "enable_slicing"):
            vae.enable_slicing()
        
        # Prepare tensors
        img_np = np.array(pil_image).astype(np.float32) / 255.0
        img_np = (img_np - 0.5) / 0.5
        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).unsqueeze(2)
        del pil_image, img_np
        
        # Encode first frame
        logger.info("[Wan] Encoding conditioning frames...")
        first_frame = img_tensor.to(device, dtype=torch.float32)
        del img_tensor
        
        with torch.no_grad():
            first_latent = vae.encode(first_frame).latent_dist.mode()
        del first_frame
        aggressive_cleanup()
        
        _, latent_c, _, latent_h, latent_w = first_latent.shape
        
        # Encode black frame (proper I2V conditioning)
        black_frame = torch.full((1, 3, 1, H, W), -1.0, dtype=torch.float32, device=device)
        with torch.no_grad():
            black_latent = vae.encode(black_frame).latent_dist.mode()
        del black_frame
        aggressive_cleanup()
        
        # Build condition on CPU
        first_cpu = first_latent.to("cpu", dtype=torch.float32)
        black_cpu = black_latent.to("cpu", dtype=torch.float32)
        del first_latent, black_latent
        
        latent_condition = torch.zeros(1, latent_c, latent_t, latent_h, latent_w, dtype=torch.float32)
        latent_condition[:, :, 0:1, :, :] = first_cpu
        for t in range(1, latent_t):
            latent_condition[:, :, t:t+1, :, :] = black_cpu
        del first_cpu, black_cpu
        
        # Normalize
        latents_mean = WAN_LATENTS_MEAN.view(1, -1, 1, 1, 1)
        latents_std = WAN_LATENTS_STD.view(1, -1, 1, 1, 1)
        latent_condition = (latent_condition - latents_mean) / latents_std
        
        # Create mask and combine
        mask = torch.zeros(1, 4, latent_t, latent_h, latent_w, dtype=torch.float32)
        mask[:, :, 0, :, :] = 1.0
        condition = torch.cat([mask, latent_condition], dim=1).to(dtype=storage_dtype)
        del mask, latent_condition, latents_mean, latents_std
        
        # Unload VAE
        vae.to("cpu")
        del vae
        aggressive_cleanup()
        
        logger.info(f"[Wan] Condition: {latent_t}x{latent_h}x{latent_w} = {token_count} tokens")
        
        # ============================================================
        # PHASE 4: TRANSFORMER DENOISING
        # ============================================================
        genbus.progress(gen_id, "generating", 1, 3)
        aggressive_cleanup()
        
        logger.info(f"[Wan] Loading transformer ({gguf_high_name})...")
        
        config_high_path = base_path / "transformer" / "config.json"
        config_low_path = base_path / "transformer_2" / "config.json"
        if not config_low_path.exists():
            config_low_path = config_high_path
        
        scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
            base_path, subfolder="scheduler", local_files_only=_wan_offline, shift=8.0,
        )
        scheduler.set_timesteps(steps, device=device)
        timesteps = scheduler.timesteps
        
        # Determine if we should skip MoE switching
        # Skipping saves ~10-15 seconds of model loading/unloading but reduces quality slightly
        if skip_moe_switch_param == "auto":
            # Skip MoE on MPS for speed (loading 5GB model mid-generation is slow)
            # Keep MoE on CUDA where loading is faster
            skip_moe_switch = device.type == "mps"
            if skip_moe_switch:
                logger.info("[Wan] Skipping MoE switch for faster MPS inference")
        else:
            skip_moe_switch = bool(skip_moe_switch_param)

        # Find MoE switch point (disabled if skip_moe_switch is True)
        moe_switch_idx = len(timesteps)  # Default: never switch
        if not skip_moe_switch:
            for idx, t in enumerate(timesteps):
                t_norm = t.item() / 1000.0 if t.item() > 1.0 else t.item()
                if t_norm < 0.875:
                    moe_switch_idx = idx
                    break
            logger.info(f"[Wan] MoE switch at step {moe_switch_idx}/{len(timesteps)}")
        
        # Initialize latents
        generator = torch.Generator(device=device).manual_seed(seed) if isinstance(seed, int) else None
        latents = torch.randn(
            (1, 16, latent_t, latent_h, latent_w),
            generator=generator, device=device, dtype=compute_dtype
        ) * getattr(scheduler, 'init_noise_sigma', 1.0)
        
        do_cfg = guidance > 1.0
        
        def dequantize_gguf_model(model):
            """
            Pre-dequantize GGUF weights for faster inference.
            Uses more memory (~14GB for transformer) but avoids repeated dequantization.
            """
            try:
                from diffusers.quantizers.gguf.utils import GGUFLinear
                dequantized_count = 0
                for name, module in model.named_modules():
                    if isinstance(module, GGUFLinear):
                        # Get dequantized weights
                        with torch.no_grad():
                            weight = module.weight_packed * module.weight_scale
                            if hasattr(module, 'bias') and module.bias is not None:
                                bias = module.bias.clone()
                            else:
                                bias = None

                        # Create regular Linear layer
                        new_linear = torch.nn.Linear(
                            weight.shape[1], weight.shape[0],
                            bias=bias is not None,
                            device=weight.device,
                            dtype=weight.dtype
                        )
                        new_linear.weight.data = weight
                        if bias is not None:
                            new_linear.bias.data = bias

                        # Replace the module
                        parent_name = '.'.join(name.split('.')[:-1])
                        child_name = name.split('.')[-1]
                        if parent_name:
                            parent = model.get_submodule(parent_name)
                            setattr(parent, child_name, new_linear)
                        else:
                            setattr(model, child_name, new_linear)
                        dequantized_count += 1

                logger.info(f"[Wan] Pre-dequantized {dequantized_count} GGUF layers")
                aggressive_cleanup()
                return model, True  # Return success flag
            except Exception as e:
                logger.warning(f"[Wan] Pre-dequantization failed: {e}, using GGUF mode")
                return model, False  # Return failure flag

        def load_transformer(path, config, use_compile=False, pre_dequantize=False):
            aggressive_cleanup()
            # Use gguf_compute_dtype for transformer (float16 on MPS works better with GGUF)
            t = WanTransformer3DModel.from_single_file(
                str(path), config=str(config),
                quantization_config=GGUFQuantizationConfig(compute_dtype=gguf_compute_dtype),
                torch_dtype=gguf_compute_dtype,
            )
            t.to(device)
            t.eval()

            # Pre-dequantize GGUF weights for faster inference on MPS
            # Uses more memory (~14GB) but avoids repeated dequantization overhead
            if pre_dequantize and device.type == "mps":
                t, success = dequantize_gguf_model(t)
                if success:
                    logger.info("[Wan] Transformer weights pre-dequantized for fast MPS inference")

            # torch.compile for significant speedup on CUDA (20-50% faster)
            # MPS doesn't benefit as much from compile
            if use_compile and device.type == "cuda":
                try:
                    t = torch.compile(t, mode="reduce-overhead")
                    logger.info("[Wan] Transformer compiled with torch.compile")
                except Exception as e:
                    logger.warning(f"[Wan] torch.compile failed, using eager mode: {e}")

            return t

        # Use compile for CUDA, skip for MPS (less benefit, potential issues)
        use_compile = device.type == "cuda"

        # Determine fast_mode (pre-dequantize GGUF for faster inference)
        # DISABLED on MPS: GGUFLinear API changed, pre-dequantization fails
        # Pre-dequantized model uses ~14GB vs ~9.65GB for Q4 GGUF
        if fast_mode_param == "auto":
            # Only enable on CUDA with enough VRAM (MPS: disabled due to API changes)
            pre_dequantize = device.type == "cuda" and available_gb > 14
            if pre_dequantize:
                logger.info("[Wan] Fast mode enabled: pre-dequantizing GGUF for faster inference")
        else:
            pre_dequantize = bool(fast_mode_param) and device.type != "mps"

        transformer = load_transformer(gguf_high_path, config_high_path,
                                       use_compile=use_compile, pre_dequantize=pre_dequantize)

        logger.info(f"[Wan] Denoising {steps} steps on {device.type}...")

        for i, t in enumerate(timesteps):
            # Progress update
            genbus.progress(gen_id, "denoising", i, steps)

            if i == moe_switch_idx and moe_switch_idx < len(timesteps):
                logger.info(f"[Wan] Step {i}/{steps}: Switching to LowNoise model")
                transformer.to("cpu")
                del transformer
                aggressive_cleanup()
                transformer = load_transformer(gguf_low_path, config_low_path,
                                               use_compile=use_compile, pre_dequantize=pre_dequantize)

            # Convert to gguf_compute_dtype for transformer (float16 on MPS)
            cond_gpu = condition.to(device, dtype=gguf_compute_dtype)
            latents_for_transformer = latents.to(dtype=gguf_compute_dtype)
            latent_input = torch.cat([latents_for_transformer, cond_gpu], dim=1)
            del cond_gpu, latents_for_transformer

            if do_cfg and sequential_cfg:
                # Sequential CFG: 2 forward passes per step (memory-efficient)
                ts = t.expand(1)

                neg_gpu = negative_embeds.to(device, dtype=gguf_compute_dtype)
                img_gpu = image_embeds.to(device, dtype=gguf_compute_dtype) if image_embeds is not None else None
                with torch.no_grad():
                    noise_uncond = transformer(hidden_states=latent_input, timestep=ts,
                        encoder_hidden_states=neg_gpu, encoder_hidden_states_image=img_gpu, return_dict=False)[0]
                del neg_gpu, img_gpu

                pos_gpu = prompt_embeds.to(device, dtype=gguf_compute_dtype)
                img_gpu = image_embeds.to(device, dtype=gguf_compute_dtype) if image_embeds is not None else None
                with torch.no_grad():
                    noise_cond = transformer(hidden_states=latent_input, timestep=ts,
                        encoder_hidden_states=pos_gpu, encoder_hidden_states_image=img_gpu, return_dict=False)[0]
                del pos_gpu, img_gpu

                noise_pred = noise_uncond + guidance * (noise_cond - noise_uncond)
                del noise_uncond, noise_cond
            elif do_cfg:
                # Batched CFG: 1 forward pass with batch=2 (faster, uses more memory)
                ts = t.expand(2)
                latent_input_batch = torch.cat([latent_input, latent_input], dim=0)
                del latent_input

                neg_gpu = negative_embeds.to(device, dtype=gguf_compute_dtype)
                pos_gpu = prompt_embeds.to(device, dtype=gguf_compute_dtype)
                embeds_batch = torch.cat([neg_gpu, pos_gpu], dim=0)
                del neg_gpu, pos_gpu

                img_gpu = None
                if image_embeds is not None:
                    img_gpu = image_embeds.to(device, dtype=gguf_compute_dtype)
                    img_gpu = torch.cat([img_gpu, img_gpu], dim=0)

                with torch.no_grad():
                    noise_batch = transformer(hidden_states=latent_input_batch, timestep=ts,
                        encoder_hidden_states=embeds_batch, encoder_hidden_states_image=img_gpu, return_dict=False)[0]
                del latent_input_batch, embeds_batch, img_gpu

                noise_uncond, noise_cond = noise_batch.chunk(2, dim=0)
                del noise_batch
                noise_pred = noise_uncond + guidance * (noise_cond - noise_uncond)
                del noise_uncond, noise_cond
                latent_input = None  # Already deleted above
            else:
                # No CFG: single forward pass
                pos_gpu = prompt_embeds.to(device, dtype=gguf_compute_dtype)
                img_gpu = image_embeds.to(device, dtype=gguf_compute_dtype) if image_embeds is not None else None
                ts = t.expand(1)
                with torch.no_grad():
                    noise_pred = transformer(hidden_states=latent_input, timestep=ts,
                        encoder_hidden_states=pos_gpu, encoder_hidden_states_image=img_gpu, return_dict=False)[0]
                del pos_gpu, img_gpu

            if latent_input is not None:
                del latent_input
            # Convert noise_pred back to compute_dtype for scheduler precision
            noise_pred = noise_pred.to(dtype=compute_dtype)
            latents = scheduler.step(noise_pred, t, latents, return_dict=False)[0]
            del noise_pred
        
        final_latents = latents.to("cpu", dtype=storage_dtype)
        del latents
        transformer.to("cpu")
        del transformer, prompt_embeds, negative_embeds, condition
        if image_embeds is not None:
            del image_embeds
        aggressive_cleanup()
        
        # ============================================================
        # PHASE 5: VAE DECODING
        # ============================================================
        aggressive_cleanup()
        
        logger.info("[Wan] Decoding video...")
        vae = AutoencoderKLWan.from_single_file(str(vae_path), torch_dtype=torch.float32)
        vae.to(device)
        vae.eval()
        # Disable tiling - it can cause hexagonal artifacts on MPS
        # if hasattr(vae, "enable_tiling"):
        #     vae.enable_tiling()
        
        latents = final_latents.to(device, dtype=torch.float32)
        del final_latents
        
        latents_mean = WAN_LATENTS_MEAN.view(1, -1, 1, 1, 1).to(device, torch.float32)
        latents_std = WAN_LATENTS_STD.view(1, -1, 1, 1, 1).to(device, torch.float32)
        latents = latents * latents_std + latents_mean
        del latents_mean, latents_std
        
        # Chunked decode
        video_chunks = []
        for i in range(0, latent_t, vae_decode_chunk_size):
            end = min(i + vae_decode_chunk_size, latent_t)
            chunk = latents[:, :, i:end, :, :]
            with torch.no_grad():
                decoded = vae.decode(chunk, return_dict=False)[0]
            decoded = decoded.squeeze(0).permute(1, 2, 3, 0).cpu().float().numpy()
            decoded = ((decoded + 1.0) / 2.0).clip(0, 1)
            video_chunks.append((decoded * 255).astype(np.uint8))
            del chunk, decoded
            aggressive_cleanup()
        
        del latents
        video = np.concatenate(video_chunks, axis=0)
        del video_chunks
        
        frames = [Image.fromarray(f) for f in video]
        del video
        
        vae.to("cpu")
        del vae
        aggressive_cleanup()
        
        logger.info(f"[Wan] Decoded {len(frames)} frames")
        
        # ============================================================
        # PHASE 6: VIDEO ENCODING
        # ============================================================
        genbus.progress(gen_id, "finalizing", 2, 3)
        
        out_path = str(FILES_DIR / f"wan22_{int(time.time())}.mp4")
        
        write_video(
            out_path, frames,
            source_fps=fps,
            target_fps=24,
            target_size=(W, H),
            crf=18,
            preset="slow",
            interpolate=True,
            add_grain=0.1,
            sharpen=0.2,
            gen_id=gen_id,
        )
        
        duration = len(frames) / fps
        del frames
        aggressive_cleanup()
        
        genbus.progress(gen_id, "complete", 3, 3)
        genbus.finish(gen_id, {"video_path": out_path})

        logger.info(f"[Wan] Complete: {out_path} ({duration:.1f}s @ {W}x{H})")
        
        return jsonify(_json_sanitize({
            "status": "success",
            "video_path": out_path,
            "frames": len(frames) if 'frames' in dir() else int(duration * fps),
            "duration_seconds": round(duration, 2),
            "resolution": f"{W}x{H}",
            "quantization": "Q4",
            "generation_websocket_url": generation_url(),
        }))
    
    except Exception as e:
        logger.exception("Wan I2V failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        # Restore offline mode environment variables
        if _wan_old_hf_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = _wan_old_hf_offline
        if _wan_old_transformers_offline is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = _wan_old_transformers_offline
        aggressive_cleanup()


# =============================================================================
# REST API: LTX-2 VIDEO (TURBO)
# =============================================================================

@app.route("/image/video/turbo", methods=["POST"])
def ltx2_image_to_video():
    """
    LTX-2 (19B DiT) Image-to-Video using optimum-quanto int8 quantization.

    Fast turbo mode for image-to-video generation with synchronized audio.
    Uses optimum-quanto int8 quantization with group swap hooks for memory efficiency.
    Caches quantized models for faster subsequent loads.
    """
    if not QUANTO_AVAILABLE:
        return jsonify({"error": "optimum-quanto not installed. Run: pip install optimum-quanto"}), 500

    data = request.get_json(force=True) or {}

    prompt = (data.get("prompt") or "").strip()
    negative_prompt = (data.get("negative_prompt") or "").strip() or "worst quality, inconsistent motion, blurry, jittery, distorted"
    H = int(data.get("height", 512))
    W = int(data.get("width", 768))
    frames_count = int(data.get("frames", 121))  # LTX-2 frames must be 8n+1
    frame_rate = float(data.get("frame_rate", 24.0))
    steps = int(data.get("steps", 40))  # LTX-2 default is 40 steps
    guidance = float(data.get("guidance_scale", 4.0))
    seed = data.get("seed")
    auto_dl = bool(data.get("auto_download", False))
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    include_audio = bool(data.get("include_audio", True))  # LTX-2 can generate audio

    _mps_clear_memory()

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    guard = _ensure_files_present_or_start("ltx2_video", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("ltx2_i2v", {
        "endpoint": "/image/video/turbo", "w": W, "h": H, "frames": frames_count,
    })

    # Check if we should run in offline mode (all files present)
    _ltx_offline = _is_pipeline_complete("ltx2_video")
    _ltx_old_hf_offline = os.environ.get("HF_HUB_OFFLINE")
    _ltx_old_transformers_offline = os.environ.get("TRANSFORMERS_OFFLINE")
    if _ltx_offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        logger.info("[LTX-2] Running in offline mode (all files present)")

    # Track components for cleanup
    text_encoder = None
    tokenizer = None
    transformer = None
    video_vae = None
    audio_vae = None
    connectors = None
    vocoder = None
    scheduler = None
    swap_state = None

    try:
        device = DeviceManager.get_device()
        quanto_gc()

        if device.type == "mps":
            os.environ["DIFFUSERS_ATTENTION_BACKEND"] = "eager"

        # Select dtype based on device
        # CUDA: bfloat16 is optimal
        # MPS: float16 for models, float32 for scheduler
        # CPU: float32 for everything
        if device.type == "cuda":
            model_dtype = torch.bfloat16
            scheduler_dtype = torch.bfloat16
            group_size = 8
        elif device.type == "mps":
            model_dtype = torch.float16
            scheduler_dtype = torch.float32
            group_size = 4
        else:
            model_dtype = torch.float32
            scheduler_dtype = torch.float32
            group_size = 2

        genbus.progress(gen_id, "loading_image", 0, 7)

        # Load source image
        if image_url:
            pil_image = load_image(image_url).convert("RGB")
        else:
            pil_image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")

        # Normalize dimensions (LTX-2 requires width/height divisible by 32, frames = 8n+1)
        mod = 32
        H = max(mod, (H // mod) * mod)
        W = max(mod, (W // mod) * mod)
        frames_count = ((frames_count - 1) // 8) * 8 + 1

        # Resize image to target dimensions
        pil_image = pil_image.resize((W, H), Image.LANCZOS)

        logger.info(f"[LTX-2] Generating {frames_count} frames @ {W}x{H}, {steps} steps")

        # Use local repo path and offline mode once downloaded
        ltx2_local = str(repo_local_dir(LTX2_REPO))

        with offline_mode_if_complete("ltx2_video") as is_offline:
            # -------------------------------------------------------------------------
            # Step 1: Load and quantize text encoder (Gemma)
            # -------------------------------------------------------------------------
            genbus.progress(gen_id, "loading_text_encoder", 1, 7)

            def build_text_encoder():
                logger.info("[LTX-2] Loading Gemma text encoder...")
                enc = Gemma3ForConditionalGeneration.from_pretrained(
                    ltx2_local,
                    subfolder="text_encoder",
                    torch_dtype=model_dtype,
                    local_files_only=is_offline,
                )
                return enc

            text_encoder = load_or_build_quantized(
                LTX2_QUANTO_CACHE_DIR / "text_encoder_int8.safetensors",
                build_text_encoder,
                "text_encoder",
            )

            # Load tokenizer
            tokenizer = GemmaTokenizer.from_pretrained(ltx2_local, subfolder="tokenizer", local_files_only=is_offline)

            # Move text encoder to device for encoding
            # On MPS/CPU with limited memory, keep on CPU
            text_device = device if device.type == "cuda" else torch.device("cpu")
            text_encoder = text_encoder.to(text_device)

            # Get prompt embeddings
            genbus.progress(gen_id, "encoding_text", 2, 7)
            logger.info("[LTX-2] Encoding prompts...")

            prompt_embeds, prompt_mask = get_gemma_embeds(prompt, tokenizer, text_encoder, text_device, model_dtype)
            neg_embeds, neg_mask = get_gemma_embeds(negative_prompt, tokenizer, text_encoder, text_device, model_dtype)

            # Free text encoder memory (saves ~20GB)
            del text_encoder, tokenizer
            text_encoder = None
            tokenizer = None
            quanto_gc()

            # -------------------------------------------------------------------------
            # Step 2: Load and quantize transformer
            # -------------------------------------------------------------------------
            genbus.progress(gen_id, "loading_transformer", 3, 7)

            def build_transformer():
                logger.info("[LTX-2] Loading transformer...")
                tfm = LTX2VideoTransformer3DModel.from_pretrained(
                    ltx2_local,
                    subfolder="transformer",
                    torch_dtype=model_dtype,
                    local_files_only=is_offline,
                )
                return tfm

            transformer = load_or_build_quantized(
                LTX2_QUANTO_CACHE_DIR / "transformer_int8.safetensors",
                build_transformer,
                "transformer",
            )
            transformer.eval()

            # Attach group swap hooks for memory-efficient inference
            logger.info(f"[LTX-2] Attaching group swap hooks (group_size={group_size})")
            swap_state = attach_group_swap_hooks(transformer, group_size, device, keep_non_block_on_gpu=True)

            # -------------------------------------------------------------------------
            # Step 3: Load VAEs and other components
            # -------------------------------------------------------------------------
            genbus.progress(gen_id, "loading_vaes", 4, 7)

            # Load video VAE from repo subfolder
            video_vae = AutoencoderKLLTX2Video.from_pretrained(
                ltx2_local,
                subfolder="vae",
                torch_dtype=model_dtype,
                local_files_only=is_offline,
            )
            logger.info("[LTX-2] Loaded video VAE from repo")
            video_vae.eval()
            if hasattr(video_vae, "enable_tiling"):
                video_vae.enable_tiling()

            # Load audio VAE from repo subfolder
            audio_vae = AutoencoderKLLTX2Audio.from_pretrained(
                ltx2_local,
                subfolder="audio_vae",
                torch_dtype=model_dtype,
                local_files_only=is_offline,
            )
            logger.info("[LTX-2] Loaded audio VAE from repo")
            audio_vae.eval()

            # Load connectors
            connectors = LTX2TextConnectors.from_pretrained(
                ltx2_local,
                subfolder="connectors",
                torch_dtype=model_dtype,
                local_files_only=is_offline,
            )
            connectors.eval()
            connectors = connectors.to(device)

            # Load vocoder for audio decoding
            vocoder = LTX2Vocoder.from_pretrained(
                ltx2_local,
                subfolder="vocoder",
                torch_dtype=model_dtype,
                local_files_only=is_offline,
            )
            vocoder.eval()
            vocoder_sample_rate = vocoder.config.output_sampling_rate if hasattr(vocoder.config, 'output_sampling_rate') else 24000

            # Load scheduler
            scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
                ltx2_local,
                subfolder="scheduler",
                local_files_only=is_offline,
            )

            # Move VAEs to device
            video_vae = video_vae.to(device)
            audio_vae = audio_vae.to(device)
            vocoder = vocoder.to(device)

        # Set seed
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cpu").manual_seed(int(seed))

        # -------------------------------------------------------------------------
        # Step 4: Run custom denoising loop (image encoding happens inside)
        # -------------------------------------------------------------------------
        genbus.progress(gen_id, "denoising", 0, steps)

        logger.info(f"[LTX-2] Denoising {steps} steps on {device.type}...")

        video_latents, audio_latents = ltx2_denoise(
            image=pil_image,
            prompt_embeds=prompt_embeds,
            prompt_mask=prompt_mask,
            neg_embeds=neg_embeds,
            neg_mask=neg_mask,
            scheduler=scheduler,
            vae=video_vae,
            audio_vae=audio_vae,
            connectors=connectors,
            transformer=transformer,
            num_frames=frames_count,
            fps=frame_rate,
            height=H,
            width=W,
            steps=steps,
            guidance=guidance,
            device=device,
            dtype=model_dtype,
            generator=generator,
            swap_state=swap_state,
            gen_id=gen_id,
        )

        # -------------------------------------------------------------------------
        # Step 6: Decode latents to video and audio
        # -------------------------------------------------------------------------
        genbus.progress(gen_id, "decoding", 6, 7)

        # Move transformer off GPU to free memory for VAE decoding
        if swap_state:
            for blk in swap_state.blocks:
                blk.to("cpu")
        transformer.to("cpu")
        quanto_gc()

        # Decode video latents
        logger.info("[LTX-2] Decoding video latents...")
        video_latents = video_latents / video_vae.config.scaling_factor
        with torch.no_grad():
            video_frames = video_vae.decode(video_latents).sample
        video_frames = video_processor.postprocess_video(video_frames, output_type="np")[0]

        # Decode audio latents if requested
        audio_output = None
        if include_audio and audio_latents is not None:
            logger.info("[LTX-2] Decoding audio latents...")
            audio_latents = audio_latents / audio_vae.config.scaling_factor
            with torch.no_grad():
                audio_decoded = audio_vae.decode(audio_latents).sample
                audio_output = vocoder(audio_decoded)
            # audio_output shape: (batch, samples) - take first batch
            if audio_output is not None:
                audio_output = audio_output[0].cpu().float().numpy()

        # Cleanup
        del video_latents, audio_latents, transformer, video_vae, audio_vae, vocoder, connectors
        quanto_gc()

        # -------------------------------------------------------------------------
        # Step 7: Write output video with audio
        # -------------------------------------------------------------------------
        genbus.progress(gen_id, "encoding_video", 7, 7)

        out_path = str(FILES_DIR / f"ltx2_video_{gen_id}.mp4")

        # Convert video frames to PIL
        frames_pil = [Image.fromarray((f * 255).astype(np.uint8) if f.max() <= 1.0 else f.astype(np.uint8)) for f in video_frames]

        write_video(
            out_path,
            frames_pil,
            source_fps=int(frame_rate),
            target_fps=int(frame_rate),
            crf=18,
            preset="slow",
            interpolate=False,
            gen_id=gen_id,
            audio=audio_output,
            audio_sample_rate=vocoder_sample_rate,
        )

        duration = frames_count / frame_rate
        quanto_gc()

        genbus.progress(gen_id, "complete", 7, 7)
        genbus.finish(gen_id, {"video_path": out_path})

        logger.info(f"[LTX-2] Complete: {out_path} ({duration:.1f}s @ {W}x{H})")

        return jsonify(_json_sanitize({
            "status": "success",
            "video_path": out_path,
            "frames": frames_count,
            "duration_seconds": round(duration, 2),
            "resolution": f"{W}x{H}",
            "quantization": "int8 (optimum-quanto)",
            "model": "LTX-2 (19B)",
            "has_audio": include_audio and audio_output is not None,
            "generation_websocket_url": generation_url(),
        }))

    except Exception as e:
        logger.exception("LTX-2 I2V failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        # Restore offline mode environment variables
        if _ltx_old_hf_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = _ltx_old_hf_offline
        if _ltx_old_transformers_offline is None:
            os.environ.pop("TRANSFORMERS_OFFLINE", None)
        else:
            os.environ["TRANSFORMERS_OFFLINE"] = _ltx_old_transformers_offline
        # Cleanup any remaining components
        for obj in [text_encoder, tokenizer, transformer, video_vae, audio_vae, connectors, vocoder]:
            if obj is not None:
                try:
                    del obj
                except Exception:
                    pass
        quanto_gc()


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