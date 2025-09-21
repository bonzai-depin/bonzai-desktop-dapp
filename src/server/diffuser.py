#!/usr/bin/env python
# -*- coding: utf-8 -*-
# BonzAI Media Generation Server — eventlet + robust progress
# PART 1/5

from __future__ import annotations  # allow forward refs in annotations

import os
import re
import gc
import io
import time
import json
import base64
import logging
import threading
import hashlib
import platform
from io import BytesIO
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import numpy as np

# ---- eventlet first (monkey-patch sockets, requests, etc.)
import eventlet
eventlet.monkey_patch(all=True, socket=True, time=True, select=True, thread=True, os=True)

import requests
import torch
from PIL import Image
from appdirs import user_data_dir
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from fnmatch import fnmatch

# ---- Hugging Face
from huggingface_hub import HfApi, hf_hub_url, snapshot_download

# Robust import for HfHubHTTPError across hub versions
try:
    from huggingface_hub.errors import HfHubHTTPError  # modern path
except Exception:
    try:
        from huggingface_hub.utils import HfHubHTTPError  # legacy path
    except Exception:  # very old or edge case; make a lightweight alias
        class HfHubHTTPError(Exception):
            pass

# Validate .safetensors integrity to catch truncated files early
try:
    from safetensors import safe_open as _safetensors_open  # type: ignore
except Exception:
    _safetensors_open = None

# ---- Diffusers (only what we actually use for endpoints)
from diffusers import (
    DiffusionPipeline,
    AutoPipelineForText2Image,
    FluxPipeline,
    FluxTransformer2DModel,
    GGUFQuantizationConfig,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    FlowMatchEulerDiscreteScheduler,
    HunyuanVideoPipeline,
    LTXConditionPipeline,
    LTXLatentUpsamplePipeline,
    LTXImageToVideoPipeline,
)
from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
from diffusers.utils import export_to_video, load_image, load_video

def get_ffmpeg_binary_path():
    base_dir = os.path.join("node_modules", "ffmpeg-static-electron-forge", "dist", "bin")
    system = platform.system().lower()
    machine = platform.machine().lower()

    # Normalize common architectures
    arch = {
        "x86_64": "x64",
        "amd64": "x64",
        "arm64": "arm64",
        "aarch64": "arm64"
    }.get(machine, machine)

    # Platform-specific directory
    if system == "darwin":
        platform_dir = f"darwin/{arch}"
    elif system == "linux":
        platform_dir = f"linux/{arch}"
    elif system == "windows":
        platform_dir = f"win32/{arch}"
    else:
        raise RuntimeError(f"Unsupported platform: {system}/{arch}")

    ffmpeg_path = os.path.join(base_dir, platform_dir, "ffmpeg")

    if system == "windows":
        ffmpeg_path += ".exe"

    if not os.path.isfile(ffmpeg_path):
        raise FileNotFoundError(f"FFmpeg binary not found at: {ffmpeg_path}")

    return ffmpeg_path

os.environ["IMAGEIO_FFMPEG_EXE"] = get_ffmpeg_binary_path()

# ------------------------------ Logging & paths ------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("bonzai-server")

USER_DATA_PATH = user_data_dir("bonzai", "BonzAI")
MODEL_DIR = Path(USER_DATA_PATH) / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Make HF store everything under our folder (predictable)
os.environ["HF_HOME"] = str(MODEL_DIR / "hf")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

LOCAL_ONLY = bool(int(os.getenv("BONZAI_LOCAL_ONLY", "1")))

# Safety cap to avoid run-away downloads (default 60 GB)
MAX_REPO_BYTES = int(os.getenv("BONZAI_MAX_REPO_BYTES", str(60 * (1 << 30))))
CHUNK_SIZE = 1 << 20  # 1 MiB

def _hf_token() -> Optional[str]:
    return os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

# ---------------------------- Flask / Socket.IO -------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bonzai-secret-key")
CORS(app)

# Single, authoritative SocketIO instance (eventlet)
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
    """Emit + yield to eventlet so packets flush during CPU/GPU work."""
    socketio.emit(event, payload, namespace=namespace)
    # Give the eventlet hub a chance to send frames
    try:
        socketio.sleep(0)
    except Exception:
        pass

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

# PART 2/5

# -------------------------- Devices & memory helpers --------------------------
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

# ------------------------------ Generation bus --------------------------------
class GenerationTracker:
    def __init__(self):
        self._meta: Dict[str, Dict[str, Any]] = {}

    def new(self, kind: str, meta: Optional[Dict[str, Any]] = None, gen_id: Optional[str] = None) -> str:
        gid = gen_id or hashlib.md5(f"{kind}_{time.time()}".encode()).hexdigest()[:16]
        self._meta[gid] = {"kind": kind, "meta": meta or {}, "ts": time.time(), "stage": "starting"}
        socket_emit("gen_started", {"generation_id": gid, "kind": kind, "meta": meta or {}}, "/generation")
        # Immediate 0% tick so UI never stays at 0
        socket_emit("gen_progress", {"generation_id": gid, "stage": "queued", "step": 0, "total": 1, "pct": 0}, "/generation")
        return gid

    def progress(self, generation_id: str, stage: str, step: int, total: int):
        pct = round((step / max(total, 1)) * 100.0, 2)
        socket_emit("gen_progress", {
            "generation_id": generation_id, "stage": stage,
            "step": int(step), "total": int(total), "pct": pct
        }, "/generation")

    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        socket_emit("gen_finished", {"generation_id": generation_id, "payload": payload or {}}, "/generation")
        self._meta.pop(generation_id, None)

    def error(self, generation_id: str, message: str):
        socket_emit("gen_error", {"generation_id": generation_id, "error": message}, "/generation")
        self._meta.pop(generation_id, None)

genbus = GenerationTracker()

# --------------------------- WebSocket namespaces -----------------------------
@socketio.on("connect", namespace="/downloads")
def dl_connect():
    emit("connected", {"message": "Connected to download progress stream"})

@socketio.on("subscribe", namespace="/downloads")
def dl_subscribe(data):
    data = data or {}
    # accept both client spellings
    pipeline_id = data.get("pipeline_id") or data.get("pipelineId")
    if not pipeline_id:
        emit("download_progress", {"pipeline": None})
        return
    # join a room per pipeline so only subscribers get updates
    join_room(pipeline_id)
    pl = download_manager.pipelines.get(pipeline_id)
    # push immediate snapshot to this socket
    emit("download_progress", {"pipeline": pl.to_dict() if pl else None})

@socketio.on("disconnect", namespace="/downloads")
def dl_disconnect():
    pass

@socketio.on("connect", namespace="/generation")
def gen_connect():
    emit("connected", {"message": "Connected to generation progress"})

@socketio.on("disconnect", namespace="/generation")
def gen_disconnect():
    pass

# ------------------------------- Small helpers --------------------------------
def repo_local_dir(repo_id: str) -> Path:
    return MODEL_DIR / "repos" / repo_id.replace("/", "__")

def file_size(p: Path) -> int:
    try:
        return p.stat().st_size
    except Exception:
        return 0

def folder_size_bytes(root: Path) -> int:
    total = 0
    if not root.exists():
        return 0
    for dp, _, files in os.walk(root):
        for fn in files:
            try:
                total += (Path(dp) / fn).stat().st_size
            except Exception:
                pass
    return total

# PART 3/5

# ----------------------------- Download tracking ------------------------------
@dataclass
class DownloadTask:
    task_id: str
    kind: str                 # "repo" or "file"
    name: str                 # repo_id or "repo_id:path" or filename
    status: str = "pending"   # pending | downloading | completed | failed | cancelled
    progress: float = 0.0     # 0..100
    total_bytes: int = 0
    done_bytes: int = 0
    error_message: Optional[str] = None

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "kind": self.kind,
            "filename": self.name,
            "status": self.status,
            "progress": round(self.progress, 2),
            "total_size": int(self.total_bytes),
            "downloaded_size": int(self.done_bytes),
            "error_message": self.error_message,
        }

@dataclass
class PipelineDownload:
    pipeline_id: str
    pipeline_name: str
    tasks: Dict[str, DownloadTask] = field(default_factory=dict)
    status: str = "pending"  # pending | downloading | completed | failed | cancelled
    attempts: int = 0

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
            "pipeline_id": self.pipeline_id,
            "pipeline_name": self.pipeline_name,
            "status": self.status,
            "attempts": self.attempts,
            "total_progress": round(self.total_progress, 2),
            "tasks": {tid: t.to_dict() for tid, t in self.tasks.items()},
        }

class DownloadManager:
    def __init__(self):
        self.pipelines: Dict[str, "PipelineDownload"] = {}
        self._lock = threading.Lock()

    def emit(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if pl:
            socketio.emit(
                "download_progress",
                {"pipeline": pl.to_dict()},
                namespace="/downloads",
                room=pipeline_id,  # use room-based broadcast
            )
            socketio.sleep(0)

    def new(self, name: str) -> "PipelineDownload":
        pid = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
        pl = PipelineDownload(pipeline_id=pid, pipeline_name=name)
        with self._lock:
            self.pipelines[pid] = pl
        return pl

    def add_repo_task(self, pl: "PipelineDownload", repo_id: str, total_estimate: int = 0) -> str:
        tid = _tid_repo(repo_id)
        t = pl.tasks.get(tid)
        if t:
            if total_estimate and total_estimate > t.total_bytes:
                t.total_bytes = int(total_estimate)
            return tid
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="repo", name=repo_id, total_bytes=int(total_estimate))
        return tid

    def add_file_task(self, pl: "PipelineDownload", filename: str, size: int) -> str:
        tid = hashlib.md5(f"{filename}_{time.time()}".encode()).hexdigest()[:16]
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="file", name=filename, total_bytes=int(size))
        return tid

    def set_status(self, pl: "PipelineDownload", status: str):
        pl.status = status
        self.emit(pl.pipeline_id)

    def mark_downloading(self, pl: "PipelineDownload", tid: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "downloading"
        self.emit(pl.pipeline_id)

    def update_progress(self, pl: "PipelineDownload", tid: str, done: int, total: Optional[int] = None):
        t = pl.tasks.get(tid)
        if not t:
            return
        if total is not None and total > 0:
            t.total_bytes = int(total)
        t.done_bytes = max(int(done), 0)
        if t.total_bytes > 0:
            t.progress = min(100.0, 100.0 * t.done_bytes / t.total_bytes)
        self.emit(pl.pipeline_id)

    def mark_completed(self, pl: "PipelineDownload", tid: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "completed"
        t.progress = 100.0
        t.done_bytes = max(t.done_bytes, t.total_bytes)
        self.emit(pl.pipeline_id)

    def mark_failed(self, pl: "PipelineDownload", tid: str, msg: str):
        t = pl.tasks.get(tid)
        if not t:
            return
        t.status = "failed"
        t.error_message = msg
        self.emit(pl.pipeline_id)

    def finalize_if_done(self, pl: "PipelineDownload"):
        if not pl.tasks:
            pl.status = "completed"
            self.emit(pl.pipeline_id)
            return
        states = {t.status for t in pl.tasks.values()}
        if states <= {"completed"}:
            pl.status = "completed"
        elif "failed" in states and not any(s in states for s in ("pending", "downloading")):
            pl.status = "failed"
        else:
            pl.status = "downloading"
        self.emit(pl.pipeline_id)

download_manager = DownloadManager()

# ---------------------- Repo allow_patterns (incl. LTX subset) -----------------
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

def _hunyuan_patterns() -> List[str]:
    return ["model_index.json", "scheduler/**", "tokenizer/**", "transformer/**", "vae/**"]

def _ltx_patterns() -> List[str]:
    return [
        "ltxv-2b-0.9.8-distilled-fp8.safetensors",
        "ltxv-spatial-upscaler-0.9.8.safetensors",
        "model_index.json",
        "media/**", "scheduler/**", "text_encoder/**", "tokenizer/**", "transformer/**", "vae/**",
    ]

def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id == "black-forest-labs/FLUX.1-dev":
        return _flux_patterns()
    if repo_id in (
        "stabilityai/sdxl-turbo",
        "stabilityai/stable-diffusion-xl-base-1.0",
        "stabilityai/stable-diffusion-xl-refiner-1.0",
    ):
        return _sdxl_patterns()
    if repo_id == "Lightricks/LTX-Video":
        return [
            "model_index.json",
            "media/**", "scheduler/**", "text_encoder/**", "tokenizer/**", "transformer/**", "vae/**",
        ]
    if repo_id == "linoyts/LTX-Video-spatial-upscaler-0.9.8":
        return [
            "model_index.json",
            "latent_upsampler/**",
            "vae/**",
        ]
    if repo_id == "TencentARC/HunyuanVideo":
        return _hunyuan_patterns()
    return None

# ---------------------- Remote manifest & helpers -----------------------------
def _resolve_remote_size(url: str, headers: Dict[str, str]) -> int:
    # HEAD first
    try:
        r = requests.head(url, allow_redirects=True, headers=headers, timeout=30)
        clen = int(r.headers.get("content-length", "0") or "0")
        if clen > 0: return clen
    except Exception:
        pass
    # Range GET fallback: parse "bytes 0-0/12345"
    try:
        r = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, stream=True, timeout=30)
        cr = r.headers.get("Content-Range", "")
        m = re.search(r"/(\d+)$", cr)
        if m: return int(m.group(1))
    except Exception:
        pass
    return 0

def _list_required_remote_files(repo_id: str, allow_patterns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Returns [{'path': 'unet/diffusion_pytorch_model.bin', 'size': int_or_0}, ...]
    Tries multiple Hub APIs; fills unknown sizes via HEAD/Range.
    """
    api = HfApi(token=_hf_token())
    files: List[Dict[str, Any]] = []

    def _match(p: str) -> bool:
        return True if not allow_patterns else any(fnmatch(p, pat) for pat in allow_patterns)

    # Try 1: list_repo_tree(expand=True)
    try:
        items = api.list_repo_tree(repo_id=repo_id, repo_type="model", revision="main", recursive=True, expand=True)
        for it in items or []:
            if getattr(it, "type", None) == "file" and _match(it.path):
                size = int(getattr(it, "size", 0) or 0)
                files.append({"path": it.path, "size": size})
    except Exception:
        pass

    # Try 2: get_paths_info(recursive=True)
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

    # Try 3: list_repo_files (paths only)
    if not files:
        try:
            paths = api.list_repo_files(repo_id=repo_id, repo_type="model", revision="main")
            for p in paths or []:
                if _match(p):
                    files.append({"path": p, "size": 0})
        except Exception:
            pass

    if not files:
        return []

    # Fill sizes where missing
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    for f in files:
        if f["size"] > 0:
            continue
        try:
            url = hf_hub_url(repo_id=repo_id, filename=f["path"], repo_type="model", revision="main")
            f["size"] = _resolve_remote_size(url, headers)
        except Exception:
            pass
    return files

class RemoteListingUnavailable(Exception):
    pass

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

def _manifest_and_needs(repo_id: str, allow_patterns: Optional[List[str]] = None):
    """
    Returns (manifest, needs_list_of_paths).
    A file is “needed” if:
      - missing locally, or
      - size mismatch (when remote size known), or
      - remote size unknown but local file is zero, or
      - looks like weights (.safetensors) but fails integrity.
    If remote listing fails *and* local repo not OK, raise RemoteListingUnavailable.
    """
    manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
    root = repo_local_dir(repo_id)
    needs: List[str] = []

    local_spec = _repo_completeness(repo_id)
    if not manifest:
        if not local_spec.get("ok", False):
            raise RemoteListingUnavailable(f"Remote listing empty for {repo_id} (HTTP OK).")
        return [], []

    for f in manifest:
        rel = f["path"]
        rsz = int(f.get("size") or 0)
        lp = root / rel
        if not lp.exists():
            needs.append(rel); continue
        try:
            lsz = lp.stat().st_size
        except Exception:
            needs.append(rel); continue

        if rsz > 0 and lsz != rsz:
            needs.append(rel); continue
        if rsz == 0 and lsz <= 0:
            needs.append(rel); continue
        if rel.endswith(".safetensors") and not _is_valid_safetensors(lp):
            logger.warning("[integrity] %s: invalid safetensors; re-fetching", rel)
            needs.append(rel)

    return manifest, needs

# PART 4/5

def _estimate_repo_size(repo_id: str, allow_patterns: Optional[List[str]] = None) -> int:
    try:
        manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
        return sum(int(f.get("size") or 0) for f in manifest)
    except Exception:
        return 0

def _visible_repo_root(root: Path) -> Path:
    try:
        refs_main = root / "refs" / "main"
        snaps = root / "snapshots"
        if refs_main.exists() and snaps.exists():
            rev = refs_main.read_text().strip()
            snap_dir = snaps / rev
            if snap_dir.exists():
                return snap_dir
    except Exception:
        pass
    return root

def _nonzero(p: Path) -> bool:
    try:
        return p.exists() and p.stat().st_size > 0
    except Exception:
        return False

WEIGHT_GLOBS = ["*.safetensors", "pytorch_model.bin", "diffusion_pytorch_model.bin", "tf_model.h5", "flax_model.msgpack"]

def _has_any_weights(path: Path) -> bool:
    if not path.exists():
        return False
    for x in path.rglob("*.safetensors"):
        if _is_valid_safetensors(x):
            return True
    for pat in ["pytorch_model.bin", "diffusion_pytorch_model.bin", "tf_model.h5", "flax_model.msgpack"]:
        for x in path.rglob(pat):
            if _nonzero(x):
                return True
    return False

def _tokenizer_ok(root: Path, name: str = "tokenizer") -> bool:
    return (
        _nonzero(root / f"{name}.json")
        or _nonzero(root / name / "tokenizer.json")
        or (_nonzero(root / f"{name}/vocab.json") and _nonzero(root / f"{name}/merges.txt"))
        or (_nonzero(root / "vocab.json") and _nonzero(root / "merges.txt"))
    )

REPO_SPECS = {
    "black-forest-labs/FLUX.1-dev": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": [],
        "extra_dirs": ["scheduler", "text_encoder", "text_encoder_2"],
    },
    "stabilityai/stable-diffusion-xl-base-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["text_encoder", "text_encoder_2"],
    },
    "stabilityai/stable-diffusion-xl-refiner-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": [],
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
        "must_tokenizers": [],
        "must_weight_dirs": ["text_encoder", "transformer", "vae"],
        "extra_dirs": ["scheduler", "tokenizer", "media"],
        "fallback_any_weights": True,
    },
    "TencentARC/HunyuanVideo": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "vae", "scheduler"],
    },
    "stabilityai/stable-audio-open-1.0": {
        "must_files": ["model_index.json"],
        "must_tokenizers": ["tokenizer"],
        "must_weight_dirs": ["transformer", "scheduler"],
    },
    "linoyts/LTX-Video-spatial-upscaler-0.9.8": {
        "must_files": ["model_index.json"],
        "must_tokenizers": [],
        "must_weight_dirs": ["latent_upsampler", "vae"],
    },
}

DEFAULT_SPEC = {
    "must_files": ["model_index.json"],
    "must_weight_dirs": [],
    "must_tokenizers": [],
    "fallback_any_weights": True,
}

def _repo_completeness(repo_id: str) -> Dict[str, Any]:
    base_root = repo_local_dir(repo_id)
    root = _visible_repo_root(base_root)
    report = {"repo": repo_id, "root": str(base_root), "exists": base_root.exists(), "ok": False, "missing": []}
    if not base_root.exists():
        report["missing"].append("<entire repo>"); return report

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

    if not report["missing"] and REPO_SPECS.get(repo_id) is None:
        if DEFAULT_SPEC.get("fallback_any_weights") and not _has_any_weights(root):
            report["missing"].append("any weights (*.safetensors / *.bin)")

    report["ok"] = len(report["missing"]) == 0
    return report

def _remote_missing_or_mismatch(repo_id: str, allow_patterns: Optional[List[str]] = None) -> Optional[int]:
    api = HfApi(token=_hf_token())
    root = repo_local_dir(repo_id)
    try:
        items = api.list_repo_tree(repo_id=repo_id, repo_type="model", recursive=True)
    except Exception:
        return None

    missing = 0
    for it in items or []:
        if getattr(it, "type", None) != "file":
            continue
        rel = it.path
        if allow_patterns and not any(fnmatch(rel, pat) for pat in allow_patterns):
            continue
        lp = root / rel
        if not lp.exists():
            missing += 1; continue
        try:
            rsize = int(getattr(it, "size", 0) or 0)
            lsize = lp.stat().st_size
            if rsize > 0 and lsize != rsize:
                missing += 1
        except Exception:
            missing += 1
    return missing

def _repo_readiness(repo_id: str) -> Dict[str, Any]:
    local = _repo_completeness(repo_id)
    pats = allow_patterns_for_repo(repo_id)
    remote_missing = _remote_missing_or_mismatch(repo_id, allow_patterns=pats)

    status = {
        "repo": repo_id,
        "root": local["root"],
        "exists": local["exists"],
        "ok": False,
        "missing": None if remote_missing is None else int(remote_missing if local["ok"] else max(1, remote_missing)),
        "missing_list": local["missing"],
    }

    if local["ok"]:
        status["ok"] = True
        status["missing"] = 0
        return status

    if remote_missing is None:
        status["ok"] = bool(local["ok"])
    else:
        status["ok"] = bool(local["ok"] and remote_missing == 0)
    return status

def _repos_ready_or_resp(*repo_ids: str) -> Optional[tuple]:
    statuses = []
    needs_auth = False
    any_local_missing = False

    for rid in repo_ids:
        st = _repo_readiness(rid)
        statuses.append(st)
        if st.get("missing") is None and not st.get("ok", False):
            needs_auth = True
        if st.get("missing") not in (None, 0) or not st.get("ok", False):
            any_local_missing = True

    if all(s.get("ok") for s in statuses):
        return None

    if needs_auth:
        return jsonify({
            "error": "Repository not accessible (auth/terms or offline).",
            "repos": statuses,
            "hint": "Set HF_TOKEN (or HUGGINGFACE_HUB_TOKEN) and accept model card terms; or check network.",
        }), 403

    if any_local_missing:
        return jsonify({
            "error": "Local repositories not ready",
            "repos": statuses,
            "hint": "Use /pipelines/prefetch (or set auto_download:true on your request) and then Re-check.",
        }), 409

    return jsonify({"error": "Unknown readiness state", "repos": statuses}), 409

# --------------------------- Per-file streamers -------------------------------
def _stream_file_task(pl: PipelineDownload, tid: str, url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    resume_from = tmp.stat().st_size if tmp.exists() else 0

    if resume_from > 0:
        download_manager.update_progress(pl, tid, done=resume_from, total=None)
    download_manager.mark_downloading(pl, tid)

    try:
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            mode = "ab" if resume_from > 0 else "wb"
            done = resume_from
            total = int(r.headers.get("content-length", 0)) or None
            if total:
                download_manager.update_progress(pl, tid, done=done, total=total)
            with open(tmp, mode) as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    download_manager.update_progress(pl, tid, done=done, total=total)
        tmp.replace(dest)
        if dest.suffix == ".safetensors" and not _is_valid_safetensors(dest):
            raise RuntimeError("Downloaded weights file failed integrity check")
        if total:
            download_manager.update_progress(pl, tid, done=total, total=total)
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
    if remote_size > 0:
        download_manager.update_progress(pl, tid, done=0, total=remote_size)

    resume_from = 0
    if tmp.exists():
        try:
            resume_from = tmp.stat().st_size
        except Exception:
            resume_from = 0
    if remote_size > 0 and resume_from > remote_size:
        try: tmp.unlink(missing_ok=True)
        except Exception: pass
        resume_from = 0

    max_attempts = 5
    backoff = 1.0
    attempt = 0
    last_err = None

    while attempt < max_attempts:
        attempt += 1
        try:
            req_headers = dict(headers)
            if resume_from > 0:
                req_headers["Range"] = f"bytes={resume_from}-"

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
                        f.write(chunk)
                        done += len(chunk)
                        download_manager.update_progress(pl, tid, done=done, total=total)

            tmp.replace(dest)
            if rel_path.endswith(".safetensors") and not _is_valid_safetensors(dest):
                raise RuntimeError("Downloaded weights file failed integrity check")

            if remote_size > 0:
                download_manager.update_progress(pl, tid, done=remote_size, total=remote_size)
            download_manager.mark_completed(pl, tid)
            return

        except Exception as e:
            last_err = e
            logger.warning(f"[stream] attempt {attempt}/{max_attempts} failed: {repo_id}/{rel_path} — {e}")
            time.sleep(backoff)
            backoff = min(backoff * 2, 10.0)

    logger.error(f"[stream] giving up: {repo_id}/{rel_path} — {last_err}")
    download_manager.mark_failed(pl, tid, str(last_err) if last_err else "download failed")

def _prefetch_repo_files_task(pl: PipelineDownload, repo_id: str, allow_patterns: Optional[List[str]], max_workers: int = 4):
    root = repo_local_dir(repo_id)
    root.mkdir(parents=True, exist_ok=True)

    container_tid = download_manager.add_repo_task(pl, repo_id, total_estimate=0)
    download_manager.mark_downloading(pl, container_tid)

    try:
        manifest, needs = _manifest_and_needs(repo_id, allow_patterns=allow_patterns)
        logger.info(f"[files] {repo_id}: manifest={len(manifest)} needs={len(needs)}")
    except RemoteListingUnavailable as e:
        logger.error(f"[files] {repo_id}: {e}")
        download_manager.mark_failed(pl, container_tid, str(e))
        download_manager.finalize_if_done(pl); return
    except Exception as e:
        logger.exception(f"[files] {repo_id}: manifest error")
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
    file_tids: Dict[str, str] = {}
    for rel in needs:
        size = path_to_size.get(rel, 0)
        title = f"{repo_id}/{rel}"
        tid = hashlib.md5(f"{title}_{time.time()}".encode()).hexdigest()[:16]
        pl.tasks[tid] = DownloadTask(task_id=tid, kind="file", name=title, total_bytes=size, status="pending")
        if size > 0:
            download_manager.update_progress(pl, tid, done=0, total=size)
        file_tids[rel] = tid

    download_manager.emit(pl.pipeline_id)

    failed_any = False
    completed = 0
    total_files = len(needs)

    def _wrap(rel_path: str):
        nonlocal failed_any
        tid = file_tids[rel_path]
        try:
            download_manager.mark_downloading(pl, tid)
            _stream_hf_file_task(pl, tid, repo_id, rel_path, path_to_size.get(rel_path, 0))
        except Exception as e:
            failed_any = True
            logger.exception(f"[files] worker crashed: {repo_id}/{rel_path}")
            download_manager.mark_failed(pl, tid, str(e))

    # Use threads for network IO; eventlet will still handle sockets
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = [ex.submit(_wrap, rel) for rel in needs]
        for fut in as_completed(futs):
            try:
                fut.result()
            except Exception:
                failed_any = True
            completed += 1
            download_manager.update_progress(pl, container_tid, done=completed, total=total_files)

    states = {t.status for t in pl.tasks.values() if t.kind == "file" and t.name.startswith(f"{repo_id}/")}
    if "failed" in states:
        failed_list = [t.name for t in pl.tasks.values() if t.kind == "file" and t.status == "failed" and t.name.startswith(f"{repo_id}/")]
        preview = failed_list[:6]; more = max(0, len(failed_list) - len(preview))
        msg = "Some files failed: " + ", ".join(preview) + (f" (+{more} more)" if more else "")
        download_manager.mark_failed(pl, container_tid, msg)
    else:
        download_manager.mark_completed(pl, container_tid)

    download_manager.finalize_if_done(pl)

def _prefetch_repo_snapshot_task(pl: PipelineDownload, tid: str, repo_id: str, allow_patterns: Optional[List[str]]):
    """
    Fallback when Hub listing is unavailable: snapshot_download with moving-total
    progress based on bytes present under the repo.
    """
    root = repo_local_dir(repo_id)
    root.mkdir(parents=True, exist_ok=True)

    manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)

    def _bytes_done_for_manifest() -> int:
        total = 0
        for f in manifest:
            lp = root / f["path"]
            rsz = int(f.get("size") or 0)
            try:
                lsz = lp.stat().st_size if lp.exists() else 0
            except Exception:
                lsz = 0
            total += min(lsz, rsz) if rsz > 0 else lsz
        return total

    initial_total = sum(int(f.get("size") or 0) for f in manifest)
    done0 = _bytes_done_for_manifest()
    moving_total = max(initial_total, done0 + max(32 * 1024 * 1024, int(done0 * 0.10)))

    download_manager.mark_downloading(pl, tid)
    download_manager.update_progress(pl, tid, done=done0, total=moving_total)

    stop_flag = {"stop": False}
    def _poll():
        nonlocal moving_total
        while not stop_flag["stop"]:
            try:
                done = _bytes_done_for_manifest()
                grow_floor = max(32 * 1024 * 1024, int(done * 0.10))
                if done >= moving_total:
                    moving_total = done + grow_floor
                download_manager.update_progress(pl, tid, done=done, total=moving_total)
            except Exception:
                pass
            time.sleep(0.8)

    poll_th = threading.Thread(target=_poll, daemon=True)
    poll_th.start()

    try:
        snapshot_download(
            repo_id=repo_id,
            repo_type="model",
            token=_hf_token(),
            local_dir=str(root),
            allow_patterns=allow_patterns,
            ignore_patterns=None,
            resume_download=True,
            revision="main",
        )
        stop_flag["stop"] = True
        poll_th.join(timeout=1.0)
        final_done = _bytes_done_for_manifest()
        final_total = max(final_done, moving_total, 1)
        download_manager.update_progress(pl, tid, done=final_done, total=final_total)
        download_manager.mark_completed(pl, tid)

    except Exception as e:
        stop_flag["stop"] = True
        poll_th.join(timeout=1.0)
        download_manager.mark_failed(pl, tid, str(e))
    finally:
        download_manager.finalize_if_done(pl)

# --------------------------- Planning / prefetch API ---------------------------
FLUX_REPO         = "black-forest-labs/FLUX.1-dev"
SDXL_BASE_REPO    = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"
SDXL_TURBO_REPO   = "stabilityai/sdxl-turbo"
LTX_REPO          = "Lightricks/LTX-Video"
LTX_UPSAMPLER_REPO = "linoyts/LTX-Video-spatial-upscaler-0.9.8"
HUNYUAN_REPO      = "TencentARC/HunyuanVideo"
STABLE_AUDIO_REPO = "stabilityai/stable-audio-open-1.0"
WAN_REPO          = "deepseek-ai/WAN"  # placeholder

# Optional GGUFs
FLUX_GGUF_NAME = os.getenv("FLUX_GGUF_FILENAME", "flux1-dev-Q8_0.gguf").strip()
FLUX_GGUF_URL  = os.getenv("FLUX_GGUF_URL", "https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q8_0.gguf").strip()
LTX_GGUF_NAME  = os.getenv("LTX_GGUF_FILENAME", "").strip() or None
LTX_GGUF_URL   = os.getenv("LTX_GGUF_URL", "").strip() or None
HUNYUAN_GGUF_NAME = os.getenv("HUNYUAN_GGUF_FILENAME", "").strip() or None
HUNYUAN_GGUF_URL  = os.getenv("HUNYUAN_GGUF_URL", "").strip() or None
WAN_GGUF_NAME  = os.getenv("WAN_GGUF_FILENAME", "").strip() or None
WAN_GGUF_URL   = os.getenv("WAN_GGUF_URL", "").strip() or None

def _gguf_status(name: Optional[str]) -> Dict[str, Any]:
    if not name:
        return {"configured": False, "path": None, "exists": False, "size": 0}
    p = MODEL_DIR / name
    ok = p.exists() and p.stat().st_size > 0
    return {"configured": True, "path": str(p), "exists": ok, "size": p.stat().st_size if ok else 0}

def _plan_for(pipeline: str) -> Dict[str, Any]:
    plan = {"pipeline": pipeline, "repos_to_fetch": [], "single_files": [], "notes": []}
    if pipeline == "flux":
        plan["repos_to_fetch"] = [FLUX_REPO]
        plan["single_files"].append({"name": FLUX_GGUF_NAME, "url": FLUX_GGUF_URL, "optional": False})
        plan["gguf_status"] = [_gguf_status(FLUX_GGUF_NAME)]
    elif pipeline == "sdxl_intermediate":
        plan["repos_to_fetch"] = [SDXL_BASE_REPO, SDXL_REFINER_REPO]; plan["gguf_status"] = []
    elif pipeline == "sdxl_turbo":
        plan["repos_to_fetch"] = [SDXL_TURBO_REPO]; plan["gguf_status"] = []
    elif pipeline in ("ltx_video", "ltx"):
        plan["repos_to_fetch"] = [LTX_REPO, LTX_UPSAMPLER_REPO]
        if LTX_GGUF_NAME:
            plan["single_files"].append({"name": LTX_GGUF_NAME, "url": LTX_GGUF_URL, "optional": True})
        plan["gguf_status"] = [_gguf_status(LTX_GGUF_NAME)]
    elif pipeline in ("hunyuan_video", "hunyuan"):
        plan["repos_to_fetch"] = [HUNYUAN_REPO]
        if HUNYUAN_GGUF_NAME:
            plan["single_files"].append({"name": HUNYUAN_GGUF_NAME, "url": HUNYUAN_GGUF_URL, "optional": True})
        plan["gguf_status"] = [_gguf_status(HUNYUAN_GGUF_NAME)]
    elif pipeline in ("wan", "wan_video"):
        plan["repos_to_fetch"] = [WAN_REPO]
        if WAN_GGUF_NAME:
            plan["single_files"].append({"name": WAN_GGUF_NAME, "url": WAN_GGUF_URL, "optional": True})
        plan["gguf_status"] = [_gguf_status(WAN_GGUF_NAME)]
    elif pipeline in ("music", "stable_audio"):
        plan["repos_to_fetch"] = [STABLE_AUDIO_REPO]; plan["gguf_status"] = []
    else:
        raise ValueError(f"Unknown pipeline '{pipeline}'")
    return plan

def _start_prefetch_pipeline(pipeline: str) -> Dict[str, Any]:
    """Start a prefetch (used by /pipelines/prefetch and by endpoints with auto_download)."""
    plan = _plan_for(pipeline)
    pl = download_manager.new(f"prefetch:{pipeline}")

    # Immediately mark as 'downloading' and emit a first snapshot so UI sees it
    download_manager.set_status(pl, "downloading")
    download_manager.emit(pl.pipeline_id)

    # Queue repo downloads (prefer per-file; fallback to snapshot)
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid)
        if st.get("missing") is None and not st.get("ok", False):
            logger.warning("[prefetch] skipping %s due to remote inaccessibility", rid)
            continue
        if st.get("ok", False):
            continue

        pats = allow_patterns_for_repo(rid)
        try:
            manifest, needs = _manifest_and_needs(rid, allow_patterns=pats)
        except RemoteListingUnavailable:
            total_est = _estimate_repo_size(rid, allow_patterns=pats)
            tid = download_manager.add_repo_task(pl, repo_id=rid, total_estimate=total_est)
            socketio.start_background_task(_prefetch_repo_snapshot_task, pl, tid, rid, pats)
            continue
        except Exception:
            total_est = _estimate_repo_size(rid, allow_patterns=pats)
            tid = download_manager.add_repo_task(pl, repo_id=rid, total_estimate=total_est)
            socketio.start_background_task(_prefetch_repo_snapshot_task, pl, tid, rid, pats)
            continue

        if not needs:
            continue

        socketio.start_background_task(_prefetch_repo_files_task, pl, rid, pats, 4)

    # Queue GGUF/single files
    for f in plan.get("single_files", []):
        name = (f.get("name") or "").strip()
        url = (f.get("url") or "").strip()
        if not name: continue
        dest = MODEL_DIR / name
        try:
            if dest.exists() and dest.stat().st_size > 0:
                tid = download_manager.add_file_task(pl, filename=name, size=dest.stat().st_size)
                download_manager.update_progress(pl, tid, done=dest.stat().st_size, total=dest.stat().st_size)
                download_manager.mark_completed(pl, tid)
                continue
        except Exception:
            pass
        if not url: continue
        tid = download_manager.add_file_task(pl, filename=name, size=0)
        socketio.start_background_task(_stream_file_task, pl, tid, url, dest)

    if not pl.tasks:
        download_manager.set_status(pl, "completed")
        return {
            "http_status": 200,
            "json": {
                "message": "Everything already present",
                "pipeline_id": pl.pipeline_id,
                "pipelines_started": [],
                "download_websocket_url": downloads_url(),
                "details": {"plan": plan, "download_pipelines": [], "notes": []},
            }
        }

    logger.info("[prefetch] started pipeline %s for %s", pl.pipeline_id, pipeline)
    return {
        "http_status": 202,
        "json": {
            "message": "Prefetch started",
            "pipeline_id": pl.pipeline_id,
            "pipelines_started": [pl.pipeline_id],
            "download_websocket_url": downloads_url(),
            "details": {
                "plan": plan,
                "download_pipelines": [{"kind": "mixed", "pipeline_id": pl.pipeline_id}],
                "notes": [],
            },
        }
    }

# ------------------------------ REST: plan/prefetch ----------------------------
@app.route("/pipelines/plan", methods=["POST"])
def pipelines_plan():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    if not pipeline:
        return jsonify({"error": "Provide 'pipeline'."}), 400

    try:
        plan = _plan_for(pipeline)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    repos_status, auth_repos = [], []
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid)
        repos_status.append(st)
        if st.get("missing") is None and not st.get("ok", False):
            auth_repos.append(rid)

    ok_repos = all(r.get("ok") for r in repos_status) if repos_status else True
    ok_gguf = all((not g.get("configured")) or g.get("exists") for g in plan.get("gguf_status", []))

    resp = {
        "plan": plan,
        "repos": repos_status,
        "gguf_status": plan.get("gguf_status", []),
        "notes": plan.get("notes", []),
        "ok": bool(ok_repos and ok_gguf),
    }
    if auth_repos:
        resp["auth_required"] = True
        resp["auth_repos"] = auth_repos
    return jsonify(resp), 200

@app.route("/pipelines/prefetch", methods=["POST"])
def pipelines_prefetch():
    data = request.json or {}
    pipeline = (data.get("pipeline") or "").strip()
    if not pipeline:
        return jsonify({"error": "Provide 'pipeline'."}), 400

    try:
        started = _start_prefetch_pipeline(pipeline)
        return jsonify(started["json"]), started["http_status"]
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

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

# ------------------------------ Readiness helpers -----------------------------
def _ensure_flux_ready(auto_download: bool = False) -> Optional[tuple]:
    gguf = MODEL_DIR / FLUX_GGUF_NAME
    if not (gguf.exists() and gguf.stat().st_size > 0):
        if auto_download:
            started = _start_prefetch_pipeline("flux")
            return jsonify(started["json"]), started["http_status"]
        return jsonify({
            "error": "GGUF missing locally",
            "missing": str(gguf),
            "hint": 'Run /pipelines/prefetch {"pipeline":"flux"}.',
        }), 409
    guard = _repos_ready_or_resp(FLUX_REPO)
    if guard:
        if auto_download:
            started = _start_prefetch_pipeline("flux")
            return jsonify(started["json"]), started["http_status"]
        return guard
    return None

# ------------------------------ Generation: Flux -------------------------------
@app.route("/image/quality", methods=["POST"])
def image_quality_flux():
    import logging as _logging
    _logging.getLogger("transformers.tokenization_utils_base").setLevel(_logging.ERROR)

    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    h = int(data.get("height", 512)); w = int(data.get("width", 768))
    cb_steps = int(data.get("callback_steps", 1))
    auto_dl = bool(data.get("auto_download", False))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _ensure_flux_ready(auto_download=auto_dl)
    if guard: return guard

    gen_id = genbus.new("flux_image", {"endpoint": "/image/quality", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        transformer = FluxTransformer2DModel.from_single_file(
            str(MODEL_DIR / FLUX_GGUF_NAME),
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
            torch_dtype=torch.bfloat16,
        ).to(device)

        pipe = FluxPipeline.from_pretrained(
            str(repo_local_dir(FLUX_REPO)),
            transformer=transformer,
            torch_dtype=torch.bfloat16,
            local_files_only=True,
        ).to(device)

        total_steps = 4
        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), total_steps)

        image = pipe(
            prompt=prompt,
            guidance_scale=0.0,
            height=h,
            width=w,
            num_inference_steps=total_steps,
            callback=cb,
            callback_steps=max(1, cb_steps),
        ).images[0]

        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": generation_url()}), 201
    except Exception as e:
        logger.exception("FLUX generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

# ------------------------------ Generation: SDXL (intermediate) ---------------
@app.route("/image/intermediate", methods=["POST"])
def image_intermediate_sdxl():
    import logging as _logging
    _logging.getLogger("transformers.tokenization_utils_base").setLevel(_logging.ERROR)

    data = request.json or {}
    prompt = data.get("prompt", "")
    negative_prompt = data.get("negative_prompt", "bad anatomy, extra hands, extra legs, extra fingers, poorly drawn face, fused face, cloned face")
    height = int(data.get("height", 1024))
    width  = int(data.get("width", 1024))
    ckpt_filename = data.get("ckpt", "cyberrealistic.safetensors")
    lora = data.get("lora", "cyberrealistic.safetensors")
    lora_strength = float(data.get("lora_strength", 1.0))
    steps_base = int(data.get("steps_base", 50))
    steps_ref  = int(data.get("steps_refiner", 50))
    denoising_split = float(data.get("denoising_split", 0.9))
    cb_steps = int(data.get("callback_steps", 5))
    auto_dl = bool(data.get("auto_download", False))

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

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
        try:
            ckpt_path = (MODEL_DIR / ckpt_filename).resolve()
            if ckpt_path.exists() and ckpt_path.stat().st_size > 0 and ckpt_path.suffix.lower() == ".safetensors":
                try:
                    base = StableDiffusionXLPipeline.from_single_file(
                        str(ckpt_path), torch_dtype=dtype, use_safetensors=True, local_files_only=True
                    ).to(device)
                    logger.info(f"[sdxl] Loaded base from single-file checkpoint: {ckpt_path.name}")
                except Exception as e:
                    logger.warning(f"[sdxl] Single-file load failed, will fall back to repo: {e}")
        except Exception:
            pass

        if base is None:
            base_root = repo_local_dir(SDXL_BASE_REPO)
            base = StableDiffusionXLPipeline.from_pretrained(
                str(base_root),
                torch_dtype=dtype,
                use_safetensors=True,
                variant="fp16",
                local_files_only=True,
            ).to(device)

        if lora:
            try:
                lora_path = MODEL_DIR / lora
                if lora_path.exists() and lora_path.stat().st_size > 0:
                    try:
                        base.load_lora_weights(str(lora_path))
                        try:
                            base.set_adapters(["default"], adapter_weights=[lora_strength])
                        except Exception:
                            try: base.fuse_lora(lora_scale=lora_strength)
                            except Exception: pass
                        logger.info(f"[sdxl] LoRA applied to base: {lora_path.name} (strength={lora_strength})")
                    except Exception as e1:
                        try:
                            base.unet.load_attn_procs(str(lora_path))
                            try: base.fuse_lora(lora_scale=lora_strength)
                            except Exception: pass
                            logger.info(f"[sdxl] UNet attn_procs LoRA applied to base: {lora_path.name} (strength={lora_strength})")
                        except Exception:
                            logger.warning(f"[sdxl] Skipping base LoRA: {e1}")
            except Exception as e:
                logger.warning(f"[sdxl] Skipping base LoRA: {e}")

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

        ref_root = repo_local_dir(SDXL_REFINER_REPO)
        refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            str(ref_root),
            text_encoder_2=getattr(base, "text_encoder_2", None),
            vae=getattr(base, "vae", None),
            torch_dtype=dtype,
            use_safetensors=True,
            variant="fp16",
            local_files_only=True,
        ).to(device)

        if lora:
            try:
                lora_path = MODEL_DIR / lora
                if lora_path.exists() and lora_path.stat().st_size > 0:
                    try:
                        refiner.load_lora_weights(str(lora_path))
                        try: refiner.set_adapters(["default"], adapter_weights=[lora_strength])
                        except Exception:
                            try: refiner.fuse_lora(lora_scale=lora_strength)
                            except Exception: pass
                        logger.info(f"[sdxl] LoRA applied to refiner: {lora_path.name} (strength={lora_strength})")
                    except Exception as e1:
                        try:
                            refiner.unet.load_attn_procs(str(lora_path))
                            try: refiner.fuse_lora(lora_scale=lora_strength)
                            except Exception: pass
                            logger.info(f"[sdxl] UNet attn_procs LoRA applied to refiner: {lora_path.name} (strength={lora_strength})")
                        except Exception:
                            logger.info(f"[sdxl] Refiner LoRA not applied (often fine): {e1}")
            except Exception:
                pass

        try:
            if device.type == "cuda":
                refiner.unet = torch.compile(refiner.unet, mode="reduce-overhead", fullgraph=True)
        except Exception:
            pass

        from compel import Compel, ReturnedEmbeddingsType
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

# ------------------------------ Generation: LTX i2v --------------------------

def _round_for_vae(h: int, w: int, pipe) -> tuple[int, int]:
    ratio = getattr(pipe, "vae_spatial_compression_ratio", 8)
    return h - (h % ratio), w - (w % ratio)

def _img_b64_to_pil(b64: str) -> Image.Image:
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")

def _make_condition_video_from_image(img: Image.Image, n_frames: int = 8) -> np.ndarray:
    """
    Create a tiny 'video' tensor by repeating the image n_frames times.
    Shape: (T, H, W, 3), dtype=uint8. This avoids single-frame MP4 I/O.
    """
    arr = np.array(img, copy=False)
    # ensure HWC uint8
    if arr.dtype != np.uint8:
        arr = arr.astype(np.uint8)
    return np.stack([arr] * max(2, n_frames), axis=0)

@app.route("/image/video", methods=["POST"])
def ltx_image_to_video():
    """
    Image -> Video using LTX (aligned with HF example), but:
    - Condition video built in-memory (no imageio/ffmpeg).
    - Scheduler dynamic shifting disabled to avoid 'mu' requirement.
    - Same repos/download/progress logic as the rest of the server.
    """
    import io, os, time, base64
    import numpy as np
    from PIL import Image
    import torch
    from diffusers import LTXConditionPipeline, LTXLatentUpsamplePipeline
    from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
    from diffusers.utils import load_image  # used for URL case only

    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    neg = data.get("negative_prompt", "worst quality, inconsistent motion, blurry, jitter, artifacts")

    expected_h = int(data.get("height", 480))
    expected_w = int(data.get("width", 832))
    frames     = int(data.get("frames", 96))
    fps        = int(data.get("fps", 24))

    # HF example defaults
    steps_gen  = int(data.get("steps_gen", 30))     # part 1
    steps_ref  = int(data.get("steps_refine", 10))  # part 3
    decode_ts  = float(data.get("decode_timestep", 0.05))
    img_noise  = float(data.get("image_cond_noise_scale", 0.025))
    seed       = data.get("seed", None)
    auto_dl    = bool(data.get("auto_download", False))

    image_b64  = (data.get("image_base64") or "").strip()
    image_url  = (data.get("image_url") or "").strip()

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400
    if not image_b64 and not image_url:
        return jsonify({"error": "Provide 'image_base64' or 'image_url'"}), 400

    # Make sure weights are present locally or trigger your downloader
    guard = _repos_ready_or_resp(LTX_REPO, LTX_UPSAMPLER_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("ltx_video")
            return jsonify(started["json"]), started["http_status"]
        return guard

    # Progress (coarse stages)
    gen_id = genbus.new(
        "ltx_i2v",
        {"stage": "starting", "pct": 0, "frames": frames, "fps": fps, "w": expected_w, "h": expected_h},
    )
    try:
        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type in ("cuda", "mps") else torch.float32
        generator = torch.Generator(device=device)
        if isinstance(seed, int):
            generator.manual_seed(seed)

        base_dir = repo_local_dir(LTX_REPO)
        ups_dir  = repo_local_dir(LTX_UPSAMPLER_REPO)

        pipe = LTXConditionPipeline.from_pretrained(
            str(base_dir), torch_dtype=dtype, local_files_only=True, use_safetensors=True
        ).to(device)

        # --- CRITICAL FIX: disable dynamic shifting to avoid 'mu' requirement ---
        try:
            pipe.scheduler.register_to_config(use_dynamic_shifting=False)
        except Exception:
            pass

        pipe_ups = LTXLatentUpsamplePipeline.from_pretrained(
            str(ups_dir), vae=pipe.vae, torch_dtype=dtype, local_files_only=True, use_safetensors=True
        ).to(device)

        try:
            pipe.vae.enable_tiling()
        except Exception:
            pass

        # Helper: round dims to multiples of VAE compression ratio (from HF docs)
        def round_for_vae(h: int, w: int) -> tuple[int, int]:
            ratio = getattr(pipe, "vae_spatial_compression_ratio", 8)
            return h - (h % ratio), w - (w % ratio)

        # --- Build condition video IN-MEMORY (avoid ffmpeg/imageio) ---
        # LTXVideoCondition accepts an np.ndarray video of shape [T, H, W, 3] (uint8)
        genbus.progress(gen_id, "prepare_condition", 1, 5)
        if image_url:
            im = load_image(image_url).convert("RGB")
        else:
            raw = base64.b64decode(image_b64)
            im = Image.open(io.BytesIO(raw)).convert("RGB")

        cond_arr = np.array(im, dtype=np.uint8)              # [H, W, 3]
        cond_vid = np.stack([cond_arr, cond_arr], axis=0)    # [T=2, H, W, 3] -> “video-like” tensor
        condition = LTXVideoCondition(video=cond_vid, frame_index=0)

        # --- Part 1: generate at 2/3 scale (HF example) ---
        downscale = 2.0 / 3.0
        dh, dw = int(expected_h * downscale), int(expected_w * downscale)
        dh, dw = round_for_vae(dh, dw)

        genbus.progress(gen_id, "generate_base", 2, 5)
        out_base = pipe(
            conditions=[condition],
            prompt=prompt,
            negative_prompt=neg,
            width=dw,
            height=dh,
            num_frames=frames,
            num_inference_steps=steps_gen,
            generator=generator if isinstance(seed, int) else None,
            output_type="latent",
        )
        latents = out_base.frames  # latent video

        # --- Part 2: latent upsample (2x spatial) ---
        genbus.progress(gen_id, "upsample_latents", 3, 5)
        up_latents = pipe_ups(
            latents=latents,
            output_type="latent",
        ).frames
        uh, uw = dh * 2, dw * 2

        # --- Part 3: brief denoise refinement at upscaled size ---
        genbus.progress(gen_id, "refine_frames", 4, 5)
        out_ref = pipe(
            conditions=[condition],
            prompt=prompt,
            negative_prompt=neg,
            width=uw,
            height=uh,
            num_frames=frames,
            denoise_strength=0.4,              # effectively ~4/10 steps
            num_inference_steps=steps_ref,
            latents=up_latents,
            decode_timestep=decode_ts,
            image_cond_noise_scale=img_noise,
            generator=generator if isinstance(seed, int) else None,
            output_type="pil",
        )
        frames_pil = out_ref.frames[0]
        if not frames_pil:
            raise RuntimeError("LTX returned no frames")

        # --- Part 4: final resize to requested size & encode ---
        genbus.progress(gen_id, "encode_video", 5, 5)
        frames_pil = [fr.resize((expected_w, expected_h), Image.BICUBIC) for fr in frames_pil]

        out_name = f"_ltx_{int(time.time())}.mp4"
        out_path = os.path.join(os.getcwd(), out_name)

        # Use diffusers' writer (good defaults); no ffmpeg read is needed anymore.
        from diffusers.utils import export_to_video
        export_to_video(frames_pil, out_path, fps=fps)

        genbus.finish(gen_id, {"video_path": out_path})
        return jsonify({"ok": True, "video_path": out_path}), 201

    except Exception as e:
        logger.exception("LTX image->video failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            DeviceManager.free_memory()
        except Exception:
            pass

      
# ------------------------------ Generation: Hunyuan ---------------------------
@app.route("/video/max", methods=["POST"])
def hunyuan_video():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    H = int(data.get("height", 720)); W = int(data.get("width", 1280))
    frames = int(data.get("frames", 129)); steps = int(data.get("steps", 30))
    fps = int(data.get("fps", 24)); cb_steps = int(data.get("callback_steps", 1))
    auto_dl = bool(data.get("auto_download", False))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(HUNYUAN_REPO)
    if guard:
        if auto_dl:
            started = _start_prefetch_pipeline("hunyuan")
            return jsonify(started["json"]), started["http_status"]
        return guard

    gen_id = genbus.new("hunyuan_video", {"endpoint": "/video/max", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type != "mps" else torch.float16
        root = repo_local_dir(HUNYUAN_REPO)

        pipe = HunyuanVideoPipeline.from_pretrained(
            str(root), torch_dtype=dtype, local_files_only=True
        ).to(device)
        pipe.scheduler = FlowMatchEulerDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.scheduler.set_timesteps(steps, device=device)

        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), steps)

        frames_list = pipe(
            prompt=prompt, negative_prompt="worst quality",
            height=H, width=W, num_frames=frames, num_inference_steps=steps,
            output_type="pil", callback=cb, callback_steps=max(1, cb_steps)
        ).frames[0]

        out_path = f"hunyuan_{int(time.time())}.mp4"
        export_to_video(frames_list, out_path, fps=fps)
        genbus.finish(gen_id, {"ok": True, "video": out_path})
        return jsonify({"prompt": prompt, "video_path": out_path, "generation_id": gen_id, "generation_websocket_url": generation_url()}), 201
    except Exception as e:
        logger.exception("Hunyuan video failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

# ------------------------------ Music (stub) ----------------------------------
@app.route("/music", methods=["POST"])
def music_stable_audio():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(STABLE_AUDIO_REPO)
    if guard:
        return guard

    gen_id = genbus.new("music", {"endpoint": "/music", "prompt": prompt})
    try:
        genbus.finish(gen_id, {"ok": True})
        return jsonify({
            "message": "Music pipeline stub. Add Stable Audio code here.",
            "generation_id": gen_id,
            "generation_websocket_url": generation_url()
        }), 200
    except Exception as e:
        logger.exception("Music gen failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500

# -------------------------------- Health & main --------------------------------
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
