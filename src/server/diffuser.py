#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import re
import gc
import time
import json
import base64
import logging
import threading
import hashlib
from io import BytesIO
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

import requests
import torch
from PIL import Image
from appdirs import user_data_dir
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from fnmatch import fnmatch

# ---- Hugging Face
from huggingface_hub import HfApi, hf_hub_url

# Robust import for HfHubHTTPError across hub versions
try:
    from huggingface_hub.errors import HfHubHTTPError  # modern path
except Exception:
    try:
        from huggingface_hub.utils import HfHubHTTPError  # legacy path
    except Exception:  # very old or edge case; make a lightweight alias
        class HfHubHTTPError(Exception):
            pass

# ---- Diffusers (only what we actually use for endpoints)
from diffusers import (
    DiffusionPipeline,
    AutoPipelineForText2Image,
    FluxPipeline,
    FluxTransformer2DModel,
    GGUFQuantizationConfig,
    StableDiffusionXLImg2ImgPipeline,
    FlowMatchEulerDiscreteScheduler,
    HunyuanVideoPipeline,
    LTXConditionPipeline,
    LTXLatentUpsamplePipeline,
)
from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
from diffusers.utils import export_to_video, load_image, load_video

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
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")

LOCAL_ONLY = bool(int(os.getenv("BONZAI_LOCAL_ONLY", "1")))

# Hard safety cap to avoid run-away downloads (default 60 GB)
# Override with: BONZAI_MAX_REPO_BYTES=<bytes>
MAX_REPO_BYTES = int(os.getenv("BONZAI_MAX_REPO_BYTES", str(60 * (1 << 30))))
CHUNK_SIZE = 1 << 20  # 1 MiB

def _hf_token() -> Optional[str]:
    return os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

# ---------------------------- Flask / Socket.IO -------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "bonzai-secret-key")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading",
                    logger=False, engineio_logger=False)

def ws_downloads_url() -> str:
    return request.host_url.replace("http://", "ws://").replace("https://", "wss://") + "downloads"

def ws_generation_url() -> str:
    return request.host_url.replace("http://", "ws://").replace("https://", "wss://") + "generation"

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
        self._meta[gid] = {"kind": kind, "meta": meta or {}, "ts": time.time()}
        socketio.emit("gen_started", {"generation_id": gid, "kind": kind, "meta": meta or {}}, namespace="/generation")
        return gid

    def progress(self, generation_id: str, stage: str, step: int, total: int):
        pct = round((step / max(total, 1)) * 100.0, 2)
        socketio.emit("gen_progress", {"generation_id": generation_id, "stage": stage, "step": int(step), "total": int(total), "pct": pct}, namespace="/generation")

    def finish(self, generation_id: str, payload: Optional[Dict[str, Any]] = None):
        socketio.emit("gen_finished", {"generation_id": generation_id, "payload": payload or {}}, namespace="/generation")
        self._meta.pop(generation_id, None)

    def error(self, generation_id: str, message: str):
        socketio.emit("gen_error", {"generation_id": generation_id, "error": message}, namespace="/generation")
        self._meta.pop(generation_id, None)

genbus = GenerationTracker()

# --------------------------- WebSocket namespaces -----------------------------
@socketio.on("connect", namespace="/downloads")
def dl_connect():
    emit("connected", {"message": "Connected to download progress stream"})

@socketio.on("subscribe", namespace="/downloads")
def dl_subscribe(data):
    pipeline_id = (data or {}).get("pipeline_id")
    if pipeline_id and pipeline_id in download_manager.pipelines:
        emit("download_progress", {"pipeline": download_manager.pipelines[pipeline_id].to_dict()})

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

# ----------------------------- Download tracking ------------------------------
@dataclass
class DownloadTask:
    task_id: str
    kind: str                 # "repo" or "file"
    name: str                 # repo_id or "repo_id:path"
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
        if not weights:
            return 0.0
        done = sum(p * w for p, w in weights)
        denom = sum(w for _, w in weights)
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
        self.pipelines: Dict[str, PipelineDownload] = {}
        self._lock = threading.Lock()

    def emit(self, pipeline_id: str):
        pl = self.pipelines.get(pipeline_id)
        if pl:
            socketio.emit("download_progress", {"pipeline": pl.to_dict()}, namespace="/downloads")

    def new(self, name: str) -> PipelineDownload:
        pid = hashlib.md5(f"{name}_{time.time()}".encode()).hexdigest()[:16]
        pl = PipelineDownload(pipeline_id=pid, pipeline_name=name)
        with self._lock:
            self.pipelines[pid] = pl
        return pl

    def add_repo_task(self, pl: PipelineDownload, repo_id: str, total_estimate: int = 0) -> str:
        tid = hashlib.md5(f"{repo_id}_{time.time()}".encode()).hexdigest()[:16]
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

    def finalize_if_done(self, pl: PipelineDownload):
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
        "ltxv-13b-0.9.8-distilled-fp8.safetensors",
        "ltxv-spatial-upscaler-0.9.8.safetensors",
        "model_index.json",
        "media/**", "scheduler/**", "text_encoder/**", "tokenizer/**", "transformer/**", "vae/**",
    ]

def allow_patterns_for_repo(repo_id: str) -> Optional[List[str]]:
    if repo_id == "black-forest-labs/FLUX.1-dev":
        return _flux_patterns()
    if repo_id in ("stabilityai/sdxl-turbo", "stabilityai/stable-diffusion-xl-base-1.0", "stabilityai/stable-diffusion-xl-refiner-1.0"):
        return _sdxl_patterns()
    if repo_id == "TencentARC/HunyuanVideo":
        return _hunyuan_patterns()
    if repo_id == "Lightricks/LTX-Video":
        return _ltx_patterns()
    return None  # full repo otherwise

# ---------------------- Remote manifest & helpers -----------------------------
def _list_required_remote_files(repo_id: str, allow_patterns: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    api = HfApi(token=_hf_token())
    items = api.list_repo_tree(repo_id=repo_id, repo_type="model", recursive=True)

    files: List[Dict[str, Any]] = []
    for it in items:
        if getattr(it, "type", None) != "file":
            continue
        path = it.path
        if allow_patterns and not any(fnmatch(path, pat) for pat in allow_patterns):
            continue
        size = int(getattr(it, "size", 0) or 0)
        files.append({"path": path, "size": size})

    # Fill unknown sizes with HEAD or a Range probe
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    for f in files:
        if f["size"] > 0:
            continue
        try:
            url = hf_hub_url(repo_id=repo_id, filename=f["path"], repo_type="model", revision="main")
            # Try HEAD
            r = requests.head(url, allow_redirects=True, headers=headers, timeout=20)
            clen = int(r.headers.get("content-length", "0") or "0")
            if clen <= 0:
                # Probe with Range to extract the total from Content-Range
                r = requests.get(url, headers={**headers, "Range": "bytes=0-0"}, stream=True, timeout=20)
                m = re.search(r"/(\d+)$", r.headers.get("Content-Range", ""))
                clen = int(m.group(1)) if m else 0
            f["size"] = clen
        except Exception:
            pass
    return files

def _visible_repo_root(root: Path) -> Path:
    """If a snapshot layout (refs/snapshots) exists, point to the current snapshot dir; else the root."""
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

# ---------- Local completeness checks (kept lightweight & useful) -------------
def _nonzero(p: Path) -> bool:
    try:
        return p.exists() and p.stat().st_size > 0
    except Exception:
        return False

WEIGHT_GLOBS = [
    "*.safetensors", "pytorch_model.bin", "diffusion_pytorch_model.bin", "tf_model.h5", "flax_model.msgpack"
]

def _has_any_weights(path: Path) -> bool:
    if not path.exists():
        return False
    # current and first nested level
    for pat in WEIGHT_GLOBS:
        if any((x for x in path.glob(pat) if _nonzero(x))):
            return True
    for child in path.glob("*"):
        if child.is_dir():
            for pat in WEIGHT_GLOBS:
                if any((x for x in child.glob(pat) if _nonzero(x))):
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
        "must_weight_dirs": [],  # transformer via local GGUF
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
        "must_tokenizers": ["tokenizer", "tokenizer_2"],
        "must_weight_dirs": ["unet", "vae"],
        "extra_dirs": ["text_encoder", "text_encoder_2"],
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
            "ltxv-13b-0.9.8-distilled-fp8.safetensors",
            "ltxv-spatial-upscaler-0.9.8.safetensors",
        ],
        "must_tokenizers": [],
        "must_weight_dirs": ["media", "scheduler", "text_encoder", "tokenizer", "transformer", "vae"],
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
        if not dp.exists() or not any(_nonzero(x) for x in dp.rglob("*") if x.is_file()):
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
    except HfHubHTTPError:
        return None
    except Exception:
        return None

    missing = 0
    for it in items:
        if getattr(it, "type", None) != "file":
            continue
        rel = it.path
        if allow_patterns and not any(fnmatch(rel, pat) for pat in allow_patterns):
            continue
        lp = root / rel
        if not lp.exists():
            missing += 1
            continue
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
    if remote_missing is None:
        status["ok"] = bool(local["ok"])
    else:
        status["ok"] = bool(local["ok"] and remote_missing == 0)
    return status

# ---- Multi-repo readiness guard (drop-in replacement) ----

def _repos_ready_or_resp(*repo_ids: str) -> Optional[tuple]:
    """
    Validate that ALL repos in `repo_ids` are ready.
    Returns:
      None    → all good
      (json, status_code) → 403 or 409 with a combined, per-repo payload
    """
    statuses = []
    needs_auth = False
    any_local_missing = False

    for rid in repo_ids:
        st = _repo_readiness(rid)  # uses local completeness + remote size match
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
            "repos_status": statuses,
            "hint": "Set HF_TOKEN (or HUGGINGFACE_HUB_TOKEN) and accept model card terms; or check network.",
        }), 403

    if any_local_missing:
        # Bubble a combined 409 that lists EVERY repo and what’s missing
        return jsonify({
            "error": "Local repositories not ready",
            "repos_status": statuses,
            "hint": "Use /pipelines/prefetch (from the frontend CTA) and then Re-check.",
        }), 409

    # Fallback (shouldn’t be hit)
    return jsonify({"error": "Unknown readiness state", "repos_status": statuses}), 409

# ------------------------- Pipelines and optional GGUF ------------------------
FLUX_REPO         = "black-forest-labs/FLUX.1-dev"
SDXL_BASE_REPO    = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_REFINER_REPO = "stabilityai/stable-diffusion-xl-refiner-1.0"
SDXL_TURBO_REPO   = "stabilityai/sdxl-turbo"
LTX_REPO          = "Lightricks/LTX-Video"
HUNYUAN_REPO      = "TencentARC/HunyuanVideo"
STABLE_AUDIO_REPO = "stabilityai/stable-audio-open-1.0"
WAN_REPO          = "deepseek-ai/WAN"  # placeholder

# Optional GGUFs (env-overridable)
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
        plan["repos_to_fetch"] = [LTX_REPO]
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

# ----------------------- Per-file HF download (tracked) -----------------------
def _stream_hf_file_task(pl: PipelineDownload, tid: str, repo_id: str, rel_path: str, remote_size: int):
    headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
    root = repo_local_dir(repo_id)
    dest = root / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        # seed from disk if partially present
        local = dest.stat().st_size if dest.exists() else 0
        total = int(remote_size or 0)
        if total > 0 and local == total:
            download_manager.update_progress(pl, tid, done=total, total=total)
            download_manager.mark_completed(pl, tid)
            return

        url = hf_hub_url(repo_id=repo_id, filename=rel_path, repo_type="model", revision="main")

        # if server gave us size, try to resume
        mode = "ab" if (total > 0 and local > 0 and local < total) else "wb"
        req_headers = dict(headers)
        if mode == "ab":
            req_headers["Range"] = f"bytes={local}-"

        download_manager.mark_downloading(pl, tid)
        if total > 0:
            download_manager.update_progress(pl, tid, done=local, total=total)

        with requests.get(url, stream=True, headers=req_headers, timeout=60) as r:
            r.raise_for_status()
            with open(dest, mode) as f:
                done = local
                for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    download_manager.update_progress(pl, tid, done=done, total=total if total > 0 else None)

        # final size check (best effort)
        final = dest.stat().st_size if dest.exists() else 0
        if total > 0 and final != total:
            raise RuntimeError(f"Size mismatch for {rel_path}: expected {total}, got {final}")

        download_manager.mark_completed(pl, tid)

    except Exception as e:
        download_manager.mark_failed(pl, tid, str(e))

def _prefetch_repo_task(pl: PipelineDownload, repo_id: str, allow_patterns: Optional[List[str]]):
    # Build manifest
    try:
        manifest = _list_required_remote_files(repo_id, allow_patterns=allow_patterns)
    except Exception as e:
        # Can't list → single failed repo task
        rid = download_manager.add_repo_task(pl, repo_id, total_estimate=0)
        download_manager.mark_failed(pl, rid, f"Failed to list repo: {e}")
        download_manager.finalize_if_done(pl)
        return

    # sanity cap
    total_repo_bytes = sum(int(f.get("size") or 0) for f in manifest)
    if MAX_REPO_BYTES and total_repo_bytes > MAX_REPO_BYTES:
        rid = download_manager.add_repo_task(pl, repo_id, total_estimate=total_repo_bytes)
        download_manager.mark_failed(pl, rid, f"Aborted: {repo_id} exceeds MAX_REPO_BYTES={MAX_REPO_BYTES}")
        download_manager.finalize_if_done(pl)
        return

    # Create a task per file and download sequentially (avoids thread explosion; UI still sees per-file progress)
    root = repo_local_dir(repo_id)
    root.mkdir(parents=True, exist_ok=True)

    for f in manifest:
        rel = f["path"]; size = int(f.get("size") or 0)
        tid = download_manager.add_file_task(pl, filename=f"{repo_id}:{rel}", size=size)

        # Seed progress if file already partially present
        lp = root / rel
        if lp.exists() and size > 0:
            try:
                local = lp.stat().st_size
                if local > 0:
                    download_manager.update_progress(pl, tid, done=min(local, size), total=size)
            except Exception:
                pass

        _stream_hf_file_task(pl, tid, repo_id, rel, size)

    # When all files are handled:
    download_manager.finalize_if_done(pl)

# --------------------------- APIs: plan & prefetch ----------------------------
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
        plan = _plan_for(pipeline)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    pl = download_manager.new(f"prefetch:{pipeline}")

    # Repo(s): schedule one worker per repo that streams files one by one
    for rid in plan.get("repos_to_fetch", []):
        st = _repo_readiness(rid)
        if st.get("missing") is None and not st.get("ok", False):
            continue  # cannot fetch (auth/terms/offline) → surfaced by /plan
        if st.get("ok", False):
            continue  # nothing to do

        pats = allow_patterns_for_repo(rid)
        th = threading.Thread(target=_prefetch_repo_task, args=(pl, rid, pats), daemon=True)
        th.start()

    # Single-file (GGUF) via plain streaming
    for f in plan.get("single_files", []):
        name, url = f.get("name"), f.get("url")
        if not name:
            continue
        dest = MODEL_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        if not url:
            continue
        tid = download_manager.add_file_task(pl, filename=name, size=0)

        def _gguf_worker(tid_=tid, url_=url, dest_=dest):
            try:
                headers = {"Authorization": f"Bearer {_hf_token()}"} if _hf_token() else {}
                head = requests.head(url_, allow_redirects=True, headers=headers, timeout=30)
                total = int(head.headers.get("content-length", "0") or "0")
                if total > 0:
                    download_manager.update_progress(pl, tid_, done=0, total=total)
                download_manager.mark_downloading(pl, tid_)
                with requests.get(url_, stream=True, headers=headers, timeout=60) as r:
                    r.raise_for_status()
                    done = 0
                    dest_.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest_, "wb") as out:
                        for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                            if not chunk:
                                continue
                            out.write(chunk)
                            done += len(chunk)
                            download_manager.update_progress(pl, tid_, done=done, total=total if total > 0 else None)
                download_manager.mark_completed(pl, tid_)
            except Exception as e:
                download_manager.mark_failed(pl, tid_, str(e))
            finally:
                download_manager.finalize_if_done(pl)

        threading.Thread(target=_gguf_worker, daemon=True).start()

    if not pl.tasks:
        download_manager.set_status(pl, "completed")
        return jsonify({
            "message": "Everything already present",
            "pipelines_started": [],
            "download_websocket_url": ws_downloads_url(),
            "details": {"plan": plan, "download_pipelines": [], "notes": []},
        }), 200

    download_manager.set_status(pl, "downloading")
    return jsonify({
        "message": "Prefetch started",
        "pipelines_started": [pl.pipeline_id],
        "download_websocket_url": ws_downloads_url(),
        "details": {"plan": plan, "download_pipelines": [{"kind": "mixed", "pipeline_id": pl.pipeline_id}], "notes": []},
    }), 202

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

# ------------------------------ Generation endpoints --------------------------

@app.route("/image/quality", methods=["POST"])
def image_quality_flux():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    h = int(data.get("height", 512)); w = int(data.get("width", 768))
    cb_steps = int(data.get("callback_steps", 1))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _ensure_flux_ready()
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

        def cb(step, timestep, latents):
            genbus.progress(gen_id, "sampling", int(step), 4)

        image = pipe(
            prompt=prompt,
            guidance_scale=0.0,
            height=h,
            width=w,
            num_inference_steps=4,
            callback=cb,
            callback_steps=cb_steps,
        ).images[0]
        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": ws_generation_url()}), 201
    except Exception as e:
        logger.exception("FLUX generation failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

@app.route("/image/intermediate", methods=["POST"])
def image_intermediate_sdxl():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = data.get("negative_prompt", "bad anatomy, extra hands, worst quality")
    h = int(data.get("height", 1024)); w = int(data.get("width", 1024))
    steps_base = int(data.get("steps_base", 30)); steps_ref = int(data.get("steps_refiner", 20))
    denoise_split = float(data.get("denoising_split", 0.9))
    cb_steps = int(data.get("callback_steps", 5))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(SDXL_BASE_REPO, SDXL_REFINER_REPO)
    if guard: return guard

    gen_id = genbus.new("sdxl_intermediate", {"endpoint": "/image/intermediate", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        dtype = DeviceManager.get_dtype(device)

        base = DiffusionPipeline.from_pretrained(
            str(repo_local_dir(SDXL_BASE_REPO)),
            torch_dtype=dtype, use_safetensors=True, variant="fp16", local_files_only=True
        ).to(device)

        def cb1(step, timestep, latents):
            genbus.progress(gen_id, "base_sampling", int(step), steps_base)

        latents = base(
            prompt=prompt, negative_prompt=negative_prompt,
            width=w, height=h,
            num_inference_steps=steps_base,
            denoising_end=denoise_split,
            output_type="latent",
            callback=cb1, callback_steps=cb_steps,
        ).images

        refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            str(repo_local_dir(SDXL_REFINER_REPO)),
            text_encoder_2=base.text_encoder_2, vae=base.vae,
            torch_dtype=dtype, use_safetensors=True, variant="fp16", local_files_only=True
        ).to(device)

        def cb2(step, timestep, latents_):
            genbus.progress(gen_id, "refine_sampling", int(step), steps_ref)

        image = refiner(
            image=latents,
            prompt=prompt, negative_prompt=negative_prompt,
            num_inference_steps=steps_ref,
            denoising_start=denoise_split,
            output_type="pil",
            callback=cb2, callback_steps=cb_steps,
        ).images[0]

        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": ws_generation_url()}), 201
    except Exception as e:
        logger.exception("SDXL intermediate failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

@app.route("/image/turbo", methods=["POST"])
def image_turbo_sdxl():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    steps = int(data.get("steps", 3))
    cb_steps = int(data.get("callback_steps", 1))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(SDXL_TURBO_REPO)
    if guard: return guard

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
            callback=cb, callback_steps=cb_steps
        ).images[0]

        buf = BytesIO(); image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        genbus.finish(gen_id, {"ok": True})
        return jsonify({"prompt": prompt, "image": b64, "generation_id": gen_id, "generation_websocket_url": ws_generation_url()}), 201
    except Exception as e:
        logger.exception("SDXL turbo failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

@app.route("/image/video", methods=["POST"])
def ltx_image_to_video():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    negative_prompt = data.get("negative_prompt", "worst quality")
    H = int(data.get("height", 480)); W = int(data.get("width", 832))
    fps = int(data.get("fps", 24)); frames = int(data.get("frames", 96))
    steps_gen = int(data.get("steps_gen", 30)); steps_ref = int(data.get("steps_refine", 10))
    denoise_strength = float(data.get("denoise_strength", 0.4))
    decode_timestep = float(data.get("decode_timestep", 0.05))
    image_url = data.get("image_url"); image_b64 = data.get("image_base64")
    cb_steps = int(data.get("callback_steps", 1))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(LTX_REPO)
    if guard: return guard

    gen_id = genbus.new("ltx_i2v", {"endpoint": "/image/video", "prompt": prompt})
    try:
        device = DeviceManager.get_device()
        dtype = torch.bfloat16 if device.type != "mps" else torch.float16
        root = repo_local_dir(LTX_REPO)

        pipe = LTXConditionPipeline.from_pretrained(
            str(root), torch_dtype=dtype, local_files_only=True, use_safetensors=True
        ).to(device)
        pipe_upsample = LTXLatentUpsamplePipeline.from_pretrained(
            str(root), vae=pipe.vae, torch_dtype=dtype, local_files_only=True, use_safetensors=True
        ).to(device)

        conditions = None
        if image_url or image_b64:
            im = load_image(image_url) if image_url else Image.open(BytesIO(base64.b64decode(image_b64)))
            tmp = f"_ltx_{int(time.time())}.mp4"; export_to_video([im], tmp, fps=1)
            vid = load_video(tmp); conditions = LTXVideoCondition(video=vid, frame_index=0)

        def cb1(step, timestep, latents):
            genbus.progress(gen_id, "stage1_sampling", int(step), steps_gen)

        out_latents = pipe(
            conditions=conditions if conditions else None,
            prompt=prompt, negative_prompt=negative_prompt,
            width=W, height=H, num_frames=frames,
            num_inference_steps=steps_gen, decode_timestep=decode_timestep,
            output_type="latent", callback=cb1, callback_steps=cb_steps,
        ).frames

        genbus.progress(gen_id, "upsample", 0, 1)
        up_latents = pipe_upsample(latents=out_latents, output_type="latent").frames

        def cb2(step, timestep, latents):
            genbus.progress(gen_id, "stage3_refine", int(step), steps_ref)

        frames_out = pipe(
            conditions=conditions if conditions else None,
            prompt=prompt, negative_prompt=negative_prompt,
            width=W, height=H, num_frames=frames,
            denoise_strength=denoise_strength,
            num_inference_steps=steps_ref, latents=up_latents,
            decode_timestep=decode_timestep, output_type="pil",
            callback=cb2, callback_steps=cb_steps,
        ).frames[0]

        out_path = f"ltx_{int(time.time())}.mp4"
        export_to_video(frames_out, out_path, fps=fps)
        genbus.finish(gen_id, {"ok": True, "video": out_path})
        return jsonify({"prompt": prompt, "video_path": out_path, "generation_id": gen_id, "generation_websocket_url": ws_generation_url()}), 201
    except Exception as e:
        logger.exception("LTX video failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

@app.route("/video/max", methods=["POST"])
def hunyuan_video():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    H = int(data.get("height", 720)); W = int(data.get("width", 1280))
    frames = int(data.get("frames", 129)); steps = int(data.get("steps", 30))
    fps = int(data.get("fps", 24)); cb_steps = int(data.get("callback_steps", 1))
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(HUNYUAN_REPO)
    if guard: return guard

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
            output_type="pil", callback=cb, callback_steps=cb_steps
        ).frames[0]

        out_path = f"hunyuan_{int(time.time())}.mp4"
        export_to_video(frames_list, out_path, fps=fps)
        genbus.finish(gen_id, {"ok": True, "video": out_path})
        return jsonify({"prompt": prompt, "video_path": out_path, "generation_id": gen_id, "generation_websocket_url": ws_generation_url()}), 201
    except Exception as e:
        logger.exception("Hunyuan video failed")
        genbus.error(gen_id, str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        DeviceManager.free_memory()

@app.route("/music", methods=["POST"])
def music_stable_audio():
    data = request.json or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    guard = _repos_ready_or_resp(STABLE_AUDIO_REPO)
    if guard: return guard

    gen_id = genbus.new("music", {"endpoint": "/music", "prompt": prompt})
    try:
        genbus.finish(gen_id, {"ok": True})
        return jsonify({
            "message": "Music pipeline stub. Add Stable Audio code here.",
            "generation_id": gen_id,
            "generation_websocket_url": ws_generation_url()
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

if __name__ == "__main__":
    logger.info("Starting BonzAI Media Generation Server (local-first + per-file progress)")
    logger.info(f"Device: {DeviceManager.get_device()}")
    logger.info(f"Model directory: {MODEL_DIR}")
    socketio.run(app, host="0.0.0.0", port=65000, debug=False, allow_unsafe_werkzeug=True, use_reloader=False)
