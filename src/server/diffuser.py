#!/usr/bin/env python
# -*- coding: utf-8 -*-
# BonzAI Media Generation Server — eventlet + robust progress
# PART 1/5

from __future__ import annotations

import os, re, gc, io, time, json, base64, logging, threading, hashlib, platform
from io import BytesIO
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

# ---- eventlet MUST be first
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
from fnmatch import fnmatch
import shutil, stat, subprocess

# ---- Hugging Face hub
from huggingface_hub import HfApi, hf_hub_url, snapshot_download
try:
    from huggingface_hub.errors import HfHubHTTPError
except Exception:
    try:
        from huggingface_hub.utils import HfHubHTTPError
    except Exception:
        class HfHubHTTPError(Exception): pass

# ---- Safetensors integrity (best effort)
try:
    from safetensors import safe_open as _safetensors_open  # type: ignore
except Exception:
    _safetensors_open = None
    
from transformers import CLIPVisionModel, T5EncoderModel

# ---- Diffusers (only specific bits)
from diffusers import (
    DiffusionPipeline,
    AutoPipelineForText2Image,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    FlowMatchEulerDiscreteScheduler,
    HunyuanVideoPipeline,
    LTXImageToVideoPipeline,
    LTXConditionPipeline,
    LTXLatentUpsamplePipeline,
    LTXVideoTransformer3DModel,
    AutoencoderKLLTXVideo,
    WanImageToVideoPipeline, 
    AutoencoderKLWan,
    GGUFQuantizationConfig,
)
from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
from diffusers.utils import export_to_video, load_image, load_video
from diffusers.models import AutoencoderKL

# Optional model classes (we probe dynamically for GGUF)
from importlib import import_module

# ------------------------------ Logging & paths ------------------------------
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bonzai-server")

USER_DATA_PATH = user_data_dir("bonzai", "BonzAI")
MODEL_DIR = Path(USER_DATA_PATH) / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Keep HF cache/refs under our models dir
os.environ["HF_HOME"] = str(MODEL_DIR / "hf")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

LOCAL_ONLY = bool(int(os.getenv("BONZAI_LOCAL_ONLY", "1")))

# Safety cap to avoid runaway downloads (default 60 GB)
MAX_REPO_BYTES = int(os.getenv("BONZAI_MAX_REPO_BYTES", str(60 * (1 << 30))))
CHUNK_SIZE = 1 << 20  # 1 MiB

def _hf_token() -> Optional[str]:
    return os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

# ---------------------------- Flask / Socket.IO -------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bonzai-secret-key")
CORS(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    logger=False,
    engineio_logger=False,
    ping_interval=20,
    ping_timeout=30,
)

def socket_emit(event: str, payload: dict, namespace: str):
    socketio.emit(event, payload, namespace=namespace)
    try: socketio.sleep(0)
    except Exception: pass

def _ns_url(ns: str) -> str:
    base = request.host_url.rstrip("/") if request else "http://127.0.0.1:65000"
    return f"{base}/{ns.lstrip('/')}"

def downloads_url() -> str:
    return _ns_url("/downloads")

def generation_url() -> str:
    return _ns_url("/generation")

def _tid_repo(repo_id: str) -> str:
    return hashlib.md5(f"repo:{repo_id}".encode()).hexdigest()[:16]

def _tid_file(repo_id: str, rel_path: str) -> str:
    return hashlib.md5(f"file:{repo_id}:{rel_path}".encode()).hexdigest()[:16]

# ------------------------------ FFmpeg staging -------------------------------
from pathlib import Path as _Path

def _user_bin_dir() -> str:
    d = os.path.join(user_data_dir("bonzai", "BonzAI"), "bin")
    os.makedirs(d, exist_ok=True)
    return d

def _platform_tag():
    system = platform.system().lower()
    arch = {"x86_64":"x64","amd64":"x64","arm64":"arm64","aarch64":"arm64"}.get(platform.machine().lower(), platform.machine().lower())
    if system == "darwin": plat, exe = f"darwin/{arch}", "ffmpeg"
    elif system == "linux": plat, exe = f"linux/{arch}", "ffmpeg"
    elif system == "windows": plat, exe = f"win32/{arch}", "ffmpeg.exe"
    else:
        raise RuntimeError(f"Unsupported platform: {system}/{arch}")
    return plat, exe

def _npm_ffmpeg_source_path() -> str:
    plat, exe = _platform_tag()
    p = os.path.join("node_modules","ffmpeg-static-electron-forge","dist","bin", plat, exe)
    if not os.path.isfile(p):
        raise FileNotFoundError(f"Bundled ffmpeg not found at {p}")
    return p

def _dest_ffmpeg_path() -> str:
    _, exe = _platform_tag()
    return os.path.join(_user_bin_dir(), exe)

def _make_executable_and_clear_quarantine(path: str):
    try:
        st = os.stat(path)
        os.chmod(path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception: pass
    try:
        subprocess.run(["xattr","-dr","com.apple.quarantine", path],
                       check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception: pass

def get_ffmpeg_binary_path() -> str:
    src = _npm_ffmpeg_source_path()
    dst = _dest_ffmpeg_path()
    try:
        need_copy = True
        if os.path.isfile(dst):
            try: need_copy = os.path.getmtime(src) > os.path.getmtime(dst)
            except Exception: need_copy = False
        if need_copy:
            with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
                shutil.copyfileobj(fsrc, fdst, length=1<<20)
    except Exception as e:
        raise RuntimeError(f"Failed to stage ffmpeg to app bin: {e}")

    _make_executable_and_clear_quarantine(dst)
    if not (os.path.isfile(dst) and os.access(dst, os.X_OK)):
        raise PermissionError(f"Staged ffmpeg not executable at {dst}")
    os.environ["IMAGEIO_FFMPEG_EXE"] = dst
    return dst

os.environ["IMAGEIO_FFMPEG_EXE"] = get_ffmpeg_binary_path()

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

# PART 2/5

# ------------------------------ Generation bus --------------------------------
class GenerationTracker:
    def __init__(self): self._meta: Dict[str, Dict[str, Any]] = {}
    def new(self, kind: str, meta: Optional[Dict[str, Any]] = None, gen_id: Optional[str] = None) -> str:
        gid = gen_id or hashlib.md5(f"{kind}_{time.time()}".encode()).hexdigest()[:16]
        self._meta[gid] = {"kind": kind, "meta": meta or {}, "ts": time.time(), "stage": "starting"}
        socket_emit("gen_started", {"generation_id": gid, "kind": kind, "meta": meta or {}}, "/generation")
        socket_emit("gen_progress", {"generation_id": gid, "stage": "queued", "step": 0, "total": 1, "pct": 0}, "/generation")
        return gid
    def progress(self, generation_id: str, stage: str, step: int, total: int):
        pct = round((step / max(total, 1)) * 100.0, 2)
        socket_emit("gen_progress", {"generation_id": generation_id, "stage": stage, "step": int(step), "total": int(total), "pct": pct}, "/generation")
    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        socket_emit("gen_finished", {"generation_id": generation_id, "payload": payload or {}}, "/generation")
        self._meta.pop(generation_id, None)
    def error(self, generation_id: str, message: str):
        socket_emit("gen_error", {"generation_id": generation_id, "error": message}, "/generation")
        self._meta.pop(generation_id, None)

genbus = GenerationTracker()

# --------------------------- WebSocket namespaces -----------------------------
@socketio.on("connect", namespace="/downloads")
def dl_connect(): emit("connected", {"message": "Connected to download progress stream"})
@socketio.on("subscribe", namespace="/downloads")
def dl_subscribe(data):
    data = data or {}
    pipeline_id = data.get("pipeline_id") or data.get("pipelineId")
    if not pipeline_id:
        emit("download_progress", {"pipeline": None}); return
    join_room(pipeline_id)
    pl = download_manager.pipelines.get(pipeline_id)
    emit("download_progress", {"pipeline": pl.to_dict() if pl else None})
@socketio.on("disconnect", namespace="/downloads")
def dl_disconnect(): pass

@socketio.on("connect", namespace="/generation")
def gen_connect(): emit("connected", {"message": "Connected to generation progress"})
@socketio.on("disconnect", namespace="/generation")
def gen_disconnect(): pass

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

class DownloadManager:
    def __init__(self):
        self.pipelines: Dict[str, PipelineDownload] = {}
        self._lock = threading.Lock()
    def emit(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if pl:
            socketio.emit("download_progress", {"pipeline": pl.to_dict()},
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
        if states <= {"completed"}: pl.status = "completed"
        elif "failed" in states and not any(s in states for s in ("pending", "downloading")): pl.status = "failed"
        else: pl.status = "downloading"
        self.emit(pl.pipeline_id)

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
    # Minimal scaffold for Flux pipelines (tokenizers + text encoders + vae + scheduler)
    return [
        "model_index.json",
        "scheduler/**",
        "tokenizer/**",
        "tokenizer_2/**",
        "text_encoder/**",
        "text_encoder_2/**",
        "transformer/**",  # small scaffolding/config; main weights from GGUF
        "vae/**",
    ]
    
def _ltx_patterns_strict() -> List[str]:
    # Fully fetch these subfolders:
    #   scheduler/, text_encoder/, tokenizer/, transformer/, vae/
    # And ONLY these files at repo root:
    #   model_index.json
    #   ltxv-2b-0.9.8-distilled-fp8.safetensors
    #   ltxv-spatial-upscaler-0.9.8.safetensors
    return [
        "model_index.json",
        "ltxv-2b-0.9.8-distilled-fp8.safetensors",
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

def _wan_patterns() -> List[str]:
    return [
        "model_index.json",
        "scheduler/**", "text_encoder/**", "processor/**", "tokenizer/**",
        "transformer/**", "vae/**",
        "**/*.json", "**/*.safetensors", "**/*.bin", "**/*.model", "**/*.txt",
    ]
    
def _wan2_patterns() -> list[str]:
    return [
        "model_index.json",
        "scheduler/**",
        "transformer/**",
        "vae/**",
        "text_encoder/**",
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
    if repo_id == WAN2_1_REPO:
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
    ok = (
        _nonzero(root / f"{name}.json") or
        _nonzero(root / name / "tokenizer.json") or
        (_nonzero(root / f"{name}/vocab.json") and _nonzero(root / f"{name}/merges.txt")) or
        (_nonzero(root / "vocab.json") and _nonzero(root / "merges.txt"))
    )
    if ok: return True
    proc = root / "processor"
    return any(_nonzero(proc / fn) for fn in ("tokenizer.json","spiece.model","sentencepiece.bpe.model","vocab.txt"))

REPO_SPECS = {
    "black-forest-labs/FLUX.1-Krea-dev": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        # We need actual weights for encoders + vae in the local repo
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
        # must exist at the repo root:
        "must_files": [
            "model_index.json",
            "ltxv-2b-0.9.8-distilled-fp8.safetensors",
            "ltxv-spatial-upscaler-0.9.8.safetensors",
        ],
        # tokenizer must be complete enough to pass _tokenizer_ok()
        "must_tokenizers": ["tokenizer"],
        # these dirs must contain actual model weights somewhere inside:
        "must_weight_dirs": ["text_encoder", "transformer", "vae"],
        # these dirs must exist and contain some files (configs/scheduler states):
        "extra_dirs": ["scheduler"],
        "fallback_any_weights": False,  # we’re being strict now
    },
    "linoyts/LTX-Video-spatial-upscaler-0.9.8": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],
        "must_weight_dirs": ["latent_upsampler", "vae"],
    },
    "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],  # text encoder is bundled
        "must_weight_dirs": ["transformer", "vae", "scheduler"],
        "extra_dirs": [],       # adjust if needed
    },
    "Wan-AI/Wan2.2-TI2V-5B-Diffusers": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],  # WAN uses processor/
        "must_weight_dirs": ["transformer", "vae", "text_encoder"],
        "extra_dirs": ["scheduler", "processor"],
        "fallback_any_weights": True,
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
        report["missing"].append("<entire repo>"); return report
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

def _list_required_remote_files(repo_id: str, allow_patterns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    api = HfApi(token=_hf_token())
    files: List[Dict[str, Any]] = []
    def _match(p: str) -> bool:
        return True if not allow_patterns else any(fnmatch(p, pat) for pat in allow_patterns)
    # try list_repo_tree(expand=True)
    try:
        items = api.list_repo_tree(repo_id=repo_id, repo_type="model", revision="main", recursive=True, expand=True)
        for it in items or []:
            if getattr(it, "type", None) == "file" and _match(it.path):
                size = int(getattr(it, "size", 0) or 0)
                files.append({"path": it.path, "size": size})
    except Exception: pass
    if not files:
        try:
            infos = api.get_paths_info(repo_id=repo_id, repo_type="model",
                                       paths=[""], revision="main", expand=True, recursive=True)
            for info in infos or []:
                if getattr(info, "type", "") == "file" and _match(info.path):
                    size = int(getattr(info, "size", 0) or 0)
                    files.append({"path": info.path, "size": size})
        except Exception: pass
    if not files:
        try:
            paths = api.list_repo_files(repo_id=repo_id, repo_type="model", revision="main")
            for p in paths or []:
                if _match(p): files.append({"path": p, "size": 0})
        except Exception: pass

    if not files: return []

    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    def _resolve_remote_size(url: str) -> int:
        try:
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
            clen = int(r.headers.get("content-length", "0") or "0")
            if clen > 0: return clen
        except Exception: pass
        try:
            r = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, stream=True, timeout=30)
            cr = r.headers.get("Content-Range", "")
            m = re.search(r"/(\d+)$", cr)
            if m: return int(m.group(1))
        except Exception: pass
        return 0

    for f in files:
        if f["size"] > 0: continue
        try:
            url = hf_hub_url(repo_id=repo_id, filename=f["path"], repo_type="model", revision="main")
            f["size"] = _resolve_remote_size(url)
        except Exception: pass
    return files

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
        if not _is_valid_safetensors(local_path):
            return FileEntry(rel, int(remote_size or 0), int(lsz or 0), "invalid")
    return FileEntry(rel, int(remote_size or 0), int(lsz or 0), "ok")

def build_repo_inventory(repo_id: str, allow_patterns: Optional[List[str]] = None) -> Dict[str, Any]:
    root = repo_local_dir(repo_id)
    local_spec = _repo_completeness(repo_id)
    manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
    remote_accessible = True
    if not manifest:
        if not local_spec.get("ok", False):
            remote_accessible = False
    files: List[FileEntry] = []
    needs: List[str] = []
    if manifest:
        for f in manifest:
            rel = f["path"]; rsz = int(f.get("size") or 0); lp = root / rel
            fe = _classify_file(rel, rsz, lp)
            files.append(fe)
            if fe.status in ("missing", "incomplete", "invalid"): needs.append(rel)
    else:
        files = []; needs = []
    summary = {
        "total": len(files),
        "ok": sum(1 for x in files if x.status == "ok"),
        "missing": sum(1 for x in files if x.status == "missing"),
        "incomplete": sum(1 for x in files if x.status == "incomplete"),
        "invalid": sum(1 for x in files if x.status == "invalid"),
    }
    if manifest:
        ok = (len(needs) == 0); missing_count = len(needs)
    else:
        ok = bool(local_spec.get("ok", False)); missing_count = 0 if ok else 1
    return {
        "repo": repo_id, "root": str(root), "exists": root.exists(),
        "remote_accessible": remote_accessible,
        "files": [fe.__dict__ for fe in files], "needs": needs,
        "summary": summary, "ok": ok,
        "missing": missing_count if remote_accessible else None,
        "missing_list": local_spec.get("missing", []),
    }

def _repo_readiness(repo_id: str) -> Dict[str, Any]:
    pats = allow_patterns_for_repo(repo_id)
    inv = build_repo_inventory(repo_id, allow_patterns=pats)
    return {
        "repo": inv["repo"], "root": inv["root"], "exists": inv["exists"],
        "ok": bool(inv["ok"]), "missing": inv["missing"], "missing_list": inv["missing_list"],
    }

def _repos_ready_or_resp(*repo_ids: str) -> Optional[tuple]:
    statuses = []; needs_auth = False; any_local_missing = False
    for rid in repo_ids:
        st = _repo_readiness(rid); statuses.append(st)
        if st.get("missing") is None and not st.get("ok", False): needs_auth = True
        if st.get("missing") not in (None, 0) or not st.get("ok", False): any_local_missing = True
    if all(s.get("ok") for s in statuses): return None
    if needs_auth:
        return jsonify({
            "error": "Repository not accessible (auth/terms or offline).",
            "repos": statuses,
            "hint": "Set HF_TOKEN and accept model card terms; or check network.",
        }), 403
    if any_local_missing:
        return jsonify({
            "error": "Local repositories not ready",
            "repos": statuses,
            "hint": "Use /pipelines/prefetch (or set auto_download:true) then re-check.",
        }), 409
    return jsonify({"error": "Unknown readiness state", "repos": statuses}), 409

# --------------------------- Stream helpers -----------------------------------
def _stream_file_task(pl: PipelineDownload, tid: str, url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    resume_from = tmp.stat().st_size if tmp.exists() else 0
    if resume_from > 0: download_manager.update_progress(pl, tid, done=resume_from, total=None)
    download_manager.mark_downloading(pl, tid)
    try:
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            mode = "ab" if resume_from > 0 else "wb"
            done = resume_from
            total = int(r.headers.get("content-length", 0)) or None
            if total: download_manager.update_progress(pl, tid, done=done, total=total)
            with open(tmp, mode) as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if not chunk: continue
                    f.write(chunk); done += len(chunk)
                    download_manager.update_progress(pl, tid, done=done, total=total)
        tmp.replace(dest)
        if dest.suffix == ".safetensors" and not _is_valid_safetensors(dest):
            raise RuntimeError("Downloaded weights file failed integrity check")
        if total: download_manager.update_progress(pl, tid, done=total, total=total)
        download_manager.mark_completed(pl, tid)
    except Exception as e:
        download_manager.mark_failed(pl, tid, str(e))
    finally:
        download_manager.finalize_if_done(pl)

def _stream_hf_file_task(pl: PipelineDownload, tid: str, repo_id: str, rel_path: str, remote_size: int):
    root = repo_local_dir(repo_id)
    dest = root / rel_path
    tmp = dest.with_suffix(dest.suffix + ".part")
    dest.parent.mkdir(parents=True, exist_ok=True)
    token = _hf_token()
    headers = {"User-Agent": "bonzai-downloader/1.0"}
    if token: headers["Authorization"] = f"Bearer {token}"
    url = hf_hub_url(repo_id=repo_id, filename=rel_path, repo_type="model", revision="main")
    download_manager.mark_downloading(pl, tid)
    if remote_size > 0: download_manager.update_progress(pl, tid, done=0, total=remote_size)
    resume_from = tmp.stat().st_size if tmp.exists() else 0
    if remote_size > 0 and resume_from > remote_size:
        try: tmp.unlink(missing_ok=True)
        except Exception: pass
        resume_from = 0
    max_attempts = 5; backoff = 1.0; attempt = 0; last_err = None
    while attempt < max_attempts:
        attempt += 1
        try:
            req_headers = dict(headers)
            if resume_from > 0: req_headers["Range"] = f"bytes={resume_from}-"
            with requests.get(url, stream=True, headers=req_headers, timeout=60, allow_redirects=True) as r:
                if r.status_code not in (200, 206):
                    raise RuntimeError(f"HTTP {r.status_code} {r.reason or ''} for {repo_id}/{rel_path}")
                mode = "ab" if resume_from > 0 else "wb"
                done = resume_from
                total = remote_size if remote_size > 0 else None
                if resume_from > 0 and r.status_code == 200:
                    try: tmp.unlink(missing_ok=True)
                    except Exception: pass
                    mode = "wb"; done = 0
                with open(tmp, mode) as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if not chunk: continue
                        f.write(chunk); done += len(chunk)
                        download_manager.update_progress(pl, tid, done=done, total=total)
            tmp.replace(dest)
            if rel_path.endswith(".safetensors") and not _is_valid_safetensors(dest):
                raise RuntimeError("Downloaded weights file failed integrity check")
            if remote_size > 0: download_manager.update_progress(pl, tid, done=remote_size, total=remote_size)
            download_manager.mark_completed(pl, tid); return
        except Exception as e:
            last_err = e; logger.warning(f"[stream] attempt {attempt}/{max_attempts} failed: {repo_id}/{rel_path} — {e}")
            time.sleep(backoff); backoff = min(backoff * 2, 10.0)
    logger.error(f"[stream] giving up: {repo_id}/{rel_path} — {last_err}")
    download_manager.mark_failed(pl, tid, str(last_err) if last_err else "download failed")

# --------------------------- PLAN: repos + GGUF+VAE ---------------------------
# Classic repos
FLUX_KREA_REPO = "black-forest-labs/FLUX.1-Krea-dev"
FLUX_KONTEXT_REPO = "black-forest-labs/FLUX.1-Kontext-dev"
SDXL_BASE_REPO    = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"
SDXL_TURBO_REPO   = "stabilityai/sdxl-turbo"
LTX_REPO = "Lightricks/LTX-Video"
LTX_UPSAMPLER_REPO = "linoyts/LTX-Video-spatial-upscaler-0.9.8"
WAN_REPO = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"

# New Wan 2.1 diffusers repo
WAN2_1_REPO = "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers"

# Only these two files will be downloaded from calcuis/wan-gguf (or your chosen mirror):
WAN_FP8_GGUF_NAME = os.getenv("WAN_FP8_GGUF_NAME", "wan2.1-i2v-14b-480p-q2_k.gguf").strip()
WAN_FP8_GGUF_URL  = os.getenv(
    "WAN_FP8_GGUF_URL",
    "https://huggingface.co/calcuis/wan-gguf/resolve/main/wan2.1-i2v-14b-480p-q2_k.gguf",
).strip()

WAN_FP8_VAE_NAME  = os.getenv("WAN_FP8_VAE_NAME", "wan_2.1_vae_fp8_e4m3fn.safetensors").strip()
WAN_FP8_VAE_URL   = os.getenv(
    "WAN_FP8_VAE_URL",
    "https://huggingface.co/calcuis/wan-gguf/resolve/main/wan_2.1_vae_fp8_e4m3fn.safetensors",
).strip()

# GGUF single files (MANDATORY)
# You can override via env if you mirror these
FLUX_KREA_GGUF_NAME = os.getenv("FLUX_GGUF_FILENAME", "flux1-krea-dev-Q2_K.gguf").strip()
FLUX_KREA_GGUF_URL  = os.getenv("FLUX_KREA_GGUF_URL", "https://huggingface.co/QuantStack/FLUX.1-Krea-dev-GGUF/resolve/main/flux1-krea-dev-Q2_K.gguf").strip()

FLUX_KONTEXT_GGUF_NAME = os.getenv("KONTEXT_GGUF_FILENAME", "flux1-kontext-dev-Q2_K.gguf").strip()
FLUX_KONTEXT_GGUF_URL  = os.getenv("FLUX_KONTEXT_GGUF_URL", "https://huggingface.co/QuantStack/FLUX.1-Kontext-dev-GGUF/resolve/main/flux1-kontext-dev-Q2_K.gguf").strip()

LTX_GGUF_NAME = os.getenv("LTX_GGUF_FILENAME", "ltxv-13b-0.9.8-distilled-Q2_K.gguf").strip()
LTX_GGUF_URL  = os.getenv("LTX_GGUF_URL", "https://huggingface.co/QuantStack/LTXV-13B-0.9.8-distilled-GGUF/resolve/main/ltxv-13b-0.9.8-distilled-Q2_K.gguf").strip()

WAN_GGUF_NAME = os.getenv("WAN_GGUF_FILENAME", "Wan2.2-TI2V-5B-Q2_K.gguf").strip()
WAN_GGUF_URL  = os.getenv("WAN_GGUF_URL", "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q2_K.gguf").strip()

# VAE single files (float32) — MANDATORY for LTX & WAN (lives inside GGUF repo area)
LTX_VAE_NAME = os.getenv("LTX_VAE_FILENAME", "ltxv-vae-f32.safetensors").strip()
LTX_VAE_URL  = os.getenv("LTX_VAE_URL", "https://huggingface.co/QuantStack/LTXV-13B-0.9.8-distilled-GGUF/resolve/main/vae/LTXV-13B-0.9.8-distilled-VAE.safetensors").strip()

WAN_VAE_NAME = os.getenv("WAN_VAE_FILENAME", "wan-vae-f32.safetensors").strip()
WAN_VAE_URL  = os.getenv("WAN_VAE_URL", "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/vae/Wan2.2_VAE.safetensors").strip()

def _gguf_status(name: Optional[str]) -> Dict[str, Any]:
    if not name: return {"configured": False, "path": None, "exists": False, "size": 0}
    p = MODEL_DIR / name
    ok = p.exists() and p.stat().st_size > 0
    return {"configured": True, "path": str(p), "exists": ok, "size": p.stat().st_size if ok else 0}

def _plan_for(pipeline: str) -> Dict[str, Any]:
    plan = {"pipeline": pipeline, "repos_to_fetch": [], "single_files": [], "notes": []}
    if pipeline == "flux_krea":
        plan["repos_to_fetch"] = [FLUX_KREA_REPO]
        plan["single_files"].append({"name": FLUX_KREA_GGUF_NAME, "url": FLUX_KREA_GGUF_URL, "optional": False})
        plan["gguf_status"] = [_gguf_status(FLUX_KREA_GGUF_NAME)]
    elif pipeline == "flux_kontext":
        plan["repos_to_fetch"] = [FLUX_KONTEXT_REPO]
        plan["single_files"].append({"name": FLUX_KONTEXT_GGUF_NAME, "url": FLUX_KONTEXT_GGUF_URL, "optional": False})
        plan["gguf_status"] = [_gguf_status(FLUX_KONTEXT_GGUF_NAME)]
    elif pipeline == "sdxl_intermediate":
        plan["repos_to_fetch"] = [SDXL_BASE_REPO, SDXL_REFINER_REPO]
        plan["gguf_status"] = []
    elif pipeline == "sdxl_turbo":
        plan["repos_to_fetch"] = [SDXL_TURBO_REPO]
        plan["gguf_status"] = []
    elif pipeline == "flux_krea":
        plan["repos_to_fetch"] = []  # Flux uses GGUF-only transformer; no classic repo required for Krea here
        plan["single_files"] = [
            {"name": FLUX_KREA_GGUF_NAME, "url": FLUX_KREA_GGUF_URL, "optional": False},
        ]
        plan["gguf_status"] = [_gguf_status(FLUX_KREA_GGUF_NAME)]
    elif pipeline == "flux_kontext":
        plan["single_files"] = [
            {"name": FLUX_KONTEXT_GGUF_NAME, "url": FLUX_KONTEXT_GGUF_URL, "optional": False},
        ]
        plan["gguf_status"] = [_gguf_status(FLUX_KONTEXT_GGUF_NAME)]
    elif pipeline in ("ltx_video", "ltx"):
        # If you no longer rely on a separate upsampler repo, use only LTX_REPO:
        plan["repos_to_fetch"] = [LTX_REPO, LTX_UPSAMPLER_REPO]
        plan["single_files"] = []       # the two .safetensors are in the repo root; not standalone
        plan["gguf_status"] = []
    elif pipeline in ("wan_video", "wan_fp8", "wan"):
        # Only the diffusers repo and two single files
        plan["repos_to_fetch"] = [WAN2_1_REPO]
        plan["single_files"] = [
            {"name": WAN_FP8_GGUF_NAME, "url": WAN_FP8_GGUF_URL, "optional": False},
            {"name": WAN_FP8_VAE_NAME,  "url": WAN_FP8_VAE_URL,  "optional": False},
        ]
        plan["gguf_status"] = [
            _gguf_status(WAN_FP8_GGUF_NAME),
            _gguf_status(WAN_FP8_VAE_NAME),
        ]
    else:
        raise ValueError(f"Unknown pipeline '{pipeline}'")
    return plan

def _ensure_files_present_or_start(plan_name: str, auto_download: bool = False) -> Optional[tuple]:
    plan = _plan_for(plan_name)
    # Check classic repos
    missing_repo_resp = None
    for rid in plan.get("repos_to_fetch", []):
        guard = _repos_ready_or_resp(rid)
        if guard: missing_repo_resp = guard
    # Check GGUF files
    missing_gguf = []
    for f in plan.get("single_files", []):
        name = (f.get("name") or "").strip()
        if not name: continue
        p = MODEL_DIR / name
        if not (p.exists() and p.stat().st_size > 0): missing_gguf.append(name)

    if not missing_repo_resp and not missing_gguf:
        return None

    if auto_download:
        started = _start_prefetch_pipeline(plan_name)
        return jsonify(started["json"]), started["http_status"]

    # Build a helpful error explaining what's missing
    return jsonify({
        "error": "Assets missing",
        "repos": [ _repo_readiness(r) for r in plan.get("repos_to_fetch", []) ],
        "missing_files": missing_gguf,
        "hint": f'Run /pipelines/prefetch with pipeline="{plan_name}" (or set auto_download:true).'
    }), 409

def _estimate_repo_size(repo_id: str, allow_patterns: Optional[List[str]] = None) -> int:
    try:
        manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
        return sum(int(f.get("size") or 0) for f in manifest)
    except Exception:
        return 0

def _prefetch_repo_files_task(pl: PipelineDownload, repo_id: str, allow_patterns: Optional[List[str]], max_workers: int = 4):
    root = repo_local_dir(repo_id); root.mkdir(parents=True, exist_ok=True)
    container_tid = download_manager.add_repo_task(pl, repo_id, total_estimate=0)
    download_manager.mark_downloading(pl, container_tid)
    try:
        manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
        needs = []
        for f in manifest:
            rel = f["path"]; lp = root / rel
            if not lp.exists() or (f["size"] and lp.stat().st_size != f["size"]):
                needs.append(rel)
    except Exception as e:
        download_manager.mark_failed(pl, container_tid, f"Manifest error: {e}")
        download_manager.finalize_if_done(pl); return
    if not needs:
        if _repo_completeness(repo_id).get("ok", False):
            download_manager.update_progress(pl, container_tid, done=1, total=1)
            download_manager.mark_completed(pl, container_tid)
        else:
            download_manager.mark_failed(pl, container_tid, "Repo incomplete but no remote files enumerated.")
        download_manager.finalize_if_done(pl); return

    path_to_size = {f["path"]: int(f.get("size") or 0) for f in manifest}
    for rel in needs:
        size = path_to_size.get(rel, 0); title = f"{repo_id}/{rel}"
        tid = _tid_file(repo_id, rel)
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="file", name=title, total_bytes=size, status="pending")
        if size > 0: download_manager.update_progress(pl, tid, done=0, total=size)
    download_manager.emit(pl.pipeline_id)

    from concurrent.futures import ThreadPoolExecutor, as_completed
    completed = 0; total_files = len(needs)
    def _wrap(rel_path: str):
        tid = _tid_file(repo_id, rel_path)
        try:
            download_manager.mark_downloading(pl, tid)
            _stream_hf_file_task(pl, tid, repo_id, rel_path, path_to_size.get(rel_path, 0))
        except Exception as e:
            logger.exception(f"[files] worker crashed: {repo_id}/{rel_path}")
            download_manager.mark_failed(pl, tid, str(e))

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = [ex.submit(_wrap, rel) for rel in needs]
        for fut in as_completed(futs):
            try: fut.result()
            except Exception: pass
            completed += 1
            download_manager.update_progress(pl, container_tid, done=completed, total=total_files)

    states = {t.status for t in pl.tasks.values() if t.kind == "file" and t.name.startswith(f"{repo_id}/")}
    if "failed" in states:
        download_manager.mark_failed(pl, container_tid, "Some files failed.")
    else:
        download_manager.mark_completed(pl, container_tid)
    download_manager.finalize_if_done(pl)

def _start_prefetch_pipeline(pipeline: str) -> Dict[str, Any]:
    plan = _plan_for(pipeline)
    pl = download_manager.new(f"prefetch:{pipeline}")
    download_manager.set_status(pl, "downloading")
    download_manager.emit(pl.pipeline_id)

    inaccessible_repos: List[str] = []
    for rid in plan.get("repos_to_fetch", []):
        pats = allow_patterns_for_repo(rid)
        inv = build_repo_inventory(rid, allow_patterns=pats)
        if inv["missing"] is None and not inv["ok"]:
            logger.warning("[prefetch] skipping %s due to remote inaccessibility", rid)
            inaccessible_repos.append(rid); continue
        if inv["ok"]: continue
        tid = download_manager.add_repo_task(pl, repo_id=rid, total_estimate=_estimate_repo_size(rid, allow_patterns=pats))
        socketio.start_background_task(_prefetch_repo_files_task, pl, rid, pats)

    # GGUF/VAEs (mandatory)
    for f in plan.get("single_files", []):
        name = (f.get("name") or "").strip(); url = (f.get("url") or "").strip()
        if not name: continue
        dest = MODEL_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            tid = download_manager.add_file_task(pl, filename=name, size=dest.stat().st_size)
            download_manager.update_progress(pl, tid, done=dest.stat().st_size, total=dest.stat().st_size)
            download_manager.mark_completed(pl, tid); continue
        if not url: continue
        tid = download_manager.add_file_task(pl, filename=name, size=0)
        socketio.start_background_task(_stream_file_task, pl, tid, url, dest)

    if not pl.tasks and inaccessible_repos:
        download_manager.set_status(pl, "failed")
        return {"http_status": 403, "json": {
            "error": "Repository not accessible (auth/terms or offline).",
            "plan": plan, "pipeline_id": pl.pipeline_id, "download_websocket_url": downloads_url(),
            "auth_repos": inaccessible_repos,
        }}

    if not pl.tasks:
        download_manager.set_status(pl, "completed")
        return {"http_status": 200, "json": {
            "message": "Everything already present",
            "pipeline_id": pl.pipeline_id, "pipelines_started": [], "download_websocket_url": downloads_url(),
            "details": {"plan": plan, "download_pipelines": [], "notes": []},
        }}

    logger.info("[prefetch] started pipeline %s for %s", pl.pipeline_id, pipeline)
    return {"http_status": 202, "json": {
        "message": "Prefetch started", "pipeline_id": pl.pipeline_id, "pipelines_started": [pl.pipeline_id],
        "download_websocket_url": downloads_url(),
        "details": {"plan": plan, "download_pipelines": [{"kind": "mixed", "pipeline_id": pl.pipeline_id}], "notes": []},
    }}

# ------------------------------ REST: plan/prefetch ----------------------------
@app.route("/pipelines/plan", methods=["POST"])
def pipelines_plan():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    if not pipeline: return jsonify({"error": "Provide 'pipeline'."}), 400
    try: plan = _plan_for(pipeline)
    except ValueError as e: return jsonify({"error": str(e)}), 400

    deep = bool(data.get("deep_validate", False))
    repos_status, auth_repos, repo_inventories = [], [], []
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid); repos_status.append(st)
        if deep:
            pats = allow_patterns_for_repo(rid)
            repo_inventories.append(build_repo_inventory(rid, allow_patterns=pats))
        if st.get("missing") is None and not st.get("ok", False): auth_repos.append(rid)

    ok_repos = all(r.get("ok") for r in repos_status) if repos_status else True
    ok_files = all((_gguf_status(f.get("name")).get("exists") if f.get("name") else True)
                   for f in plan.get("single_files", []))
    resp = {
        "plan": plan, "repos": repos_status, "gguf_status": plan.get("gguf_status", []),
        "notes": plan.get("notes", []), "ok": bool(ok_repos and ok_files),
    }
    if auth_repos:
        resp["auth_required"] = True; resp["auth_repos"] = auth_repos
    if deep: resp["inventories"] = repo_inventories
    return jsonify(resp), 200

@app.route("/pipelines/prefetch", methods=["POST"])
def pipelines_prefetch():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    if not pipeline: return jsonify({"error": "Provide 'pipeline'."}), 400
    try:
        started = _start_prefetch_pipeline(pipeline)
        return jsonify(started["json"]), started["http_status"]
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

# PART 4/5

# ------------------------------ Video helpers ---------------------------------
def _sanitize_frames_for_video(frames, target_size=None):
    frames = list(frames or [])
    if not frames: raise RuntimeError("No frames to write")
    if target_size is not None:
        W, H = int(target_size[0]), int(target_size[1])
    else:
        f0 = frames[0]
        if hasattr(f0, "size"): W, H = f0.size
        else:
            arr0 = np.asarray(f0)
            if arr0.ndim == 3 and arr0.shape[2] in (1,3,4): H, W = arr0.shape[0], arr0.shape[1]
            else: raise RuntimeError("Unexpected frame shape; expected (H,W,C).")
    W -= (W % 2); H -= (H % 2)
    if W <= 0 or H <= 0: raise RuntimeError("Computed invalid even dimensions for video.")
    out = []
    for fr in frames:
        if hasattr(fr, "convert"): img = fr
        else:
            arr = np.asarray(fr)
            if arr.ndim == 2: arr = np.stack([arr]*3, axis=-1)
            elif arr.ndim == 3 and arr.shape[2] == 4: arr = arr[..., :3]
            img = Image.fromarray(arr.astype(np.uint8), mode="RGB")
        if img.mode != "RGB": img = img.convert("RGB")
        if img.size != (W, H): img = img.resize((W, H), Image.BICUBIC)
        arr = np.asarray(img, dtype=np.uint8)
        if arr.ndim != 3 or arr.shape[2] != 3: arr = np.stack([arr]*3, axis=-1)
        out.append(np.ascontiguousarray(arr))
    return out, (W, H)

def _write_video_h264_safe(out_path, frames, fps, gen_id=None, target_size=None):
    arrs, (W, H) = _sanitize_frames_for_video(frames, target_size=target_size)
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

def _img_b64_to_pil(b64: str) -> Image.Image:
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")

# ------------------------- GGUF transformer loader ----------------------------
def load_transformer_from_gguf(gguf_path: Path,
                               compute_dtype: torch.dtype,
                               try_classes: Optional[List[str]] = None):
    """
    Try multiple known transformer classes to load a GGUF file.
    Falls back to None if not loadable.
    """
    if try_classes is None:
        try_classes = [
            # Most common names first
            "diffusers.LTXVideoTransformer3DModel",
            "diffusers.FluxTransformer2DModel",
            "diffusers.Transformer2DModel",
            # Potential model-specific class names (adjust if you know the exact one)
            "diffusers.models.transformers.transformer_2d.FluxTransformer2DModel",
            "diffusers.models.transformers.transformer_2d.Transformer2DModel",
        ]

    qconf = GGUFQuantizationConfig(compute_dtype=compute_dtype)
    last_err = None
    for full_name in try_classes:
        try:
            mod_name, cls_name = full_name.rsplit(".", 1)
            mod = import_module(mod_name)
            cls = getattr(mod, cls_name)
            if not hasattr(cls, "from_single_file"):
                continue
            logger.info(f"[gguf] Trying {full_name} for {gguf_path.name}")
            transformer = cls.from_single_file(
                str(gguf_path),
                quantization_config=qconf,
                torch_dtype=compute_dtype,
            )
            logger.info(f"[gguf] Loaded {full_name} successfully.")
            return transformer
        except Exception as e:
            last_err = e
            logger.info(f"[gguf] {full_name} failed: {e}")

    logger.warning(f"[gguf] Could not load transformer from GGUF {gguf_path.name}: {last_err}")
    return None

# ------------------------------ Generation: SDXL (intermediate) ---------------
@app.route("/image/intermediate", methods=["POST"])
def image_intermediate_sdxl():
    """
    SDXL base + refiner with optional single-file checkpoint and LoRA.
    - ckpt: filename in MODEL_DIR (e.g., "cyberrealistic.safetensors")
    - lora: filename in MODEL_DIR (e.g., "cyberrealistic.safetensors")
    - lora_strength: float (default 1.0). Uses set_adapters or fuse fallback.
    """
    import logging as _logging
    _logging.getLogger("transformers.tokenization_utils_base").setLevel(_logging.ERROR)

    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    negative_prompt = data.get("negative_prompt", "bad anatomy, extra hands, extra legs, extra fingers, poorly drawn face, fused face, cloned face")
    height = int(data.get("height", 1024))
    width  = int(data.get("width", 1024))

    # SDXL extras
    ckpt_filename = (data.get("ckpt") or "cyberrealistic.safetensors").strip()  # e.g. "cyberrealistic.safetensors"
    lora_filename = (data.get("lora") or "cyberrealistic.safetensors").strip()  # e.g. "cyberrealistic.safetensors"
    lora_strength = float(data.get("lora_strength", 1.0))

    steps_base = int(data.get("steps_base", 40))
    steps_ref  = int(data.get("steps_refiner", 40))
    denoising_split = float(data.get("denoising_split", 0.9))
    cb_steps = int(data.get("callback_steps", 5))
    auto_dl = bool(data.get("auto_download", False))

    # Ensure repos ready (for tokenizers/encoders/vae when not using single-file ckpt)
    guard = _repos_ready_or_resp(SDXL_BASE_REPO, SDXL_REFINER_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("sdxl_intermediate")
            return jsonify(started["json"]), started["http_status"]
        return guard

    gen_id = genbus.new("sdxl_intermediate", {"endpoint": "/image/intermediate", "prompt": prompt})

    try:
        device = DeviceManager.get_device()
        dtype  = DeviceManager.get_dtype(device)

        base = None
        # 1) Try single-file checkpoint for the base if provided
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

        # 2) Fall back to repo base
        if base is None:
            base = StableDiffusionXLPipeline.from_pretrained(
                str(repo_local_dir(SDXL_BASE_REPO)),
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16",
                local_files_only=True,
            ).to(device)

        # Helper to apply LoRA with multiple fallbacks
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
                # UNet-only fallback (attn_procs)
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

        # Optional LoRA for base
        if lora_filename:
            lp = (MODEL_DIR / lora_filename).resolve()
            if lp.exists() and lp.stat().st_size > 0:
                _apply_lora(base, lp, lora_strength, "base")

        # Compile UNet when on CUDA (safe try)
        try:
            if device.type == "cuda":
                base.unet = torch.compile(base.unet, mode="reduce-overhead", fullgraph=True)
        except Exception:
            pass

        # Compel (dual encoders)
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

        # Refiner from repo (shares TE2/VAE from base for consistency)
        refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            str(repo_local_dir(SDXL_REFINER_REPO)),
            text_encoder_2=getattr(base, "text_encoder_2", None),
            vae=getattr(base, "vae", None),
            torch_dtype=dtype,
            use_safetensors=True,
            variant="fp16",
            local_files_only=True,
        ).to(device)

        # Optional LoRA for refiner (same file)
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

        buf = BytesIO(); image.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "image": encoded,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        }), 201

    except Exception as e:
        logger.exception("SDXL intermediate failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
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
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(SDXL_TURBO_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("sdxl_turbo")
            return jsonify(started["json"]), started["http_status"]
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

        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": generation_url()}), 201
    except Exception as e:
        logger.exception("SDXL turbo failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
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
        return jsonify({"error": "Prompt is required"}), 400

    # Require: local repo + mandatory GGUF
    guard = _ensure_files_present_or_start("flux_krea", auto_download=auto_dl)
    if guard: return guard

    from diffusers import FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig

    gen_id = genbus.new("flux_krea", {"endpoint": "/image/quality", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        compute_dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        # Load transformer from GGUF (local file)
        transformer = FluxTransformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_KREA_GGUF_NAME),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            torch_dtype=compute_dtype,
        ).to(device)

        # Complete the pipeline from the **local repo cache** (no network)
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

        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({
            "prompt": prompt,
            "image": b64,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        }), 201

    except Exception as e:
        logger.exception("FLUX Krea generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
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
        return jsonify({"error": "Prompt is required"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    # Require: local repo + mandatory GGUF
    guard = _ensure_files_present_or_start("flux_kontext", auto_download=auto_dl)
    if guard: return guard

    from diffusers import FluxImg2ImgPipeline, FluxTransformer2DModel, GGUFQuantizationConfig
    from diffusers.utils import load_image

    gen_id = genbus.new("flux_kontext", {"endpoint": "/image/kontext", "w": w, "h": h, "steps": steps})
    try:
        device = DeviceManager.get_device()
        compute_dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

        # GGUF transformer (local file)
        transformer = FluxTransformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_KONTEXT_GGUF_NAME),
            quantization_config=GGUFQuantizationConfig(compute_dtype=compute_dtype),
            torch_dtype=compute_dtype,
        ).to(device)

        # Pipeline completed from the **local Kontext repo** (no network)
        pipe = FluxImg2ImgPipeline.from_pretrained(
            str(repo_local_dir(FLUX_KONTEXT_REPO)),
            transformer=transformer,
            torch_dtype=compute_dtype,
            local_files_only=True,
        ).to(device)

        init_img = load_image(image_url).convert("RGB") if image_url else _img_b64_to_pil(image_b64)

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

        buf = BytesIO(); out.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({
            "prompt": prompt,
            "image": encoded,
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        }), 201

    except Exception as e:
        logger.exception("Kontext i2i failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()
        
def _load_ltx_vae_or_none(device: torch.device) -> Optional[AutoencoderKL]:
    # Prefer upscaler VAE (complete config), then base repo VAE
    try:
        vae_dir = repo_local_dir(LTX_UPSAMPLER_REPO) / "vae"
        if vae_dir.exists():
            return AutoencoderKL.from_pretrained(
                str(vae_dir),
                torch_dtype=torch.float32,
                local_files_only=True,
                use_safetensors=True,
            ).to(device)
    except Exception as e:
        logger.warning(f"[ltx] upscaler VAE load failed: {e}")
    try:
        vae_dir = repo_local_dir(LTX_REPO) / "vae"
        if vae_dir.exists():
            return AutoencoderKL.from_pretrained(
                str(vae_dir),
                torch_dtype=torch.float32,
                local_files_only=True,
                use_safetensors=True,
            ).to(device)
    except Exception as e:
        logger.warning(f"[ltx] base VAE load failed: {e}")
    return None

def _maybe_load_t5_encoder_from_gguf(gguf_path: str):
    """
    Placeholder: T5 GGUF loading is not officially wired in diffusers.
    If you have a custom loader (e.g., via a gguf-backed runtime),
    integrate it here and return a module with the same interface the pipeline expects.
    Otherwise we no-op gracefully.
    """
    try:
        if not gguf_path or not os.path.isfile(gguf_path):
            return None
        # TODO: integrate your T5 GGUF loader here if available.
        logger.warning("[ltx] T5 GGUF present at %s but no loader is wired; skipping.", gguf_path)
    except Exception as e:
        logger.warning("[ltx] Could not load T5 GGUF: %s", e)
    return None

def _round_hw_to_ratio(h, w, ratio):
    return h - (h % ratio), w - (w % ratio)

def _flush_mem():
    try:
        torch.cuda.empty_cache()
    except Exception:
        pass
    try:
        torch.mps.empty_cache()
    except Exception:
        pass
    try:
        import gc; gc.collect()
    except Exception:
        pass

def _round_hw_for_vae(h, w, ratio=8):
    return h - (h % ratio), w - (w % ratio)
# ------------------------------ LTX Image -> Video ----------------------------
@app.route("/image/video/turbo", methods=["POST"])
def ltx_image_to_video():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, inconsistent motion, blurry, jittery, distorted")
    H = int(data.get("height", 480))
    W = int(data.get("width", 704))
    frames_count = int(data.get("frames", 161))
    fps = int(data.get("fps", 24))
    steps = int(data.get("steps", 40))
    auto_dl = bool(data.get("auto_download", False))
    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    seed = data.get("seed", None)

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    # Ensure local repo (will auto-prefetch if asked)
    guard = _ensure_files_present_or_start("ltx_video", auto_download=auto_dl)
    if guard: return guard

    # Round to VAE grid (8)
    def _round_hw_for_vae(h, w, ratio=8):
        return h - (h % ratio), w - (w % ratio)
    H, W = _round_hw_for_vae(H, W, ratio=8)

    gen_id = genbus.new("ltx_i2v", {"endpoint": "/image/video/turbo", "w": W, "h": H, "frames": frames_count, "fps": fps})

    try:
        device = DeviceManager.get_device()
        base_root = repo_local_dir(LTX_REPO)

        # Keep it simple & robust: fp32 (yes, slower, but avoids dtype edge cases)
        from diffusers import LTXImageToVideoPipeline
        pipe = LTXImageToVideoPipeline.from_pretrained(
            str(base_root),
            torch_dtype=torch.float32,
            local_files_only=True,
            use_safetensors=True,
        ).to(device)

        # Load the init image from POST
        if image_url:
            init_img = load_image(image_url).convert("RGB")
        else:
            raw = base64.b64decode(image_b64)
            init_img = Image.open(io.BytesIO(raw)).convert("RGB")

        # Optional seed
        generator = None
        if isinstance(seed, int):
            generator = torch.Generator(device=device).manual_seed(seed)

        # Generate (use only supported kwargs)
        genbus.progress(gen_id, "generate_video", 1, 2)
        out = pipe(
            image=init_img,
            prompt=prompt,
            negative_prompt=neg,
            width=W,
            height=H,
            num_frames=frames_count,
            num_inference_steps=steps,
            generator=generator,
        )

        # Always unwrap nested frames: LTX returns [[PIL...]]
        frames = out.frames[0] if hasattr(out, "frames") else out
        if not isinstance(frames, (list, tuple)):
            frames = [frames]

        # Encode safely via ffmpeg (your helper sanitizes + PNGs -> H.264)
        genbus.progress(gen_id, "encode_video", 2, 2)
        out_name = f"ltx_{int(time.time())}.mp4"
        out_path = os.path.join(os.getcwd(), out_name)
        _write_video_h264_safe(out_path, frames, fps=fps, gen_id=gen_id, target_size=(W, H))

        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify({"ok": True, "video_path": out_path, "generation_websocket_url": generation_url()}), 201

    except Exception as e:
        logger.exception("LTX image->video failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

# ------------------- WAN Image -> Video ----------------------------
def _load_wan_pipeline_shell(device: torch.device, compute_dtype: torch.dtype):
    from diffusers import WanImageToVideoPipeline
    repo_root = repo_local_dir(WAN_REPO)
    pipe = WanImageToVideoPipeline.from_pretrained(
        str(repo_root), torch_dtype=compute_dtype, local_files_only=True,
    )
    # Offloading
    if device.type == "cuda":
        try: pipe.enable_model_cpu_offload()
        except Exception: pipe.enable_sequential_cpu_offload()
    else:
        pipe.enable_attention_slicing()
        try: pipe.vae.enable_slicing()
        except Exception: pass
    return pipe.to(device)

@app.route("/image/video/quality", methods=["POST"])
def wan_image_to_video():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg    = data.get("negative_prompt", "worst quality, inconsistent motion, blur, jitter, distorted")
    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400

    image_b64 = (data.get("image_base64") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    height = int(data.get("height", 480))
    width  = int(data.get("width", 704))
    frames = int(data.get("frames", 65))
    steps  = int(data.get("steps", 30))
    fps    = int(data.get("fps", 24))
    seed   = data.get("seed")
    auto_dl = bool(data.get("auto_download", False))

    # Ensure local diffusers repo and override files are available
    guard = _ensure_files_present_or_start("wan_video", auto_download=auto_dl)
    if guard:
        return guard

    gen_id = genbus.new("wan_i2v", {"endpoint": "/image/video/quality", "w": width, "h": height, "frames": frames, "fps": fps})
    state = {"done": False, "error": None, "out_path": None}

    def _run():
        try:
            device = DeviceManager.get_device()
            compute_dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32

            # 1) Load the base pipeline from the official 2.1 diffusers repo
            pipe = WanImageToVideoPipeline.from_pretrained(
                str(repo_local_dir(WAN2_1_REPO)),
                torch_dtype=compute_dtype,
                local_files_only=True,
                use_safetensors=True,
            ).to(device)

            # 2) Override the VAE with the fp8 version (loaded in fp32)
            vae = AutoencoderKLWan.from_single_file(
                str(MODEL_DIR / WAN_FP8_VAE_NAME),
                torch_dtype=torch.float32,
                local_files_only=True,
            ).to(device)
            pipe.vae = vae

            # 3) Override the transformer with your gguf (quantised) model
            transformer = load_transformer_from_gguf(
                MODEL_DIR / WAN_FP8_GGUF_NAME, compute_dtype
            )
            if transformer is not None:
                pipe.transformer = transformer.to(device)

            # 4) Load the input image (either from URL or base64)
            from diffusers.utils import load_image
            img = load_image(image_url).convert("RGB") if image_url else _img_b64_to_pil(image_b64)

            # Prepare generator if seed provided
            generator = torch.Generator(device=device) if isinstance(seed, int) else None
            if generator is not None:
                generator.manual_seed(seed)

            # Stage: generate video
            genbus.progress(gen_id, "generate_video", 1, 3)
            out = pipe(
                image=img,
                prompt=prompt,
                negative_prompt=neg,
                height=height,
                width=width,
                num_frames=frames,
                num_inference_steps=steps,
                generator=generator,
                output_type="pil",
            )
            frames_pil = out.frames[0]
            if not frames_pil:
                raise RuntimeError("Wan returned no frames")

            # Stage: encode video (H.264 yuv420p)
            genbus.progress(gen_id, "encode_video", 2, 3)
            out_name = f"wan_{int(time.time())}.mp4"
            out_path = os.path.join(os.getcwd(), out_name)
            _write_video_h264_safe(out_path, frames_pil, fps=fps, gen_id=gen_id, target_size=(width, height))

            genbus.finish(gen_id, {"video_path": out_path})
            state["out_path"] = out_path

        except Exception as e:
            logger.exception("Wan i2v failed")
            genbus.error(gen_id, str(e))
            state["error"] = str(e)
        finally:
            try:
                DeviceManager.free_memory()
            except Exception:
                pass
            state["done"] = True

    # run background task and wait
    socketio.start_background_task(_run)
    while not state["done"]:
        socketio.sleep(0.25)

    if state["error"]:
        return jsonify({"error": state["error"]}), 500
    return jsonify({"ok": True, "video_path": state["out_path"], "generation_websocket_url": generation_url()}), 201


# PART 5/5

# ------------------------------- Downloads API --------------------------------
@app.route("/downloads/list", methods=["GET"])
def downloads_list():
    return jsonify({"pipelines": [p.to_dict() for p in download_manager.pipelines.values()]}), 200

@app.route("/downloads/status/<pipeline_id>", methods=["GET"])
def downloads_status(pipeline_id):
    pl = download_manager.pipelines.get(pipeline_id)
    if not pl:
        return jsonify({"error": "Pipeline not found"}), 404
    return jsonify(pl.to_dict()), 200

@app.route("/downloads/retry/<pipeline_id>", methods=["POST"])
def downloads_retry(pipeline_id):
    return jsonify({"message": "Retry not supported for unified pipeline; re-run /pipelines/prefetch"}), 400

@app.route("/downloads/cancel/<pipeline_id>", methods=["POST"])
def downloads_cancel(pipeline_id):
    return jsonify({"message": "Cancel not supported for unified pipeline"}), 400

# -------------------------------- Health & root --------------------------------
@app.route("/")
def root():
    return jsonify({"message": "BonzAI Media Generation Server", "local_only": LOCAL_ONLY})

@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "device": str(DeviceManager.get_device()),
        "has_hf_token": bool(_hf_token()),
        "local_only": LOCAL_ONLY,
        "model_dir": str(MODEL_DIR),
    })

logger.info(f"HF_HOME={os.environ.get('HF_HOME')}")
logger.info(f"HF token present? {bool(_hf_token())}")

if __name__ == "__main__":
    logger.info("Starting BonzAI Media Generation Server (eventlet + per-file progress)")
    logger.info(f"Device: {DeviceManager.get_device()}")
    logger.info(f"Model directory: {MODEL_DIR}")
    socketio.run(app, host="0.0.0.0", port=65000, debug=False, use_reloader=False)
