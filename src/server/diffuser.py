#!/usr/bin/env python
# -*- coding: utf-8 -*-
# BonzAI Media Generation Server — eventlet + robust progress + JSON sanitize + watermark
# PART 1/5

from __future__ import annotations

import os, re, io, time, json, base64, logging, threading, hashlib, platform, shutil, subprocess, gc, stat
from io import BytesIO
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from importlib import import_module
from fnmatch import fnmatch
import imageio.v3 as iio

# ---- eventlet first
import eventlet
eventlet.monkey_patch(all=True, socket=True, time=True, select=True, thread=True, os=True)

import requests
import torch
import numpy as np
from PIL import Image

from appdirs import user_data_dir
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room

# Hugging Face hub
from huggingface_hub import HfApi, hf_hub_url

# Safetensors
try:
    from safetensors.torch import safe_open as _safetensors_open
except Exception:
    _safetensors_open = None

from transformers import T5EncoderModel, T5Config
from safetensors.torch import load_file as safe_load_file

from diffusers import (
    DiffusionPipeline,
    AutoPipelineForText2Image,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    HunyuanVideoPipeline,
    LTXPipeline,
    LTXImageToVideoPipeline,
    LTXConditionPipeline,
    WanImageToVideoPipeline,
    GGUFQuantizationConfig,
    FluxPipeline,
    FluxImg2ImgPipeline,
    FluxTransformer2DModel,
    WanTransformer3DModel,
    AutoencoderKLWan,
    FlowMatchEulerDiscreteScheduler
)
from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
from diffusers.utils import load_image, export_to_video

# ------------------------- JSON Sanitization -------------------------
def _json_sanitize(obj):
    if obj is None or isinstance(obj, (bool,int,float,str)):
        return obj
    if isinstance(obj, Path): return str(obj)
    if isinstance(obj, (datetime,date)): return obj.isoformat()
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, dict): return {str(k): _json_sanitize(v) for k,v in obj.items()}
    if isinstance(obj, (list,tuple,set)): return [_json_sanitize(v) for v in obj]
    if hasattr(obj,"__dict__"): return _json_sanitize(vars(obj))
    return str(obj)

# ------------------------------ Logging & paths ------------------------------
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bonzai-server")

USER_DATA_PATH = user_data_dir("bonzai", "BonzAI")
MODEL_DIR = Path(USER_DATA_PATH)/"models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

os.environ["HF_HOME"] = str(MODEL_DIR/"hf")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY","1")

LOCAL_ONLY = bool(int(os.getenv("BONZAI_LOCAL_ONLY","1")))
MAX_REPO_BYTES = int(os.getenv("BONZAI_MAX_REPO_BYTES", str(60*(1<<30))))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# ---------------------------- Flask / Socket.IO -------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY","bonzai-secret-key")
CORS(app)

socketio = SocketIO(app,cors_allowed_origins="*",async_mode="eventlet",
                    logger=False,engineio_logger=False,ping_interval=20,ping_timeout=30)

def socket_emit(event:str,payload:dict,namespace:str):
    socketio.emit(event,_json_sanitize(payload),namespace=namespace)
    try: socketio.sleep(0)
    except Exception: pass

# -------------------------- Devices & memory helpers --------------------------
class DeviceManager:
    @staticmethod
    def get_device() -> torch.device:
        if torch.backends.mps.is_available(): return torch.device("mps")
        if torch.cuda.is_available(): return torch.device("cuda")
        return torch.device("cpu")

    @staticmethod
    def get_dtype(device: Optional[torch.device] = None) -> torch.dtype:
        device = device or DeviceManager.get_device()
        return torch.float16 if device.type in ("cuda", "mps") else torch.bfloat16

    @staticmethod
    def free_memory():
        gc.collect()
        if torch.backends.mps.is_available(): torch.mps.empty_cache()
        if torch.cuda.is_available(): torch.cuda.empty_cache()

# ---------------------------- Watermark Helper ----------------------------
BONZAI_WM_PATH = Path(__file__).parent/"bonzai.png"

def _apply_watermark(image: Image.Image) -> Image.Image:
    try:
        wm = Image.open(BONZAI_WM_PATH).convert("RGBA").resize((64,64))
        base = image.convert("RGBA")
        x,y = base.width-wm.width-4, base.height-wm.height-4
        base.alpha_composite(wm,(x,y))
        return base.convert("RGB")
    except Exception as e:
        logger.warning(f"Watermark failed: {e}")
        return image

def _apply_watermark_frames(frames: List[Image.Image]) -> List[Image.Image]:
    return [_apply_watermark(f) for f in frames]

# -------------------------- Hugging Face token helper -------------------------
def _hf_token() -> Optional[str]:
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")

# PART 2/5

# PART 2/5

# ------------------------------ Generation bus --------------------------------
class GenerationTracker:
    def __init__(self): 
        self._meta: Dict[str, Dict[str, Any]] = {}

    def new(self, kind: str, meta: Optional[Dict[str, Any]] = None, gen_id: Optional[str] = None) -> str:
        gid = gen_id or hashlib.md5(f"{kind}_{time.time()}".encode()).hexdigest()[:16]
        self._meta[gid] = {"kind": kind, "meta": meta or {}, "ts": time.time(), "stage": "starting"}
        socket_emit("gen_started", _json_sanitize({"generation_id": gid, "kind": kind, "meta": meta or {}}), "/generation")
        socket_emit("gen_progress", _json_sanitize({"generation_id": gid, "stage": "queued", "step": 0, "total": 1, "pct": 0}), "/generation")
        return gid

    def progress(self, generation_id: str, stage: str, step: int, total: int):
        pct = round((step / max(total, 1)) * 100.0, 2)
        socket_emit("gen_progress", _json_sanitize({
            "generation_id": generation_id,
            "stage": stage,
            "step": int(step),
            "total": int(total),
            "pct": pct
        }), "/generation")

    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        socket_emit("gen_finished", _json_sanitize({"generation_id": generation_id, "payload": payload or {}}), "/generation")
        self._meta.pop(generation_id, None)

    def error(self, generation_id: str, message: str):
        socket_emit("gen_error", _json_sanitize({"generation_id": generation_id, "error": message}), "/generation")
        self._meta.pop(generation_id, None)


genbus = GenerationTracker()

# --------------------------- WebSocket namespaces -----------------------------
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

# ------------------------------- Small helpers --------------------------------
def repo_local_dir(repo_id: str) -> Path:
    return MODEL_DIR / "repos" / repo_id.replace("/", "__")

def file_size(p: Path) -> int:
    try: return p.stat().st_size
    except Exception: return 0

def folder_size_bytes(root: Path) -> int:
    total = 0
    if not root.exists(): return 0
    for dp, _, files in os.walk(root):
        for fn in files:
            try: total += (Path(dp) / fn).stat().st_size
            except Exception: pass
    return total

# ----------------------------- Download tracking ------------------------------
@dataclass
class DownloadTask:
    task_id: str
    kind: str                 # "repo" or "file"
    name: str                 # repo_id or "repo_id:path" or filename
    status: str = "pending"   # pending | downloading | completed | failed | cancelled
    progress: float = 0.0
    total_bytes: int = 0
    done_bytes: int = 0
    error_message: Optional[str] = None
    def to_dict(self):
        return {"task_id": self.task_id, "kind": self.kind, "filename": self.name,
                "status": self.status, "progress": round(self.progress, 2),
                "total_size": int(self.total_bytes), "downloaded_size": int(self.done_bytes),
                "error_message": self.error_message}

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
        if not self.tasks: return 0.0
        weights = []
        for t in self.tasks.values():
            w = t.total_bytes if t.total_bytes > 0 else 1
            weights.append((t.progress, w))
        done = sum(p * w for p, w in weights)
        denom = sum(w for _, w in weights) or 1
        return done / denom
    def to_dict(self):
        return {"pipeline_id": self.pipeline_id, "pipeline_name": self.pipeline_name,
                "status": self.status, "attempts": self.attempts,
                "total_progress": round(self.total_progress, 2),
                "tasks": {tid: t.to_dict() for tid, t in self.tasks.items()}}
        
class CancelledDownload(Exception):
    pass

class DownloadManager:
    def __init__(self):
        self.pipelines: Dict[str, PipelineDownload] = {}
        self._lock = threading.Lock()
    def emit(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if pl:
            socketio.emit("download_progress", _json_sanitize({"pipeline": pl.to_dict()}),
                          namespace="/downloads", room=pipeline_id)
            socketio.sleep(0)
    def new(self, name: str) -> PipelineDownload:
        pid = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
        pl = PipelineDownload(pipeline_id=pid, pipeline_name=name)
        with self._lock: self.pipelines[pid] = pl
        return pl
    def add_repo_task(self, pl: PipelineDownload, repo_id: str, total_estimate: int = 0) -> str:
        tid = _tid_repo(repo_id)
        t = pl.tasks.get(tid)
        if t:
            if total_estimate and total_estimate > t.total_bytes: t.total_bytes = int(total_estimate)
            return tid
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="repo", name=repo_id, total_bytes=int(total_estimate))
        return tid
    def add_file_task(self, pl: PipelineDownload, filename: str, size: int) -> str:
        tid = hashlib.md5(f"{filename}_{time.time()}".encode()).hexdigest()[:16]
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="file", name=filename, total_bytes=int(size))
        return tid
    def set_status(self, pl: PipelineDownload, status: str):
        pl.status = status; self.emit(pl.pipeline_id)
    def mark_downloading(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid); 
        if not t: return
        t.status = "downloading"; self.emit(pl.pipeline_id)
    def update_progress(self, pl: PipelineDownload, tid: str, done: int, total: Optional[int] = None):
        t = pl.tasks.get(tid); 
        if not t: return
        if total is not None and total > 0: t.total_bytes = int(total)
        t.done_bytes = max(int(done), 0)
        if t.total_bytes > 0: t.progress = min(100.0, 100.0 * t.done_bytes / t.total_bytes)
        self.emit(pl.pipeline_id)
    def mark_completed(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid); 
        if not t: return
        t.status = "completed"; t.progress = 100.0; t.done_bytes = max(t.done_bytes, t.total_bytes)
        self.emit(pl.pipeline_id)
    def mark_failed(self, pl: PipelineDownload, tid: str, msg: str):
        t = pl.tasks.get(tid); 
        if not t: return
        t.status = "failed"; t.error_message = msg; self.emit(pl.pipeline_id)
    def finalize_if_done(self, pl: PipelineDownload):
        if not pl.tasks:
            pl.status = "completed"; self.emit(pl.pipeline_id); return
        states = {t.status for t in pl.tasks.values()}
        if states <= {"completed"}:
            pl.status = "completed"
        elif "failed" in states and not any(s in states for s in ("pending","downloading")):
            pl.status = "failed"
        elif "cancelled" in states and not any(s in states for s in ("pending","downloading")):
            pl.status = "cancelled"
        else:
            pl.status = "downloading"
        self.emit(pl.pipeline_id)
    def mark_cancelled(self, pl: PipelineDownload, tid: str):
        t = pl.tasks.get(tid)
        if not t: return
        t.status = "cancelled"
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

# ---------------------- Repo allow_patterns (keep lean) -----------------------
def _sdxl_patterns() -> List[str]:
    return [
        "model_index.json",
        "scheduler/**",
        "tokenizer/**",
        "tokenizer_2/**",
        "text_encoder/**",
        "text_encoder_2/**",
        "unet/**",
        "vae/**",
        "**/*.json", "**/*.safetensors", "**/*.bin"
    ]

def _flux_patterns() -> List[str]:
    return [
        "model_index.json",
        "scheduler/**",
        "tokenizer/**",
        "tokenizer_2/**",
        "text_encoder/**",
        "text_encoder_2/**",
        "transformer/**",
        "vae/**",
    ]

def _ltx_patterns_strict() -> List[str]:
    return [
        "model_index.json",
        "ltxv-13b-0.9.8-distilled-fp8.safetensors",
        "ltxv-spatial-upscaler-0.9.8.safetensors",
        "scheduler/**",
        "text_encoder/**",
        "tokenizer/**",
        "transformer/**",
        "vae/**",
    ]

def _ltx_upscaler_patterns() -> List[str]:
    return [
        "model_index.json",
        "latent_upsampler/**",
        "vae/**",
        "**/*.json",
        "**/*.safetensors",
        "**/*.bin",
    ]

def _wan2_patterns() -> list[str]:
    return [
        "model_index.json",
        "scheduler/**",
        "transformer/**",
        "transformer_2/**",       # <-- add this
        "vae/**",
        "text_encoder/**",
        "tokenizer/**",
        "processor/**",
        "**/*.json",
        "**/*.safetensors",
        "**/*.bin",
    ]

def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id in ("black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-Krea-dev"):
        return _flux_patterns()
    if repo_id in (SDXL_BASE_REPO, SDXL_REFINER_REPO, SDXL_TURBO_REPO):
        return _sdxl_patterns()
    if repo_id == LTX_REPO:
        return _ltx_patterns_strict()
    if repo_id == LTX_UPSAMPLER_REPO:
        return _ltx_upscaler_patterns()
    if repo_id == (WAN_REPO, WAN_DIFFUSERS_REPO):
        return _wan2_patterns()
    return None

# ---------------------- Integrity & completeness helpers ----------------------
def _is_valid_safetensors(p: Path) -> bool:
    if _safetensors_open is None:
        try: return p.exists() and p.stat().st_size > 0
        except Exception: return False
    try:
        with _safetensors_open(str(p), framework="pt") as f: _ = f.keys()
        return True
    except Exception: return False

def _nonzero(p: Path) -> bool:
    try: return p.exists() and p.stat().st_size > 0
    except Exception: return False

def _tokenizer_ok(root: Path, name: str = "tokenizer") -> bool:
    def _nz(p: Path) -> bool:
        try:
            return p.exists() and p.stat().st_size > 0
        except Exception:
            return False

    # Common “flat” or nested json
    if _nz(root / f"{name}.json") or _nz(root / name / "tokenizer.json"):
        return True

    # BPE pair (vocab+merges) either under tokenizer/ or repo root
    if (_nz(root / name / "vocab.json") and _nz(root / name / "merges.txt")) or \
       (_nz(root / "vocab.json") and _nz(root / "merges.txt")):
        return True

    # NEW: SentencePiece / T5 layouts under tokenizer/
    tokdir = root / name
    for fn in ("spiece.model", "sentencepiece.bpe.model", "tokenizer.model", "vocab.txt"):
        if _nz(tokdir / fn):
            return True

    # Some repos put tokenizer assets under processor/
    proc = root / "processor"
    for fn in ("tokenizer.json", "spiece.model", "sentencepiece.bpe.model", "tokenizer.model", "vocab.txt"):
        if _nz(proc / fn):
            return True

    return False

REPO_SPECS = {
    "black-forest-labs/FLUX.1-Krea-dev": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["text_encoder", "text_encoder_2", "vae"],
        "extra_dirs": ["scheduler"],
    },
    "stabilityai/stable-diffusion-xl-base-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["text_encoder", "text_encoder_2", "scheduler"],
    },
    "stabilityai/stable-diffusion-xl-refiner-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["scheduler"],
    },
    "stabilityai/sdxl-turbo": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["text_encoder", "text_encoder_2", "scheduler"],
    },
    "Lightricks/LTX-Video": {
        "must_files": [
            "model_index.json",
            "ltxv-2b-0.9.8-distilled-fp8.safetensors",
            "ltxv-spatial-upscaler-0.9.8.safetensors",
        ],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["text_encoder", "transformer", "vae"],
        "extra_dirs": ["scheduler"],
        "fallback_any_weights": False,
    },
    "linoyts/LTX-Video-spatial-upscaler-0.9.8": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],
        "must_weight_dirs": ["latent_upsampler", "vae"],
    },
    "Wan-AI/Wan2.2-I2V-A14B-Diffusers": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "transformer_2", "vae", "text_encoder"],
        "extra_dirs": ["scheduler"],
        "fallback_any_weights": False,
    },
}

DEFAULT_SPEC = {"must_files": ["model_index.json"], "must_weight_dirs": [], "must_tokenizers": [], "fallback_any_weights": True}

def _has_any_weights(path: Path) -> bool:
    if not path.exists(): return False
    for x in path.rglob("*.safetensors"):
        if _is_valid_safetensors(x): return True
    for pat in ["pytorch_model.bin", "diffusion_pytorch_model.bin", "tf_model.h5", "flax_model.msgpack"]:
        for x in path.rglob(pat):
            if _nonzero(x): return True
    return False

def _repo_completeness(repo_id: str) -> Dict[str, Any]:
    base_root = repo_local_dir(repo_id)
    root = base_root
    report = {"repo": repo_id, "root": str(base_root), "exists": base_root.exists(), "ok": False, "missing": []}
    if not base_root.exists():
        report["missing"].append("<entire repo>")
        return report
    spec = REPO_SPECS.get(repo_id, DEFAULT_SPEC)
    for f in spec.get("must_files", []):
        if not _nonzero(root / f): report["missing"].append(f)
    for tok in spec.get("must_tokenizers", []):
        if not _tokenizer_ok(root, tok): report["missing"].append(f"{tok} (tokenizer files)")
    for d in spec.get("must_weight_dirs", []):
        if not _has_any_weights(root / d): report["missing"].append(f"{d}/*(weights)")
    for d in spec.get("extra_dirs", []):
        dp = root / d
        if not dp.exists() or not any(x.is_file() and _nonzero(x) for x in dp.rglob("*")):
            report["missing"].append(f"{d}/")
    if not report["missing"] and REPO_SPECS.get(repo_id) is None:
        if DEFAULT_SPEC.get("fallback_any_weights") and not _has_any_weights(root):
            report["missing"].append("any weights (*.safetensors / *.bin)")
    report["ok"] = len(report["missing"]) == 0
    return report

# PART 3/5

# --------------------------- PLAN: repos + GGUF+VAE ---------------------------
# Classic repos
FLUX_KREA_REPO = "black-forest-labs/FLUX.1-Krea-dev"
FLUX_KONTEXT_REPO = "black-forest-labs/FLUX.1-Kontext-dev"
SDXL_BASE_REPO    = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"
SDXL_TURBO_REPO   = "stabilityai/sdxl-turbo"
LTX_REPO = "Lightricks/LTX-Video"
LTX_UPSAMPLER_REPO = "linoyts/LTX-Video-spatial-upscaler-0.9.8"

# Switch WAN classic to the 5B repo
WAN_REPO = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"

# --- WAN 2.2 5B (official diffusers repo + calcuis single-file FP8/GGUF) ---

# Use the official 2.2 A14B diffusers repo (includes vae, text_encoder, tokenizer, scheduler)
WAN_DIFFUSERS_REPO = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"

# --- WAN 2.2 I2V A14B (QuantStack GGUF + Wan 2.1 VAE) ---
WAN_GGUF_REPO = "QuantStack/Wan2.2-I2V-A14B-GGUF"

WAN22_HIGH_GGUF_NAME = "Wan2.2-I2V-A14B-HighNoise-Q2_K.gguf"
WAN22_HIGH_GGUF_URL  = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/Wan2.2-I2V-A14B-HighNoise-Q2_K.gguf"

WAN22_LOW_GGUF_NAME  = "Wan2.2-I2V-A14B-LowNoise-Q2_K.gguf"
WAN22_LOW_GGUF_URL   = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/Wan2.2-I2V-A14B-LowNoise-Q2_K.gguf"

WAN21_VAE_NAME       = "Wan2.1_VAE.safetensors"
WAN21_VAE_URL        = "https://huggingface.co/QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/Wan2.1_VAE.safetensors"

# ---------- Single source of truth for exact byte sizes ----------
# If a file isn't listed here, we'll resolve its size via HEAD at runtime.
EXPECTED_SIZES = {
    "flux1-krea-dev-Q2_K.gguf":    4_023_690_528,  # exact bytes
    "flux1-kontext-dev-Q2_K.gguf": 4_023_690_528,  # exact bytes
    "Wan2.2-I2V-A14B-HighNoise-Q2_K.gguf": 5_300_957_696,
    "Wan2.2-I2V-A14B-LowNoise-Q2_K.gguf": 5_300_957_696,
    "Wan2.1_VAE.safetensors":              253_815_318,
}

# GGUF single files (env overrides still supported) — generic “wan_i2v” path
FLUX_KREA_GGUF_NAME = os.getenv("FLUX_GGUF_FILENAME", "flux1-krea-dev-Q2_K.gguf").strip()
FLUX_KREA_GGUF_URL  = os.getenv("FLUX_KREA_GGUF_URL",
    "https://huggingface.co/QuantStack/FLUX.1-Krea-dev-GGUF/resolve/main/flux1-krea-dev-Q2_K.gguf").strip()

FLUX_KONTEXT_GGUF_NAME = os.getenv("KONTEXT_GGUF_FILENAME", "flux1-kontext-dev-Q2_K.gguf").strip()
FLUX_KONTEXT_GGUF_URL  = os.getenv("FLUX_KONTEXT_GGUF_URL",
    "https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/resolve/main/flux1-kontext-dev-Q2_K.gguf").strip()

LTX_GGUF_NAME = os.getenv("LTX_GGUF_FILENAME", "ltxv-13b-0.9.8-distilled-Q2_K.gguf").strip()
LTX_GGUF_URL  = os.getenv("LTX_GGUF_URL",
    "https://huggingface.co/QuantStack/LTXV-13B-0.9.8-distilled-GGUF/resolve/main/ltxv-13b-0.9.8-distilled-Q2_K.gguf").strip()

# Keep WAN generic GGUF/URL on 5B too (used by 'wan_i2v' plan if you use it)
WAN_GGUF_NAME = os.getenv("WAN_GGUF_FILENAME", "Wan2.2-TI2V-5B-Q2_K.gguf").strip()
WAN_GGUF_URL  = os.getenv("WAN_GGUF_URL",
    "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q2_K.gguf").strip()

# VAE single files (float32) — used in other plans; for wan_video we override with FP8 above
LTX_VAE_NAME = os.getenv("LTX_VAE_FILENAME", "ltxv-vae-f32.safetensors").strip()
LTX_VAE_URL  = os.getenv("LTX_VAE_URL",
    "https://huggingface.co/QuantStack/LTXV-13B-0.9.8-distilled-GGUF/resolve/main/vae/LTXV-13B-0.9.8-distilled-VAE.safetensors").strip()

WAN_VAE_NAME = os.getenv("WAN_VAE_FILENAME", "wan-vae-f32.safetensors").strip()
WAN_VAE_URL  = os.getenv("WAN_VAE_URL",
    "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/vae/Wan2.2_VAE.safetensors").strip()

def _sha256_of_file(path: Path, bufsize: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(bufsize)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

# ----------------------------- PLAN cache ------------------------------------
_plan_cache: Dict[str, Dict[str, Any]] = {}

def _cached_plan_for(pipeline: str) -> Dict[str, Any]:
    if pipeline in _plan_cache:
        return _plan_cache[pipeline]
    plan = _plan_for(pipeline)
    _plan_cache[pipeline] = plan
    return plan

# ---- Robust remote size resolution for Hugging Face (works with resolve/main too)

_HF_URL_RE = re.compile(r"https://huggingface\.co/([^/]+/[^/]+)/resolve/([^/]+)/(.+)$")

def _head_or_range_size(url: str, headers: dict | None = None, timeout: int = 30) -> int:
    headers = headers or {}
    try:
        r = requests.head(url, allow_redirects=True, headers=headers, timeout=timeout)
        clen = int(r.headers.get("content-length", "0") or "0")
        if clen > 0:
            return clen
    except Exception:
        pass
    # Range fallback (many CDNs return Content-Range: bytes 0-0/TOTAL)
    try:
        r = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, stream=True, timeout=timeout)
        cr = r.headers.get("Content-Range", "")
        m = re.search(r"/(\d+)$", cr)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return 0

def _resolve_hf_direct_url(url: str) -> str | None:
    """
    If the input is a huggingface 'resolve/main' URL, turn it into a canonical CDN URL
    using hf_hub_url(repo_id, filename, revision).
    """
    m = _HF_URL_RE.match(url)
    if not m:
        return None
    repo_id, revision, filename = m.group(1), m.group(2), m.group(3)
    try:
        return hf_hub_url(repo_id=repo_id, filename=filename, repo_type="model", revision=revision)
    except Exception:
        return None

def _expected_size(name: str, url: Optional[str] = None) -> int:
    # 1) hard-coded registry wins
    s = int(EXPECTED_SIZES.get(name, 0))
    if s > 0:
        return s

    if not url:
        return 0

    headers = {}
    if url.startswith("https://huggingface.co/") and _hf_token():
        headers["Authorization"] = f"Bearer {_hf_token()}"  # speeds up and handles gated repos

    # 2) try the URL directly
    size = _head_or_range_size(url, headers=headers)
    # 3) if tiny/suspicious, try the canonical hf_hub_url(link)
    if size <= 1_000_000:  # <1MB means we probably hit a stub/redirect
        alt = _resolve_hf_direct_url(url)
        if alt:
            size2 = _head_or_range_size(alt, headers=headers)
            if size2 > 0:
                size = size2

    if size > 0:
        EXPECTED_SIZES[name] = size  # memoize
    return size

def _invalidate_plan_cache(pipeline: Optional[str] = None):
    if pipeline:
        _plan_cache.pop(pipeline, None)
    else:
        _plan_cache.clear()

# ----------------------------- PLAN definition --------------------------------
def _sf(name, url):
    return {"name": name, "url": url, "size": _expected_size(name, url)}

def _plan_for(pipeline: str) -> Dict[str, Any]:
    pipeline = pipeline.strip().lower()
    if pipeline == "flux_krea":
        return {
            "repos_to_fetch": [FLUX_KREA_REPO],
            "single_files": [_sf(FLUX_KREA_GGUF_NAME, FLUX_KREA_GGUF_URL)],
        }
    if pipeline == "flux_kontext":
        return {
            "repos_to_fetch": [FLUX_KONTEXT_REPO],
            "single_files": [_sf(FLUX_KONTEXT_GGUF_NAME, FLUX_KONTEXT_GGUF_URL)],
        }
    if pipeline == "ltx_video":
        return {
            "repos_to_fetch": [LTX_REPO, LTX_UPSAMPLER_REPO],
            "single_files": [],
        }
    if pipeline == "wan_video":
        return {
            # We still pull the A14B diffusers repo for configs/tokenizer/scheduler
            "repos_to_fetch": [WAN_DIFFUSERS_REPO],
            # The actual transformer + VAE come from the QuantStack GGUF repo
            "single_files": [
                _sf(WAN22_HIGH_GGUF_NAME, WAN22_HIGH_GGUF_URL),
                _sf(WAN22_LOW_GGUF_NAME,  WAN22_LOW_GGUF_URL),
                _sf(WAN21_VAE_NAME,       WAN21_VAE_URL),
            ],
            "notes": [
                "Transformer: QuantStack GGUF (High/Low noise variants).",
                "VAE: Wan 2.1 (safetensors).",
                "Configs/tokenizer/scheduler: Wan-AI/Wan2.2-I2V-A14B-Diffusers.",
            ],
        }
    if pipeline == "sdxl_intermediate":
        return {"repos_to_fetch": [SDXL_BASE_REPO, SDXL_REFINER_REPO]}
    if pipeline == "sdxl_turbo":
        return {"repos_to_fetch": [SDXL_TURBO_REPO]}
    raise ValueError(f"Unknown pipeline: {pipeline}")

# ------------------------------ Repo readiness -------------------------------
def _repo_readiness(repo_id: str) -> Dict[str, Any]:
    """
    Wrapper around _repo_completeness to signal whether a repo is fully usable.
    Returns a dict with at least {repo, ok, missing}.
    """
    try:
        return _repo_completeness(repo_id)
    except Exception as e:
        return {"repo": repo_id, "ok": False, "missing": [f"error: {str(e)}"]}
    
# ========================= MISSING CORE HELPERS (exact patch) =========================

def _single_file_status(entry: Dict[str, Any]) -> Dict[str, Any]:
    name = (entry or {}).get("name") or ""
    url  = (entry or {}).get("url") or ""
    p = MODEL_DIR / name
    exists = p.exists() and p.stat().st_size > 0
    size_on_disk = int(p.stat().st_size) if exists else 0

    expected_size = int(entry.get("size") or 0)
    if expected_size <= 0:
        expected_size = _expected_size(name, url)

    ok = False
    reason = None
    if exists:
        if expected_size > 0:
            if size_on_disk == expected_size:
                ok = True
            else:
                reason = f"size_mismatch:{size_on_disk}!={expected_size}"
        else:
            # last-resort fallback: any non-zero local file passes
            ok = True

    return {
        "name": name,
        "url": url,
        "path": str(p),
        "exists": bool(exists),
        "ok": bool(ok),
        "size_on_disk": size_on_disk,
        "expected_size": int(expected_size or 0),
        "reason": reason,
    }

# -- Repo file listing via HF API (pattern-filtered to keep downloads lean) --
def _list_required_remote_files(repo_id: str, allow_patterns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    api = HfApi(token=_hf_token())
    files: List[Dict[str, Any]] = []

    def _match(p: str) -> bool:
        return True if not allow_patterns else any(fnmatch(p, pat) for pat in allow_patterns)

    # Prefer list_repo_tree(expand=True) to get sizes
    try:
        items = api.list_repo_tree(repo_id=repo_id, repo_type="model", revision="main",
                                   recursive=True, expand=True)
        for it in items or []:
            if getattr(it, "type", None) == "file" and _match(it.path):
                size = int(getattr(it, "size", 0) or 0)
                files.append({"path": it.path, "size": size})
    except Exception:
        pass

    # Fallback: get_paths_info
    if not files:
        try:
            infos = api.get_paths_info(repo_id=repo_id, repo_type="model",
                                       paths=[""], revision="main", expand=True, recursive=True)
            for info in infos or []:
                if getattr(info, "type", "") == "file" and _match(info.path):
                    size = int(getattr(info, "size", 0) or 0)
                    files.append({"path": info.path, "size": size})
        except Exception:
            pass

    # Fallback: list_repo_files (size unknown)
    if not files:
        try:
            paths = api.list_repo_files(repo_id=repo_id, repo_type="model", revision="main")
            for pth in paths or []:
                if _match(pth):
                    files.append({"path": pth, "size": 0})
        except Exception:
            pass

    if not files:
        return []

    # Fill missing sizes by HEAD/Range on hf_hub_url
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}

    def _resolve_remote_size(url: str) -> int:
        try:
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
            clen = int(r.headers.get("content-length", "0") or "0")
            if clen > 0:
                return clen
        except Exception:
            pass
        try:
            r = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, stream=True, timeout=30)
            cr = r.headers.get("Content-Range", "")
            m = re.search(r"/(\d+)$", cr)
            if m:
                return int(m.group(1))
        except Exception:
            pass
        return 0

    for f in files:
        if int(f.get("size") or 0) > 0:
            continue
        try:
            url = hf_hub_url(repo_id=repo_id, filename=f["path"], repo_type="model", revision="main")
            f["size"] = _resolve_remote_size(url)
        except Exception:
            pass

    return files

# -- Inventory structures used by deep_validate in /pipelines/plan --
@dataclass
class FileEntry:
    path: str
    remote_size: int
    local_size: int
    status: str  # "ok" | "missing" | "incomplete" | "invalid"

def _classify_file(rel: str, remote_size: int, local_path: Path) -> FileEntry:
    try:
        if not local_path.exists():
            return FileEntry(rel, int(remote_size or 0), 0, "missing")
        lsz = local_path.stat().st_size
    except Exception:
        return FileEntry(rel, int(remote_size or 0), 0, "missing")

    if remote_size > 0 and lsz != remote_size:
        return FileEntry(rel, int(remote_size or 0), int(lsz or 0), "incomplete")
    if remote_size == 0 and lsz <= 0:
        return FileEntry(rel, 0, 0, "missing")

    if rel.endswith(".safetensors"):
        try:
            ok = _is_valid_safetensors(local_path)
        except Exception:
            ok = True
        if not ok:
            return FileEntry(rel, int(remote_size or 0), int(lsz or 0), "invalid")

    return FileEntry(rel, int(remote_size or 0), int(lsz or 0), "ok")

def build_repo_inventory(repo_id: str, allow_patterns: Optional[List[str]] = None) -> Dict[str, Any]:
    root = repo_local_dir(repo_id)
    spec_report = _repo_completeness(repo_id)

    manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
    remote_accessible = True
    if not manifest and not spec_report.get("ok", False):
        remote_accessible = False

    files: List[FileEntry] = []
    needs: List[str] = []
    for f in manifest:
        rel = f["path"]; rsz = int(f.get("size") or 0)
        lp = root / rel
        fe = _classify_file(rel, rsz, lp)
        files.append(fe)
        if fe.status in ("missing", "incomplete", "invalid"):
            needs.append(rel)

    summary = {
        "total": len(files),
        "ok": sum(1 for x in files if x.status == "ok"),
        "missing": sum(1 for x in files if x.status == "missing"),
        "incomplete": sum(1 for x in files if x.status == "incomplete"),
        "invalid": sum(1 for x in files if x.status == "invalid"),
    }

    # If we couldn't list remote files, fallback to spec report
    ok = (len(needs) == 0) if manifest else bool(spec_report.get("ok", False))

    return {
        "repo": repo_id,
        "root": str(root),
        "exists": root.exists(),
        "remote_accessible": remote_accessible,
        "files": [fe.__dict__ for fe in files],
        "needs": needs,
        "summary": summary,
        "ok": ok,
        "missing": (len(needs) if remote_accessible else None),
        "missing_list": spec_report.get("missing", []),
    }

# -- Repo task id helper used by DownloadManager.add_repo_task --
def _tid_repo(repo_id: str) -> str:
    return f"repo::{hashlib.md5(repo_id.encode('utf-8')).hexdigest()[:12]}"

# -- WebSocket URL used in generation responses --
def generation_url() -> str:
    try:
        scheme = "wss" if (request.is_secure or request.headers.get("X-Forwarded-Proto","").lower()=="https") else "ws"
        return f"{scheme}://{request.host}/generation"
    except Exception:
        return "/generation"

def _user_bin_dir() -> str:
    p = Path(USER_DATA_PATH) / "bin"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)

def _platform_tag():
    system = platform.system().lower()
    arch = {"x86_64":"x64","amd64":"x64","arm64":"arm64","aarch64":"arm64"}.get(platform.machine().lower(), platform.machine().lower())
    if system == "darwin": plat, exe = f"darwin/{arch}", "ffmpeg"
    elif system == "linux": plat, exe = f"linux/{arch}", "ffmpeg"
    elif system == "windows": plat, exe = f"win32/{arch}", "ffmpeg.exe"
    else:
        raise RuntimeError(f"Unsupported platform: {system}/{arch}")
    return plat, exe

def _candidate_roots() -> list[Path]:
    """
    Likely roots for node_modules in dev + packaged app.
    You can also override with FFMPEG_NPM_ROOT (points to a dir containing 'node_modules').
    """
    env_root = os.environ.get("FFMPEG_NPM_ROOT")
    roots = []
    if env_root:
        roots.append(Path(env_root))
    here = Path(__file__).resolve()
    # Walk up a few levels (dev)
    parents = list(here.parents)[:8]
    roots.extend(parents)
    # Typical Electron packaged locations
    for base in [here, *parents]:
        roots.append(base / "resources")
        roots.append(base / "resources" / "app.asar.unpacked")
        roots.append(base / "app.asar.unpacked")
    # CWD as last resort
    roots.append(Path.cwd())
    # Dedup while preserving order
    seen, out = set(), []
    for r in roots:
        try:
            rp = r.resolve()
        except Exception:
            rp = r
        if rp not in seen:
            seen.add(rp); out.append(rp)
    return out

def _npm_ffmpeg_source_path() -> str:
    # Direct override: allow Electron main to pass absolute binary path
    direct = os.environ.get("FFMPEG_BIN")
    if direct and os.path.isfile(direct):
        return direct

    plat, exe = _platform_tag()

    # Search for ffmpeg-static-electron-forge layout
    patterns = [
        Path("node_modules") / "ffmpeg-static-electron-forge" / "dist" / "bin",
        Path("app.asar.unpacked") / "node_modules" / "ffmpeg-static-electron-forge" / "dist" / "bin",
        Path("resources") / "app.asar.unpacked" / "node_modules" / "ffmpeg-static-electron-forge" / "dist" / "bin",
    ]

    for root in _candidate_roots():
        for pat in patterns:
            p = (root / pat / plat / exe)
            if p.is_file():
                return str(p)

    # Fallback: if a system ffmpeg exists, use it (no staging copy)
    sys_ffmpeg = shutil.which("ffmpeg.exe" if exe.endswith(".exe") else "ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg

    raise FileNotFoundError(
        "Bundled ffmpeg not found. "
        "Install 'ffmpeg-static-electron-forge' (recommended) or set FFMPEG_BIN/FFMPEG_NPM_ROOT."
    )

def _dest_ffmpeg_path() -> str:
    _, exe = _platform_tag()
    return os.path.join(_user_bin_dir(), exe)

def _make_executable_and_clear_quarantine(path: str):
    try:
        st = os.stat(path)
        os.chmod(path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass
    # macOS quarantine bit (no-op elsewhere)
    try:
        subprocess.run(["xattr","-dr","com.apple.quarantine", path],
                       check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def get_ffmpeg_binary_path() -> str:
    src = _npm_ffmpeg_source_path()
    dst = _dest_ffmpeg_path()

    # If src is already the staged path, just ensure executability and return.
    # Otherwise copy into our user bin to avoid ASAR/execution issues.
    try:
        need_copy = True
        try:
            need_copy = (os.path.abspath(src) != os.path.abspath(dst))
        except Exception:
            need_copy = True

        if need_copy:
            # only copy when src newer or dst missing/different size
            copy_required = True
            if os.path.isfile(dst):
                try:
                    s1, s2 = os.stat(src), os.stat(dst)
                    copy_required = (s1.st_size != s2.st_size) or (s1.st_mtime > s2.st_mtime)
                except Exception:
                    copy_required = False
            if copy_required:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst, length=1<<20)
        else:
            dst = src
    except Exception as e:
        raise RuntimeError(f"Failed to stage ffmpeg to app bin: {e}")

    _make_executable_and_clear_quarantine(dst)
    if not (os.path.isfile(dst) and os.access(dst, os.X_OK)):
        raise PermissionError(f"Staged ffmpeg not executable at {dst}")

    os.environ["IMAGEIO_FFMPEG_EXE"] = dst  # used by imageio/ffmpegio
    return dst

# Ensure env is set at import time for any downstream video writers:
os.environ["IMAGEIO_FFMPEG_EXE"] = get_ffmpeg_binary_path()

# -- Guard for repos (used by SDXL routes) --
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

# -- Guard for pipelines with repos + single files (also can auto-start prefetch) --
def _ensure_files_present_or_start(pipeline: str, auto_download: bool = False):
    plan = _cached_plan_for(pipeline)

    # Repos
    missing_repos = []
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid)
        if not st.get("ok", False):
            missing_repos.append({"repo": rid, "missing": st.get("missing", [])})

    # Single files: include both missing and invalid
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

# ---------------------- Prefetch implementation (repos + files) ----------------------

def _start_prefetch_pipeline(pipeline: str) -> Dict[str, Any]:
    """
    Starts a background worker that fetches repos (filtered manifests) and
    single-file artifacts for the given pipeline. Emits live progress via
    DownloadManager. Cancellable via DownloadManager.cancel_pipeline().
    """
    plan = _cached_plan_for(pipeline)
    pl = download_manager.new(pipeline)
    download_manager.set_status(pl, "downloading")

    def _worker():
        try:
            # ---------------- 1) Repos first ----------------
            for rid in plan.get("repos_to_fetch", []):
                if pl.cancelled:
                    break
                allow = allow_patterns_for_repo(rid)
                manifest = _list_required_remote_files(rid, allow_patterns=allow)
                total = sum(int(f.get("size") or 0) for f in manifest) or 1
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

            # ---------------- 2) Queue ALL single-file tasks so they appear instantly ----------------
            files_to_do = []
            for f in plan.get("single_files", []):
                name = (f or {}).get("name") or ""
                # Size hint from expectation table (0 means unknown and we’ll resolve via HEAD)
                size_hint = int(EXPECTED_SIZES.get(name, 0))
                tid = download_manager.add_file_task(pl, name, size_hint or 1)
                files_to_do.append((f, tid))
            download_manager.emit(pl.pipeline_id)

            # ---------------- 3) Process single files ----------------
            for f, tid in files_to_do:
                if pl.cancelled:
                    download_manager.mark_cancelled(pl, tid)
                    break

                # If it already exists locally and is valid by SIZE, skip
                st = _single_file_status(f)
                if st["exists"] and st["ok"]:
                    download_manager.update_progress(pl, tid, st["size_on_disk"], st["size_on_disk"] or 1)
                    download_manager.mark_completed(pl, tid)
                    continue

                download_manager.mark_downloading(pl, tid)

                # Best-effort size hint to weight the progress bar
                name, url = st["name"], st["url"]
                size_hint = int(EXPECTED_SIZES.get(name, 0)) if 'EXPECTED_SIZES' in globals() else 0
                if size_hint <= 0:
                    try:
                        headers = {}
                        if url.startswith("https://huggingface.co/") and _hf_token():
                            headers["Authorization"] = f"Bearer {_hf_token()}"
                        r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
                        size_hint = int(r.headers.get("content-length", "0") or 0)
                    except Exception:
                        size_hint = 0
                download_manager.update_progress(pl, tid, 0, size_hint or 1)

                try:
                    _download_single_file(pl, tid, name, url, size_hint=size_hint, optional=False)
                    if not pl.cancelled:
                        download_manager.mark_completed(pl, tid)
                except Exception as e:
                    if pl.cancelled:
                        download_manager.mark_cancelled(pl, tid)
                        break
                    download_manager.mark_failed(pl, tid, str(e))
                    # continue with other files

        except Exception:
            logger.exception("Prefetch worker failed")
        finally:
            download_manager.finalize_if_done(pl)

    eventlet.spawn_n(_worker)
    return {
        "json": {
            "ok": True,
            "message": "Prefetch started",
            "pipeline_id": pl.pipeline_id,
            "pipeline": pl.to_dict(),
        },
        "http_status": 202,
    }
    
def _download_repo_files(pl: PipelineDownload, tid: str, repo_id: str, manifest: List[Dict[str, Any]]):
    """
    Streams all files of a repo manifest into the local repo directory.
    Tracks progress in bytes, supports cancellation, and skips already-complete files.
    """
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    base = repo_local_dir(repo_id)
    base.mkdir(parents=True, exist_ok=True)

    done = 0
    total = sum(int(f.get("size") or 0) for f in manifest) or 1
    download_manager.update_progress(pl, tid, done, total)

    for f in manifest:
        if pl.cancelled:
            download_manager.mark_cancelled(pl, tid)
            return

        rel = f["path"]
        rsz = int(f.get("size") or 0)
        dest = base / rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        # Skip if already complete by SIZE
        if dest.exists() and (rsz == 0 or dest.stat().st_size == rsz):
            done += (rsz or dest.stat().st_size)
            download_manager.update_progress(pl, tid, done, total)
            continue

        url = hf_hub_url(repo_id=repo_id, filename=rel, repo_type="model", revision="main")

        try:
            _stream_download(
                url,
                dest,
                headers=headers,
                update=lambda inc: _repo_inc(pl, tid, inc, total, ref_done=lambda: done),
                is_cancelled=lambda: pl.cancelled,
            )
        except Exception as e:
            # If cancelled, mark and stop; else bubble up so caller can mark failed
            if pl.cancelled:
                download_manager.mark_cancelled(pl, tid)
                return
            raise e

        done = min(done + (rsz or (dest.stat().st_size if dest.exists() else 0)), total)
        download_manager.update_progress(pl, tid, done, total)

def _download_single_file(
    pl: PipelineDownload,
    tid: str,
    name: str,
    url: str,
    size_hint: int = 0,
    optional: bool = False,
):
    """
    Stream a single required artifact to MODEL_DIR with live progress updates.
    Validates *only by size* when a strict expected size is known.
    Supports cancellation via pl.cancelled.
    """
    headers = {}
    if url.startswith("https://huggingface.co/") and _hf_token():
        headers["Authorization"] = f"Bearer {_hf_token()}"  # optional, speeds rate limits

    dest = MODEL_DIR / name
    dest.parent.mkdir(parents=True, exist_ok=True)

    expected_size = _expected_size(name, url)

    # Purge mismatched file when we know the strict size
    if expected_size > 0 and dest.exists() and dest.stat().st_size != expected_size:
        try:
            dest.unlink()
        except Exception:
            pass

    # If a (possibly partial) local file exists, validate by SIZE only
    if dest.exists() and dest.stat().st_size > 0:
        ok_local = (expected_size <= 0) or (dest.stat().st_size == expected_size)
        if ok_local:
            total = expected_size or dest.stat().st_size
            download_manager.update_progress(pl, tid, total, total)
            return
        else:
            try:
                dest.unlink()
            except Exception:
                pass

    if pl.cancelled:
        download_manager.mark_cancelled(pl, tid)
        return

    # Resolve total for progress weighting: size_hint -> HEAD -> expected_size
    total = int(size_hint or 0)
    if total <= 0:
        total = _expected_size(name, url)

    # Ensure the UI sees a task with a non-zero total as early as possible
    download_manager.update_progress(pl, tid, 0, total or 1)

    # Stream download with increment-based ticking
    done = 0

    def _tick(_inc: int):
        nonlocal done
        done += int(_inc)
        download_manager.update_progress(pl, tid, done, total or done or 1)

    try:
        _stream_download(url, dest, headers=headers, update=_tick, is_cancelled=lambda: pl.cancelled)
    except Exception as e:
        if pl.cancelled:
            download_manager.mark_cancelled(pl, tid)
            return
        raise e

    # Final strict validation: SIZE ONLY when known
    if expected_size > 0 and dest.stat().st_size != expected_size:
        try:
            dest.unlink()
        except Exception:
            pass
        msg = f"Downloaded {name} has size {dest.stat().st_size}, expected {expected_size}"
        if optional:
            logger.warning(msg)
            return
        raise ValueError(msg)

    # Mark complete bytes for the UI
    final_total = expected_size or dest.stat().st_size
    download_manager.update_progress(pl, tid, final_total, final_total)

def _repo_inc(pl: PipelineDownload, tid: str, inc: int, total: int, ref_done):
    # Helper to smooth repo progress updates
    current_done = ref_done()
    new_done = min(current_done + inc, total)
    download_manager.update_progress(pl, tid, new_done, total)

def _stream_download(url: str, dest: Path, headers: Dict[str, str], update, is_cancelled=None):
    with requests.get(url, headers=headers, stream=True, timeout=60) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        try:
            with open(tmp, "wb") as f:
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
            if is_cancelled and is_cancelled():
                raise CancelledDownload()
            tmp.replace(dest)
        except CancelledDownload:
            try: tmp.unlink()
            except Exception: pass
            raise

# ======================= END MISSING CORE HELPERS (exact patch) =======================

# ------------------------------ REST: plan/prefetch ----------------------------
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

    deep = bool(data.get("deep_validate", False))
    repos_status, auth_repos, repo_inventories = [], [], []
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid)
        repos_status.append(st)
        if deep:
            pats = allow_patterns_for_repo(rid)
            repo_inventories.append(build_repo_inventory(rid, allow_patterns=pats))
        if st.get("missing") is None and not st.get("ok", False):
            auth_repos.append(rid)

    # Single-file artifacts (GGUF / VAE / text encoder, etc.)
    required_files = []
    for f in plan.get("single_files", []):
        required_files.append(_single_file_status(f))

    ok_repos = all(r.get("ok") for r in repos_status) if repos_status else True
    ok_files = all(s.get("ok") for s in required_files) if required_files else True

    # Back-compat: also expose "gguf_status" (same content as required_files but minimal)
    ggufs = []
    for s in required_files:
        ggufs.append({
            "configured": True,
            "path": s["path"],
            "exists": s["exists"],
            "size": s["size_on_disk"],
            "name": s["name"],
        })

    resp = {
        "plan": plan,
        "repos": repos_status,
        "required_files": required_files,   # <--- NEW (explicit; includes wan2.2_vae.safetensors)
        "gguf_status": ggufs,              # back-compat for existing UI
        "notes": plan.get("notes", []),
        "ok": bool(ok_repos and ok_files),
    }
    if auth_repos:
        resp["auth_required"] = True
        resp["auth_repos"] = auth_repos
    if deep:
        resp["inventories"] = repo_inventories
    return jsonify(_json_sanitize(resp)), 200

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

# PART 4/5

# ------------------------------ Video helpers ---------------------------------
def _sanitize_frames_for_video(frames, target_size=None):
    """
    Accepts:
      - Diffusers pipeline output (with `.frames`)
      - list/tuple of PIL Images or ndarrays
      - ndarray shaped (T,H,W,C) or (H,W,C)

    Returns: (list_of_uint8_ndarrays, (W, H))
    """
    # Handle Diffusers PipeOutput
    if hasattr(frames, "frames"):
        frames = frames.frames[0]

    # Normalize to list without using array truthiness
    if isinstance(frames, np.ndarray):
        if frames.ndim == 4:        # (T,H,W,C)
            frames = [frames[i] for i in range(frames.shape[0])]
        elif frames.ndim == 3:      # (H,W,C)
            frames = [frames]
        else:
            raise RuntimeError(f"Unexpected ndarray shape: {frames.shape}")
    elif not isinstance(frames, (list, tuple)):
        frames = [frames]

    frames = list(frames)
    if len(frames) == 0:
        raise RuntimeError("No frames to write")

    # Output size
    if target_size is not None:
        W, H = int(target_size[0]), int(target_size[1])
    else:
        f0 = frames[0]
        if isinstance(f0, Image.Image):
            W, H = f0.size
        else:
            arr0 = np.asarray(f0)
            if arr0.ndim == 3 and arr0.shape[2] in (1, 3, 4):
                H, W = arr0.shape[0], arr0.shape[1]
            else:
                raise RuntimeError("Unexpected frame shape; expected (H,W,C).")

    # Even dims for H.264
    W -= (W % 2); H -= (H % 2)
    if W <= 0 or H <= 0:
        raise RuntimeError("Computed invalid even dimensions for video.")

    out = []
    for fr in frames:
        if isinstance(fr, Image.Image):
            img = fr
        else:
            arr = np.asarray(fr)
            if arr.ndim == 2:
                arr = np.stack([arr] * 3, axis=-1)
            elif arr.ndim == 3 and arr.shape[2] == 4:
                arr = arr[..., :3]
            img = Image.fromarray(arr.astype(np.uint8), mode="RGB")

        if img.mode != "RGB":
            img = img.convert("RGB")
        if img.size != (W, H):
            img = img.resize((W, H), Image.BICUBIC)

        arr = np.asarray(img, dtype=np.uint8)
        if arr.ndim != 3 or arr.shape[2] != 3:
            arr = np.stack([arr] * 3, axis=-1)
        out.append(np.ascontiguousarray(arr))

    return out, (W, H)

def _write_video_h264_safe(out_path, frames, fps, gen_id=None, target_size=None, trim_head_frames: int = 0):
    arrs, (W, H) = _sanitize_frames_for_video(frames, target_size=target_size)
    if isinstance(trim_head_frames, int) and trim_head_frames > 0:
        drop = min(trim_head_frames, max(0, len(arrs) - 1))  # keep at least 1 frame
        if drop:
            arrs = arrs[drop:]
    tmp_dir = Path(MODEL_DIR) / f"tmp_frames_{int(time.time())}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        for idx, arr in enumerate(arrs, 1):
            Image.fromarray(arr).save(tmp_dir / f"{idx:05d}.png")
            if gen_id and (idx % max(1, len(arrs)//10) == 0):
                genbus.progress(gen_id, "encode_video", idx, len(arrs)); socketio.sleep(0)
        ffmpeg = get_ffmpeg_binary_path()
        cmd = [
            ffmpeg, "-y", "-framerate", str(fps), "-i", str(tmp_dir / "%05d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", f"scale={W}:{H}", out_path,
        ]
        subprocess.run(cmd, check=True)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        
def _write_video_h264_safe_interpolated(
    out_path,
    frames,
    fps_in,
    target_size=None,          # final delivery (W,H)
    fps_out=24,
    upscale=1.0,               # super-sample factor before final downscale
    scaler="lanczos",          # lanczos|spline36|bicubic|bilinear
    crf=20,
    preset="slow",
    tune="film",
    add_grain=0.0,             # 0..1
    sharpen=0.35,              # ~0.3–0.8
    deband=True,
    denoise=True,
    use_libplacebo=False,      # we’ll use core scale/pad/crop for AR correctness
    aspect_mode="fit",         # fit|fill|stretch|none
    pad_color="black",         # letterbox/pillarbox color, e.g. "#0a0a0f"
    gen_id=None,
    trim_head_frames: int = 0,
):
    """
    Aspect modes:
      - fit:   keep AR, content fits inside target, pad to exact W×H
      - fill:  keep AR, content fills target, crop overflow to W×H
      - none:  keep original size (no scaling); still makes dims even
      - stretch: scale directly to W×H (distorts AR) — not recommended
    """
    def _even(n):
        n = int(round(n))
        return n - (n % 2) if n % 2 else n

    # Normalize frames without forcing a target resize up-front
    arrs, (W0, H0) = _sanitize_frames_for_video(frames, target_size=None)
    if isinstance(trim_head_frames, int) and trim_head_frames > 0:
        drop = min(trim_head_frames, max(0, len(arrs) - 1))  # keep at least 1 frame
        if drop:
            arrs = arrs[drop:]
    # If caller didn’t provide a target, default to the source size (evened)
    if target_size is None or aspect_mode == "none":
        Wt, Ht = _even(W0), _even(H0)
    else:
        Wt, Ht = _even(int(target_size[0])), _even(int(target_size[1]))

    # Decide aspect-preserving content box (Wc, Hc) to place into final Wt×Ht
    if aspect_mode == "fit" and target_size is not None:
        s = min(Wt / W0, Ht / H0)
        Wc, Hc = _even(round(W0 * s)), _even(round(H0 * s))
        Wc = min(Wc, Wt); Hc = min(Hc, Ht)

    elif aspect_mode == "fill" and target_size is not None:
        s = max(Wt / W0, Ht / H0)
        Wc, Hc = _even(round(W0 * s)), _even(round(H0 * s))
        # Wc/Hc >= Wt/Ht — will crop to target

    elif aspect_mode == "stretch" and target_size is not None:
        # Distorts AR to exactly Wt×Ht
        Wc, Hc = Wt, Ht

    else:  # "none" or no target provided
        Wc, Hc = _even(W0), _even(H0)
        Wt, Ht = Wc, Hc  # final delivery matches source

    # Optional supersampling stage for better detail/anti-aliasing
    if upscale and upscale > 1.0:
        Wu, Hu = _even(Wc * upscale), _even(Hc * upscale)
    else:
        Wu, Hu = Wc, Hc

    # Write source frames as PNGs
    tmp_dir = Path(MODEL_DIR) / f"tmp_frames_{int(time.time())}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        total = len(arrs)
        for i, arr in enumerate(arrs, 1):
            Image.fromarray(arr).save(tmp_dir / f"{i:05d}.png")
            if gen_id and (i % max(1, total // 10) == 0):
                genbus.progress(gen_id, "encode_prep", i, total); socketio.sleep(0)

        ffmpeg = get_ffmpeg_binary_path()

        # Map scaler to ffmpeg scale flags
        sc_flag = {
            "lanczos":  "lanczos",
            "spline36": "spline",
            "bicubic":  "bicubic",
            "bilinear": "bilinear",
        }.get(scaler.lower(), "lanczos")

        vf_parts = []

        # Pre-clean (helps resampling)
        if deband and use_libplacebo:
            vf_parts.append("libplacebo=deband=1:deband_iterations=1:deband_threshold=4")
        elif deband:
            vf_parts.append("gradfun=strength=0.7:radius=16")
        if denoise:
            vf_parts.append("hqdn3d=1.0:1.0:6.0:6.0")

        # Supersample → sharpen → downscale to content box
        if (Wu, Hu) != (W0, H0):
            vf_parts.append(f"scale={Wu}:{Hu}:flags={sc_flag}")
        if sharpen and sharpen > 0:
            amt = max(0.1, min(1.5, float(sharpen)))
            vf_parts.append(f"unsharp=lx=5:ly=5:la={amt}:cx=5:cy=5:ca=0.0")
        if (Wc, Hc) != (Wu, Hu):
            vf_parts.append(f"scale={Wc}:{Hc}:flags={sc_flag}")

        # Fit/fill/stretch/none to reach delivery size exactly (Wt×Ht)
        if aspect_mode == "fit" and (Wc, Hc) != (Wt, Ht):
            # center pad to target
            # pad color can be "black" or "#rrggbb"
            vf_parts.append(f"pad={Wt}:{Ht}:(ow-iw)/2:(oh-ih)/2:{pad_color}")
        elif aspect_mode == "fill" and (Wc, Hc) != (Wt, Ht):
            # crop center to target
            vf_parts.append(f"crop={Wt}:{Ht}:(in_w-out_w)/2:(in_h-out_h)/2")
        elif aspect_mode in ("stretch",) and (Wc, Hc) != (Wt, Ht):
            # one more stretch to exact target (only if user asked)
            vf_parts.append(f"scale={Wt}:{Ht}:flags={sc_flag}")

        # FPS interpolation if needed
        if fps_out and int(fps_out) != int(fps_in):
            vf_parts.append(f"minterpolate=fps={int(fps_out)}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")

        vf_parts.append("format=yuv420p")
        vf = ",".join(vf_parts)

        cmd = [
            ffmpeg, "-y",
            "-framerate", str(fps_in),
            "-i", str(tmp_dir / "%05d.png"),
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", preset,
            "-tune", tune,
            "-crf", str(crf),
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            out_path,
        ]

        # Encode
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError:
            # Safer fallback (strip fancy pieces if any build lacks filters)
            fallback = []
            if denoise: fallback.append("hqdn3d=1.0:1.0:6.0:6.0")
            if (Wu, Hu) != (W0, H0):  fallback.append(f"scale={Wu}:{Hu}:flags={sc_flag}")
            if sharpen and sharpen > 0: fallback.append("unsharp=5:5:0.4:5:5:0.0")
            if (Wc, Hc) != (Wu, Hu):   fallback.append(f"scale={Wc}:{Hc}:flags={sc_flag}")
            if aspect_mode == "fit" and (Wc, Hc) != (Wt, Ht):
                fallback.append(f"pad={Wt}:{Ht}:(ow-iw)/2:(oh-ih)/2:{pad_color}")
            elif aspect_mode == "fill" and (Wc, Hc) != (Wt, Ht):
                fallback.append(f"crop={Wt}:{Ht}:(in_w-out_w)/2:(in_h-out_h)/2")
            elif aspect_mode == "stretch" and (Wc, Hc) != (Wt, Ht):
                fallback.append(f"scale={Wt}:{Ht}:flags={sc_flag}")
            if fps_out and int(fps_out) != int(fps_in):
                fallback.append(f"minterpolate=fps={int(fps_out)}")
            fallback.append("format=yuv420p")

            cmd2 = cmd[:]
            cmd2[cmd2.index("-vf")+1] = ",".join(fallback)
            subprocess.run(cmd2, check=True)

        if gen_id:
            genbus.progress(gen_id, "encode_complete", 1, 1)

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        
# --------------------------------------------------------------------
# Robust frame extractor for Diffusers video outputs (Wan/LTX/etc.)
# --------------------------------------------------------------------
def _extract_frames(output) -> list[Image.Image]:
    """
    Returns a flat list[Image] from various pipeline outputs.
    Handles:
      - output.frames -> [list[Image]] or list[Image]
      - output.images -> list[Image]
      - output.videos (tensor BxTxCxHxW or TxCxHxW)
      - dict-like variants with 'frames'/'images'/'videos'
    """
    def _to_pil(x):
        if isinstance(x, Image.Image):
            return x.convert("RGB")
        arr = np.asarray(x)
        if arr.ndim == 3 and arr.shape[0] in (1,3,4):  # CxHxW -> HxWxC
            arr = np.moveaxis(arr, 0, -1)
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        if arr.ndim == 2:
            arr = np.stack([arr]*3, axis=-1)
        if arr.shape[-1] == 4:
            arr = arr[..., :3]
        return Image.fromarray(arr, "RGB")

    obj = output
    # attribute access (Diffusers PipelineOutput)
    if hasattr(obj, "frames"):
        fr = obj.frames
        if isinstance(fr, (list, tuple)) and fr and isinstance(fr[0], (list, tuple)):
            fr = fr[0]  # unwrap [ [PIL,...] ]
        return [_to_pil(f) for f in fr]
    if hasattr(obj, "images"):
        return [_to_pil(f) for f in obj.images]
    if hasattr(obj, "videos"):
        vid = obj.videos  # tensor or np
        arr = np.array(vid)
        if arr.ndim == 5:   # B,T,C,H,W
            arr = arr[0]    # T,C,H,W
        if arr.ndim == 4:   # T,C,H,W
            return [_to_pil(arr[t]) for t in range(arr.shape[0])]
    # dict-like
    if isinstance(obj, dict):
        for k in ("frames", "images", "videos"):
            if k in obj:
                return _extract_frames(type("X",(object,),{k:obj[k]})())
    raise RuntimeError("Unable to extract frames from pipeline output")

def _img_b64_to_pil(b64: str) -> Image.Image:
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")

# ------------------------------ Generation: SDXL (intermediate) ---------------
@app.route("/image/intermediate", methods=["POST"])
def image_intermediate_sdxl():
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

    gen_id = genbus.new("sdxl_intermediate", {"endpoint": "/image/intermediate", "prompt": prompt})

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
            base = StableDiffusionXLPipeline.from_pretrained(
                str(repo_local_dir(SDXL_BASE_REPO)),
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16",
                local_files_only=True,
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
            genbus.progress(gen_id, "base_sampling", int(step), steps_base)

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

        refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            str(repo_local_dir(SDXL_REFINER_REPO)),
            text_encoder_2=getattr(base, "text_encoder_2", None),
            vae=getattr(base, "vae", None),
            torch_dtype=dtype,
            use_safetensors=True,
            variant="fp16",
            local_files_only=True,
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
            genbus.progress(gen_id, "refine_sampling", int(step), steps_ref)

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

# ------------------------------ Generation: SDXL Turbo ------------------------
@app.route("/image/turbo", methods=["POST"])
def image_turbo_sdxl():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    steps = int(data.get("steps", 3))
    cb_steps = int(data.get("callback_steps", 1))
    auto_dl = bool(data.get("auto_download", False))
    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    guard = _repos_ready_or_resp(SDXL_TURBO_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("sdxl_turbo")
            return jsonify(_json_sanitize(started["json"])), started["http_status"]
        return guard

    gen_id = genbus.new("sdxl_turbo", {"endpoint": "/image/turbo", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        dtype = DeviceManager.get_dtype(device)
        pipe = AutoPipelineForText2Image.from_pretrained(
            str(repo_local_dir(SDXL_TURBO_REPO)), torch_dtype=dtype, variant="fp16", local_files_only=True
        ).to(device)

        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), steps)

        image = pipe(
            prompt=prompt, num_inference_steps=steps, guidance_scale=1.0,
            callback=cb, callback_steps=max(1, cb_steps)
        ).images[0]

        buf = BytesIO(); _apply_watermark(image).save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": generation_url()})), 201
    except Exception as e:
        logger.exception("SDXL turbo failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()

# ------------------------------ FLUX: Krea (t2i) ------------------------------
@app.route("/image/quality", methods=["POST"])
def image_quality_flux_krea():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    h = int(data.get("height", 512)); w = int(data.get("width", 768))
    steps = int(data.get("steps", 4))
    cb_steps = int(data.get("callback_steps", 1))
    auto_dl = bool(data.get("auto_download", False))
    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400

    guard = _ensure_files_present_or_start("flux_krea", auto_download=auto_dl)
    if guard: return guard

    from diffusers import FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig

    gen_id = genbus.new("flux_krea", {"endpoint": "/image/quality", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        compute_dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        transformer = FluxTransformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_KREA_GGUF_NAME),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            torch_dtype=compute_dtype,
        ).to(device)

        pipe = FluxPipeline.from_pretrained(
            str(repo_local_dir(FLUX_KREA_REPO)),
            transformer=transformer,
            torch_dtype=compute_dtype,
            local_files_only=True,
        ).to(device)

        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), steps)

        image = pipe(
            prompt=prompt,
            guidance_scale=0.0,
            height=h, width=w,
            num_inference_steps=steps,
            callback=cb,
            callback_steps=max(1, cb_steps),
        ).images[0]

        buf = BytesIO(); _apply_watermark(image).save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize({
            "prompt": prompt,
            "image": b64,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("FLUX Krea generation failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()

# ----------------------- FLUX Kontext (image -> image) ------------------------
@app.route("/image/image/quality", methods=["POST"])
def image_kontext_i2i():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    image_b64 = (data.get("image_base64") or "").strip()
    image_url  = (data.get("image_url") or "").strip()
    h = int(data.get("height", 512)); w = int(data.get("width", 768))
    steps = int(data.get("steps", 6)); cb_steps = int(data.get("callback_steps", 1))
    strength = float(data.get("strength", 0.5))
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify(_json_sanitize({"error": "Prompt is required"})), 400
    if not image_b64 and not image_url:
        return jsonify(_json_sanitize({"error": "Provide 'image_base64' or 'image_url'"})), 400

    guard = _ensure_files_present_or_start("flux_kontext", auto_download=auto_dl)
    if guard: return guard

    from diffusers import FluxImg2ImgPipeline, FluxTransformer2DModel, GGUFQuantizationConfig
    from diffusers.utils import load_image

    gen_id = genbus.new("flux_kontext", {"endpoint": "/image/kontext", "w": w, "h": h, "steps": steps})
    try:
        device = DeviceManager.get_device()
        compute_dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        transformer = FluxTransformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_KONTEXT_GGUF_NAME),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            torch_dtype=compute_dtype,
        ).to(device)

        pipe = FluxImg2ImgPipeline.from_pretrained(
            str(repo_local_dir(FLUX_KONTEXT_REPO)),
            transformer=transformer,
            torch_dtype=compute_dtype,
            local_files_only=True,
        ).to(device)

        init_img = load_image(image_url).convert("RGB") if image_url else _img_b64_to_pil(image_b64)
        init_img = preprocess_image(init_img)

        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), steps)

        out = pipe(
            prompt=prompt,
            image=init_img,
            strength=strength,
            height=h, width=w,
            num_inference_steps=steps,
            callback=cb,
            callback_steps=max(1, cb_steps),
        ).images[0]

        buf = BytesIO(); _apply_watermark(out).save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify(_json_sanitize({
            "prompt": prompt,
            "image": encoded,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("Kontext i2i failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()

# ------------------------------ VAE / Helpers for LTX -------------------------

def _round_hw_for_vae(h, w, ratio=8):
    return h - (h % ratio), w - (w % ratio)

def enhance_and_interpolate_video(
    in_path: str,
    out_path: str,
    target_fps: int = 24,
    upscale: float = 1.5,        # 1.0 = keep size, 1.5–2.0 = upscale
    scaler: str = "lanczos",     # lanczos|spline|bicubic|bilinear
    crf: int = 18,               # visually-lossless-ish x264
    preset: str = "slow",
    add_grain: float = 0.0,      # 0.0–0.2 looks natural if you used heavy denoise
    sharpen: float = 0.6,        # 0.0–1.5; unsharp strength
    deband: bool = True,         # fix banding from CRF 40 pre-pass
):
    """
    Spatial clean-up + upscale + 24fps interpolation + high-quality encode.
    Produces yuv420p MP4 with faststart.
    """
    ffmpeg = get_ffmpeg_binary_path()

    # Make sure final dims stay even for yuv420p
    vf_parts = [
        # optional upscale
        f"scale=trunc(iw*{upscale}/2)*2:trunc(ih*{upscale}/2)*2:flags={scaler}" if upscale and upscale != 1.0 else None,
        # mild denoise/deband to hide compression ringing/banding
        "gradfun=20:30" if deband else None,              # deband (very safe)
        # tiny sharpen to restore edges; second triplet is chroma
        f"unsharp=5:5:{sharpen}:5:5:0" if sharpen and sharpen > 0 else None,
        # optional fine grain to make it look less 'plastic'
        (f"noise=alls={add_grain*10}:allf=t" if add_grain and add_grain > 0 else None),
        # motion-compensated interpolation to 24 fps
        f"minterpolate=fps={int(target_fps)}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
    ]
    vf = ",".join([p for p in vf_parts if p])

    cmd = [
        ffmpeg, "-y",
        "-i", in_path,
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", str(int(crf)),
        "-preset", preset,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out_path,
    ]

    # Run; if anything fails, surface a readable error
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg enhance/interpolate failed: {e}")

# ---- LTX spatial upscaler (cached) ----
_ltx_upscaler_pipe = None

def _get_ltx_spatial_upscaler():
    """
    Tries the dedicated LTX upscaler pipeline first; falls back to AutoPipelineForImage2Image.
    Uses the local repo 'linoyts/LTX-Video-spatial-upscaler-0.9.8' you already fetch.
    """
    global _ltx_upscaler_pipe
    if _ltx_upscaler_pipe is not None:
        return _ltx_upscaler_pipe

    device = DeviceManager.get_device()
    if device.type == "mps":
        compute_dtype = torch.float16
    elif device.type == "cuda":
        compute_dtype = torch.bfloat16
    else:
        compute_dtype = torch.float32

    up_root = repo_local_dir(LTX_UPSAMPLER_REPO)

    # Prefer a purpose-built pipeline if available in your diffusers build
    try:
        from diffusers import LTXVideoSpatialUpscalerPipeline
        pipe = LTXVideoSpatialUpscalerPipeline.from_pretrained(
            str(up_root),
            torch_dtype=compute_dtype,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)
    except Exception:
        from diffusers import AutoPipelineForImage2Image
        pipe = AutoPipelineForImage2Image.from_pretrained(
            str(up_root),
            torch_dtype=compute_dtype,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)

    # Memory knobs (safe no-ops if unsupported)
    try: pipe.enable_attention_slicing()
    except Exception: pass
    try: pipe.enable_vae_slicing()
    except Exception: pass
    try: pipe.enable_vae_tiling()
    except Exception: pass

    # VAE in fp32 tends to preserve detail better (ignore errors if not supported)
    try: pipe.vae.to(device=device, dtype=torch.float32)
    except Exception: pass

    _ltx_upscaler_pipe = pipe
    return pipe

def _ltx_spatial_upscale_frames(
    frames: list[Image.Image],
    scale: float = 2.0,
    steps: int = 12,
    guidance: float = 0.0,     # LTX upscaler is usually unconditional; 0.0 is fine
    strength: float = 0.1,     # 0.0–0.2 sticks closely to the input
    batch_size: int = 6,
    gen_id: str | None = None,
) -> tuple[list[Image.Image], tuple[int,int]]:
    """
    Uses the LTX spatial upscaler repo to enhance frames.
    Returns (upscaled_frames, (W, H)).
    """
    assert frames, "No frames to upscale"
    W0, H0 = frames[0].size

    # Target size (even)
    Wt = max(2, int(W0 * scale)) // 2 * 2
    Ht = max(2, int(H0 * scale)) // 2 * 2

    pipe = _get_ltx_spatial_upscaler()
    out_frames: list[Image.Image] = []

    # Soft pre-resize helps VRAM and avoids over-sharpening
    def _prep(img: Image.Image) -> Image.Image:
        return img.convert("RGB").resize((Wt, Ht), Image.BICUBIC)

    total = len(frames)
    for i in range(0, total, batch_size):
        chunk = frames[i:i+batch_size]
        chunk = [_prep(im) for im in chunk]

        with torch.inference_mode():
            # The upscaler usually ignores text prompt; we pass minimal args for safety.
            res = pipe(
                image=chunk,
                num_inference_steps=int(steps),
                guidance_scale=float(guidance),
                strength=float(strength),
            ).images

        out_frames.extend([im.convert("RGB") for im in res])

        if gen_id:
            genbus.progress(gen_id, "ltx_upscale", min(i + batch_size, total), total)
            socketio.sleep(0)

    return out_frames, (Wt, Ht)

# ------------------------------ LTX Image -> Video ----------------------------
# NEW: Text → Video (Turbo / LTX)
@app.route("/text/video/turbo", methods=["POST"])
def ltx_text_to_video():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, blurry, jittery, distorted")
    H = int(data.get("height", 480))
    W = int(data.get("width", 704))
    frames_count = int(data.get("frames", 161))
    fps = int(data.get("fps", 24))
    steps = int(data.get("steps", 40))
    auto_dl = bool(data.get("auto_download", False))
    seed = data.get("seed", None)
    strength = float(data.get("strength", 0.75))         # ↑ denoise for motion (0.65–0.85 is a good band)
    guidance = float(data.get("guidance_scale", 5))    # ↓ CFG (2.0–3.5)
    seed_in   = data.get("seed", None)
    seed_strategy = (data.get("seed_strategy") or "random").lower()
    per_frame = bool(data.get("per_frame_seed", True))   # seed drift per frame by default
    motionfix = bool(data.get("motionfix", True))        # on by default
    jpeg_q    = int(data.get("jpeg_quality", 65))
    noise_std = float(data.get("jpeg_gauss_std", 0.66))
    ffmpeg_roundtrip = bool(data.get("ffmpeg_roundtrip", True))
    ffmpeg_crf       = int(data.get("ffmpeg_crf", 40))        # “around 40”
    downscale_factor = float(data.get("downscale_factor", 0.5))
    down_filter      = (data.get("down_filter") or "bicubic") # or "bilinear"
    up_filter        = (data.get("up_filter") or "bicubic")

    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400

    guard = _ensure_files_present_or_start("ltx_video", auto_download=auto_dl)
    if guard:
        return guard

    # LTX likes multiples of 8
    H, W = _round_hw_for_vae(H, W, ratio=8)

    gen_id = genbus.new("ltx_t2v", {
        "endpoint": "/text/video/turbo",
        "w": W, "h": H, "frames": frames_count, "fps": fps
    })

    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400

    guard = _ensure_files_present_or_start("ltx_video", auto_download=auto_dl)
    if guard: return guard

    H, W = _round_hw_for_vae(H, W, ratio=8)

    gen_id = genbus.new("ltx_i2v", {"endpoint": "/image/video/turbo", "w": W, "h": H, "frames": frames_count, "fps": fps})

    try:
        device = DeviceManager.get_device()
        base_root = repo_local_dir(LTX_REPO)
        
        genbus.progress(gen_id, "Loading models...", 0, 2)

        pipe = LTXPipeline.from_pretrained(
            str(base_root),
            torch_dtype=torch.float32,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)

        generator = None
        if isinstance(seed, int):
            generator = torch.Generator(device=device).manual_seed(seed)

        genbus.progress(gen_id, "Generating video...", 1, 2)
        head_burn_in = 12  # ~0.5s @ 24fps
        out = pipe(
            prompt=prompt,
            negative_prompt=neg,
            width=W,
            height=H,
            num_frames=frames_count + head_burn_in,
            num_inference_steps=steps,
            generator=generator,
        )

        frames = out.frames[0] if hasattr(out, "frames") else out
        if not isinstance(frames, (list, tuple)):
            frames = [frames]

        # frames = _apply_watermark_frames(frames)

        genbus.progress(gen_id, "Encoding video...", 2, 2)
        out_name = f"ltx_{int(time.time())}.mp4"
        out_path = os.path.join(os.getcwd(), out_name)
        # _write_video_h264_safe(out_path, frames, fps=fps, gen_id=gen_id, target_size=(W, H))
        _write_video_h264_safe_interpolated(
            out_path, out, fps_in=fps, target_size=(W, H),
            fps_out=24, upscale=2, scaler="lanczos", aspect_mode="fill", 
            crf=20, preset="slow", add_grain=0.25, sharpen=0.75, deband=True, gen_id=gen_id, trim_head_frames=head_burn_in
        )
        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify(_json_sanitize({"ok": True, "video_path": out_path, "generation_websocket_url": generation_url()})), 201

    except Exception as e:
        logger.exception("LTX image->video failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()
        
def _motionfix_preprocess(img: Image.Image, jpeg_q=35, noise_std=3.0) -> Image.Image:
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
    crf: int = 40,
    downscale: float = 0.5,
    down_filter: str = "bicubic",   # "bicubic" or "bilinear"
    up_filter: str = "bicubic",     # "bicubic" or "bilinear"
) -> Image.Image:
    """
    Downscale -> H.264 CRF encode -> decode -> upscale back to (target_w,target_h) via ffmpeg.
    Returns a PIL.Image. Uses yuv420p and keeps even dimensions for H.264.
    """
    ffmpeg = get_ffmpeg_binary_path()

    # input dims
    iw, ih = img.size

    # compute downscaled (must be even for h264)
    dw = max(2, int(iw * downscale) // 2 * 2)
    dh = max(2, int(ih * downscale) // 2 * 2)

    # ensure target dims are even
    tw = max(2, int(target_w) // 2 * 2)
    th = max(2, int(target_h) // 2 * 2)

    # ffmpeg scale flag mapping
    def _flag(x: str) -> str:
        x = (x or "").lower()
        return "bilinear" if x.startswith("bilin") else "bicubic"

    down_flag = _flag(down_filter)
    up_flag   = _flag(up_filter)

    # stage to temp directory
    tmp_dir = Path(MODEL_DIR) / f"fxrt_{int(time.time()*1000)}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    in_png   = tmp_dir / "in.png"
    mid_mp4  = tmp_dir / "mid.mp4"
    out_png  = tmp_dir / "out.png"

    try:
        img.convert("RGB").save(in_png, "PNG")

        # 1) downscale + h264 encode (CRF ~ 40)
        #    -pix_fmt yuv420p requires even dims; we enforced that above
        cmd1 = [
            ffmpeg, "-y",
            "-i", str(in_png),
            "-vf", f"scale={dw}:{dh}:flags={down_flag}",
            "-c:v", "libx264",
            "-crf", str(int(crf)),
            "-preset", "veryfast",
            "-tune", "stillimage",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(mid_mp4),
        ]
        subprocess.run(cmd1, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 2) decode and upscale back to target
        cmd2 = [
            ffmpeg, "-y",
            "-i", str(mid_mp4),
            "-vf", f"scale={tw}:{th}:flags={up_flag}",
            "-frames:v", "1",
            str(out_png),
        ]
        subprocess.run(cmd2, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        out = Image.open(out_png).convert("RGB")
        return out

    except Exception as e:
        logger.warning(f"[ffmpeg_roundtrip] Falling back to original image: {e}")
        return img

    finally:
        try:
            for p in (in_png, mid_mp4, out_png):
                if p.exists(): p.unlink()
            tmp_dir.rmdir()
        except Exception:
            pass

def center_crop_to_aspect(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """
    Center-crop `img` to match the aspect ratio target_w:target_h (no resize here).
    Returns a new PIL.Image with the same resolution as input but cropped to the ratio.
    """
    w, h = img.size
    if w <= 0 or h <= 0:
        return img

    target_ar = float(target_w) / float(target_h)
    src_ar = float(w) / float(h)

    if abs(src_ar - target_ar) < 1e-6:
        return img  # already the right ratio

    if src_ar > target_ar:
        # too wide -> crop width
        new_w = int(round(h * target_ar))
        left = (w - new_w) // 2
        box = (left, 0, left + new_w, h)
    else:
        # too tall -> crop height
        new_h = int(round(w / target_ar))
        top = (h - new_h) // 2
        box = (0, top, w, top + new_h)

    return img.crop(box)
        
@app.route("/image/video/turbo", methods=["POST"])
def ltx_image_to_video():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, blurry, jittery, distorted")
    H = int(data.get("height", 480))
    W = int(data.get("width", 704))
    frames_count = int(data.get("frames", 161))
    fps = int(data.get("fps", 24))
    steps = int(data.get("steps", 40))
    auto_dl = bool(data.get("auto_download", False))
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    seed = data.get("seed", None)
    strength = float(data.get("strength", 0.75))         # ↑ denoise for motion (0.65–0.85 is a good band)
    guidance = float(data.get("guidance_scale", 5))    # ↓ CFG (2.0–3.5)
    seed_in   = data.get("seed", None)
    seed_strategy = (data.get("seed_strategy") or "random").lower()
    per_frame = bool(data.get("per_frame_seed", True))   # seed drift per frame by default
    motionfix = bool(data.get("motionfix", True))        # on by default
    jpeg_q    = int(data.get("jpeg_quality", 65))
    noise_std = float(data.get("jpeg_gauss_std", 0.66))
    ffmpeg_roundtrip = bool(data.get("ffmpeg_roundtrip", True))
    ffmpeg_crf       = int(data.get("ffmpeg_crf", 40))        # “around 40”
    downscale_factor = float(data.get("downscale_factor", 0.5))
    down_filter      = (data.get("down_filter") or "bicubic") # or "bilinear"
    up_filter        = (data.get("up_filter") or "bicubic")
    
    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400
    if not image_b64 and not image_url:
        return jsonify(_json_sanitize({"error": "Provide 'image_base64' or 'image_url'"})), 400

    guard = _ensure_files_present_or_start("ltx_video", auto_download=auto_dl)
    if guard: return guard

    H, W = _round_hw_for_vae(H, W, ratio=8)

    gen_id = genbus.new("ltx_i2v", {"endpoint": "/image/video/turbo", "w": W, "h": H, "frames": frames_count, "fps": fps})

    try:
        device = DeviceManager.get_device()
        base_root = repo_local_dir(LTX_REPO)
        
        genbus.progress(gen_id, "Loading models...", 0, 2)

        pipe = LTXImageToVideoPipeline.from_pretrained(
            str(base_root),
            torch_dtype=torch.float32,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)

        if image_url:
            init_img = load_image(image_url).convert("RGB")
        else:
            raw = base64.b64decode(image_b64)
            init_img = Image.open(io.BytesIO(raw)).convert("RGB")
            
        init_img = center_crop_to_aspect(init_img, W, H)
            
        if ffmpeg_roundtrip:
            init_img = _ffmpeg_h264_roundtrip(
                init_img,
                target_w=W,
                target_h=H,
                crf=ffmpeg_crf,
                downscale=downscale_factor,
                down_filter=down_filter,
                up_filter=up_filter,
            )
            
        if motionfix:
            init_img = _motionfix_preprocess(init_img, jpeg_q=jpeg_q, noise_std=noise_std)

        generator = None
        if isinstance(seed, int):
            generator = torch.Generator(device=device).manual_seed(seed)
            
        if motionfix:
            try:
                pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config(pipe.scheduler.config)
                # helpful toggles if available in your diffusers version:
                try: setattr(pipe.scheduler, "use_karras_sigmas", True)
                except Exception: pass
                try: setattr(pipe.scheduler, "timestep_spacing", "trailing")
                except Exception: pass
            except Exception as e:
                logger.info(f"[LTX] Keep default scheduler (couldn't switch): {e}")
                
        init_img = init_img.resize((W, H), Image.BICUBIC)

        genbus.progress(gen_id, "Generating video...", 1, 2)
        out = pipe(
            image=init_img,
            prompt=prompt,
            negative_prompt=neg,
            width=W,
            height=H,
            num_frames=frames_count,
            num_inference_steps=steps,
            generator=generator,
            guidance_scale=guidance,
        )

        frames = out.frames[0] if hasattr(out, "frames") else out
        if not isinstance(frames, (list, tuple)):
            frames = [frames]

        # frames = _apply_watermark_frames(frames)

        genbus.progress(gen_id, "Encoding video...", 2, 2)
        out_name = f"ltx_{int(time.time())}.mp4"
        out_path = os.path.join(os.getcwd(), out_name)
        # _write_video_h264_safe(out_path, frames, fps=fps, gen_id=gen_id, target_size=(W, H))
        _write_video_h264_safe_interpolated(
            out_path, out, fps_in=fps, target_size=(W, H),
            fps_out=24, upscale=2, scaler="lanczos", aspect_mode="fill", 
            crf=20, preset="slow", add_grain=0.25, sharpen=0.75, deband=True, gen_id=gen_id
        )
        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify(_json_sanitize({"ok": True, "video_path": out_path, "generation_websocket_url": generation_url()})), 201

    except Exception as e:
        logger.exception("LTX image->video failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()

def _load_video_local_ffmpeg(video_path: str, limit: int) -> List[Image.Image]:
    """
    Minimal local video loader using the existing bundled ffmpeg.
    Replicates `load_video(path)[:limit]` semantics:
      - decodes frames with ffmpeg
      - collects up to `limit` frames as RGB PIL Images
      - cleans up temp files
    """
    ffmpeg = get_ffmpeg_binary_path()
    tmp_dir = Path(MODEL_DIR) / f"tmp_vread_{int(time.time())}_{os.getpid()}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # -vsync vfr keeps variable frame rate faithful; -frames:v caps the total frames
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-y", "-i", video_path,
            "-vsync", "vfr",
            "-frames:v", str(max(1, limit)),
            str(tmp_dir / "%05d.png"),
        ]
        subprocess.run(cmd, check=True)

        # Read back as PIL (RGB), preserve order, and apply the same slice [:limit]
        frames: List[Image.Image] = []
        for p in sorted(tmp_dir.glob("*.png"))[:limit]:
            with Image.open(p) as im:
                frames.append(im.convert("RGB"))

        if not frames:
            raise RuntimeError("No frames decoded from local video.")

        return frames
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

@app.route("/video/video/turbo", methods=["POST"])
def ltx_video_to_video():
    """
    LTX Video→Video refinement.
    Input: video_base64 | video_url | video_path
    Tunables: frames, max_area, steps, guidance, strength, fps_out, seed
    """
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, blurry, jittery, distorted")
    H = int(data.get("height", 480))
    W = int(data.get("width", 704))
    frames_count = int(data.get("frames", 161))
    fps = int(data.get("fps", 24))
    steps = int(data.get("steps", 40))
    auto_dl = bool(data.get("auto_download", False))
    video_path = (data.get("video_path") or "").strip()
    seed = data.get("seed", None)
    strength = float(data.get("strength", 0.75))         # ↑ denoise for motion (0.65–0.85 is a good band)
    guidance = float(data.get("guidance_scale", 5))    # ↓ CFG (2.0–3.5)
    seed_in   = data.get("seed", None)
    seed_strategy = (data.get("seed_strategy") or "random").lower()
    per_frame = bool(data.get("per_frame_seed", True))   # seed drift per frame by default
    motionfix = bool(data.get("motionfix", True))        # on by default
    jpeg_q    = int(data.get("jpeg_quality", 65))
    noise_std = float(data.get("jpeg_gauss_std", 0.66))
    ffmpeg_roundtrip = bool(data.get("ffmpeg_roundtrip", True))
    ffmpeg_crf       = int(data.get("ffmpeg_crf", 40))        # “around 40”
    downscale_factor = float(data.get("downscale_factor", 0.5))
    down_filter      = (data.get("down_filter") or "bicubic") # or "bilinear"
    up_filter        = (data.get("up_filter") or "bicubic")
    
    video_path = str(MODEL_DIR / "video.mp4")
    
    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400
    if not video_path:
        return jsonify(_json_sanitize({"error": "Provide 'video_path'"})), 400

    guard = _ensure_files_present_or_start("ltx_video", auto_download=auto_dl)
    if guard: return guard

    H, W = _round_hw_for_vae(H, W, ratio=8)

    gen_id = genbus.new("ltx_i2v", {"endpoint": "/video/video/turbo", "w": W, "h": H, "frames": frames_count, "fps": fps})

    try:
        device = DeviceManager.get_device()
        base_root = repo_local_dir(LTX_REPO)
        
        genbus.progress(gen_id, "Loading models...", 0, 2)

        pipe = DiffusionPipeline.from_pretrained(
            str(base_root),
            custom_pipeline="stg_ltx_condition",
            torch_dtype=torch.float32,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)
        
        try:
            from diffusers.schedulers import FlowMatchEulerDiscreteScheduler
            if isinstance(pipe.scheduler, FlowMatchEulerDiscreteScheduler):
                pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config(
                    pipe.scheduler.config,
                    use_dynamic_shifting=False
                )
            else:
                # Fallback for scheduler subclasses
                pipe.scheduler = type(pipe.scheduler).from_config(
                    pipe.scheduler.config,
                    use_dynamic_shifting=False
                )
        except Exception:
            # Older diffusers: in-place update
            try:
                pipe.scheduler.register_to_config(use_dynamic_shifting=False)
            except Exception:
                pass        
        
        video = _load_video_local_ffmpeg(video_path, 21)
        condition1 = LTXVideoCondition(video=video, frame_index=0)

        generator = None
        if isinstance(seed, int):
            generator = torch.Generator(device=device).manual_seed(seed)

        genbus.progress(gen_id, "Generating video...", 1, 2)
        out = pipe(
            conditions=[condition1],
            prompt=prompt,
            negative_prompt=neg,
            width=W,
            height=H,
            num_frames=frames_count,
            num_inference_steps=30,
            decode_timestep=0.05,
            decode_noise_scale=0.025,
            image_cond_noise_scale=0.0,
            guidance_scale=5.0,
            guidance_rescale=0.7,
            generator=generator,
            stg_applied_layers_idx=[9,10,11],  # last blocks (good default)
            stg_scale=0.6,                     # motion / strength (0.4–0.8 good range)
            do_rescaling=True,                 # recommended
        )

        frames = out.frames[0] if hasattr(out, "frames") else out
        if not isinstance(frames, (list, tuple)):
            frames = [frames]

        # frames = _apply_watermark_frames(frames)

        genbus.progress(gen_id, "Encoding video...", 2, 2)
        
        out_name = f"ltx_{int(time.time())}.mp4"
        out_path = os.path.join(os.getcwd(), out_name)
        _write_video_h264_safe(out_path, frames, fps=fps, gen_id=gen_id, target_size=(W, H))
        
        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify(_json_sanitize({"ok": True, "video_path": out_path, "generation_websocket_url": generation_url()})), 201

    except Exception as e:
        logger.exception("LTX video->video failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        DeviceManager.free_memory()

        
# ------------------- WAN Image -> Video ----------------------------

def preprocess_image(img: Image.Image, quality=25, noise_std=2.5):
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality)
    buf.seek(0)
    compressed = Image.open(buf).convert('RGB')
    arr = np.array(compressed).astype(np.float32)
    noise = np.random.normal(scale=noise_std, size=arr.shape)
    noisy = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(noisy)

@app.route("/image/video/quality", methods=["POST"])
def wan_image_to_video():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, inconsistent motion, blur, jitter, distorted")
    if not prompt:
        return jsonify(_json_sanitize({"error": "Missing 'prompt'"})), 400

    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    if not image_b64 and not image_url:
        return jsonify(_json_sanitize({"error": "Provide 'image_base64' or 'image_url'"})), 400

    max_area = int(data.get("max_area", 480 * 832))
    frames   = int(data.get("frames", 81))
    steps    = int(data.get("steps", 30))
    fps      = int(data.get("fps", 16))
    guidance = float(data.get("guidance_scale", 5.0))
    seed     = data.get("seed", None)
    auto_dl  = bool(data.get("auto_download", False))

    gen_id = genbus.new("wan_i2v", {"endpoint": "/image/video/quality", "frames": frames, "fps": fps})
    genbus.progress(gen_id, "Verifying install...", 1, 5)

    # Make sure the repo + 3 single files are present locally (Comfy diffusion/vae/t5).
    guard = _ensure_files_present_or_start("wan_video", auto_download=auto_dl)
    if guard: 
        return guard

    try:
        # Device + dtypes: keep VAE in float32 for quality; rest depends on hardware
        device = DeviceManager.get_device()
        if device.type == "mps":
            compute_dtype = torch.float16
        elif device.type == "cuda":
            compute_dtype = torch.bfloat16
        else:
            compute_dtype = torch.float32

        base_root = repo_local_dir(WAN_DIFFUSERS_REPO)  # Wan-AI/Wan2.2-TI2V-5B-Diffusers (local)

        genbus.progress(gen_id, "Loading models...", 2, 5)

        # ---- Which noise variant?
        noise_variant = (data.get("noise_variant") or data.get("noise") or "low").strip().lower()
        gguf_name = WAN22_HIGH_GGUF_NAME if noise_variant in ("high", "h", "highnoise", "high_noise") else WAN22_LOW_GGUF_NAME

        base_root = repo_local_dir(WAN_DIFFUSERS_REPO)  # Wan-AI/Wan2.2-I2V-A14B-Diffusers (local)
        tr_cfg = base_root / "transformer" / "config.json"
        vae_cfg = base_root / "vae" / "config.json"

        # ---- Transformer (Diffusers 3D) from GGUF
        transformer = WanTransformer3DModel.from_single_file(
            str(MODEL_DIR / gguf_name),
            config=str(tr_cfg),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            torch_dtype=compute_dtype,
            local_files_only=True,
        ).to(device)

        # ---- VAE from Wan 2.1 (fp32/16 okay, keep fp32 on CPU if you want to save VRAM)
        vae = AutoencoderKLWan.from_single_file(
            str(MODEL_DIR / WAN21_VAE_NAME),
            config=str(vae_cfg),
            torch_dtype=compute_dtype,      # for max quality you can force torch.float32
            local_files_only=True,
            low_cpu_mem_usage=False,
            ignore_mismatched_sizes=True,
        )
        # Optionally keep VAE on CPU for VRAM savings (slower, but lighter):
        if os.getenv("WAN_VAE_ON_CPU", "0") == "1":
            vae = vae.to("cpu")
        else:
            vae = vae.to(device)

        # ---- Text encoder from the A14B diffusers repo (no GGUF needed here)
        #     You can force it to CPU to minimize VRAM:
        t5_device = torch.device("cpu") if os.getenv("WAN_T5_ON_CPU", "1") == "1" else device
        text_encoder = T5EncoderModel.from_pretrained(
            str(base_root / "text_encoder"),
            torch_dtype=(torch.float16 if t5_device.type != "cpu" else torch.float32),
            local_files_only=True,
        ).to(t5_device)

        # ---- Build pipeline (scheduler/tokenizer come from the repo on disk)
        pipe = WanImageToVideoPipeline.from_pretrained(
            str(base_root),
            transformer=transformer,
            vae=vae,
            text_encoder=text_encoder,
            torch_dtype=compute_dtype,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)

        # Keep VAE in float32 explicitly (important for quality)
        # try:
        #     pipe.vae.to(device=device, dtype=torch.float32)
        # except Exception:
        #     pass

        # Light memory knobs for MPS only
        if device.type == "mps":
            try: pipe.enable_attention_slicing()
            except Exception: pass
            try: pipe.enable_vae_slicing()
            except Exception: pass
            try: pipe.enable_vae_tiling()
            except Exception: pass

        # ---- Prepare input image
        if image_url:
            init_img = load_image(image_url).convert("RGB")
        else:
            raw = base64.b64decode(image_b64)
            init_img = Image.open(io.BytesIO(raw)).convert("RGB")

        # Round size to model-friendly multiples (use your helper with ratio=8)
        aspect = init_img.height / init_img.width
        mod = getattr(pipe, "vae_scale_factor_spatial", 8) * getattr(pipe.transformer.config, "patch_size", [1, 8])[1]
        h = int(np.sqrt(max_area * aspect)) // mod * mod
        w = int(np.sqrt(max_area / aspect)) // mod * mod
        h, w = _round_hw_for_vae(h, w, ratio=8)
        init_img = init_img.resize((w, h), Image.BICUBIC)

        generator = None
        if isinstance(seed, int):
            generator = torch.Generator(device=device).manual_seed(seed)

        # ---- Generate video frames
        genbus.progress(gen_id, "Generating video...", 3, 5)
        out = pipe(
            image=init_img,
            prompt=prompt,
            negative_prompt=neg,
            height=h, width=w,
            num_frames=frames,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator,
        )

        frames = getattr(out, "frames", None)
        if isinstance(frames, list) and len(frames) and isinstance(frames[0], list):
            frames = frames[0]
        if not isinstance(frames, (list, tuple)) or len(frames) == 0:
            raise RuntimeError("WAN pipeline returned no frames")

        genbus.progress(gen_id, "Applying watermark...", 4, 5)
        frames = _apply_watermark_frames(frames)

        genbus.progress(gen_id, "Encoding video...", 4, 5)
        out_path = os.path.join(os.getcwd(), f"wan_{int(time.time())}.mp4")
        _write_video_h264_safe(out_path, frames, fps=fps, gen_id=gen_id, target_size=(w, h))

        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify(_json_sanitize({
            "ok": True,
            "video_path": out_path,
            "generation_websocket_url": generation_url()
        })), 201

    except Exception as e:
        logger.exception("Wan i2v failed")
        genbus.error(gen_id, str(e))
        return jsonify(_json_sanitize({"error": str(e)})), 500
    finally:
        try: DeviceManager.free_memory()
        except Exception: pass

# PART 5/5

# ------------------------------- Downloads API --------------------------------
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

@app.route("/downloads/retry/<pipeline_id>", methods=["POST"])
def downloads_retry(pipeline_id):
    pl = download_manager.pipelines.get(pipeline_id)
    if not pl:
        return jsonify({"error": "Pipeline not found"}), 404

    # mark old pipeline done/cancelled so UI stops showing it as active
    download_manager.cancel_pipeline(pipeline_id)

    # start a fresh prefetch for the same pipeline name
    started = _start_prefetch_pipeline(pl.pipeline_name)
    payload = started["json"]
    # be explicit in the response so the client can (re)subscribe
    return jsonify({
        "ok": True,
        "pipeline_id": payload.get("pipeline_id"),
        "websocket_url": f"{request.host_url.rstrip('/')}/downloads"
    }), 202

# -------------------------------- Health & root --------------------------------
@app.route("/")
def root():
    return jsonify(_json_sanitize({"message": "BonzAI Media Generation Server", "local_only": LOCAL_ONLY}))

@app.route("/health")
def health():
    return jsonify(_json_sanitize({
        "status": "healthy",
        "device": str(DeviceManager.get_device()),
        "has_hf_token": bool(_hf_token()),
        "local_only": LOCAL_ONLY,
        "model_dir": str(MODEL_DIR),
    }))

logger.info(f"HF_HOME={os.environ.get('HF_HOME')}")
logger.info(f"HF token present? {bool(_hf_token())}")

if __name__ == "__main__":
    logger.info("Starting BonzAI Media Generation Server (eventlet + per-file progress)")
    logger.info(f"Device: {DeviceManager.get_device()}")
    logger.info(f"Model directory: {MODEL_DIR}")
    socketio.run(app, host="0.0.0.0", port=65000, debug=False, use_reloader=False)
