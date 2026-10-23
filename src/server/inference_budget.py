"""Conservative host-memory admission and cooperative music pressure checks.

CPU offloading does not create extra RAM on unified-memory devices. Estimates
are admission margins, not a guarantee of the model's peak allocation.
"""
from pathlib import Path
from functools import lru_cache, wraps
from types import SimpleNamespace
import logging
import sys
import psutil

GIB = 1024 ** 3
logger = logging.getLogger(__name__)


def reserve_bytes(total):
    return max(3 * GIB, min(8 * GIB, total * .12))


@lru_cache(maxsize=1)
def _macos_sysctl():
    import ctypes
    function = ctypes.CDLL(None, use_errno=True).sysctlbyname
    function.argtypes = [ctypes.c_char_p, ctypes.c_void_p,
                         ctypes.POINTER(ctypes.c_size_t), ctypes.c_void_p, ctypes.c_size_t]
    function.restype = ctypes.c_int
    return function


def macos_memory_pressure():
    """Read the OS pressure signal, without allocating or invoking a shell."""
    if sys.platform != 'darwin':
        return None
    import ctypes
    try:
        level = ctypes.c_int()
        size = ctypes.c_size_t(ctypes.sizeof(level))
        if _macos_sysctl()(b'kern.memorystatus_vm_pressure_level',
                           ctypes.byref(level), ctypes.byref(size), None, 0) == 0:
            return level.value if level.value in (1, 2, 4) else None
    except (AttributeError, OSError):
        pass
    return None


def check_memory_pressure(device=None):
    # Warn can briefly fire while clean mmap pages move through the file cache.
    # Critical pressure always stops the request; warning alone does not replace
    # the host-reserve check below.
    if getattr(device, 'type', None) == 'mps':
        pressure = macos_memory_pressure()
        if pressure == 4:
            raise MemoryError("System memory pressure is too high for music generation")
    memory = psutil.virtual_memory()
    if memory.available < reserve_bytes(memory.total):
        raise MemoryError("Insufficient free memory for music generation")


def check_music_budget(directory, duration, weight_multiplier=1, *, stream_weights=False, device=None):
    memory = psutil.virtual_memory()
    # Load one weight representation, excluding optional alternate variants.
    weights = sum(p.stat().st_size for p in Path(directory).rglob('*.safetensors')
                  if '.fp32.' not in p.name and '.fp16.' not in p.name)
    # The streamed Metal path bounds attention queries and waveform decode
    # tiles. Keep a duration-dependent margin for the full latent sequence,
    # but do not charge the whole-song decoder scratch used by resident mode.
    workspace = (2 + duration / (120 if stream_weights else 60)) * GIB
    reserve = reserve_bytes(memory.total)
    required = weights * weight_multiplier + workspace + reserve
    # The streamed path keeps the BF16 safetensors CPU storage file-backed and
    # onloads one denoiser layer at a time. It must fit physical capacity, but
    # does not require a second full checkpoint's worth of currently free RAM.
    # Reserve 2 GiB for the small encoders / layer transfers in addition to the
    # duration-dependent activations. CPU/CUDA retain resident admission.
    available_required = workspace + 2 * GIB + reserve if stream_weights else required
    logger.info('Music admission: placement=%s, available=%.2f GiB, needed=%.2f GiB, total=%.2f GiB, capacity_needed=%.2f GiB',
                'streamed' if stream_weights else 'resident', memory.available / GIB,
                available_required / GIB, memory.total / GIB, required / GIB)
    if memory.total < required or memory.available < available_required:
        raise MemoryError("Insufficient free memory for the requested music duration")
    check_memory_pressure(device)


def configure_music_device_budget(torch, device):
    """Bound Metal allocations BEFORE loading mmap weights into CPU storage."""
    if device.type != 'mps':
        return
    memory = psutil.virtual_memory()
    remaining = memory.available - reserve_bytes(memory.total)
    if remaining <= 0:
        raise MemoryError("Insufficient free memory for music generation")
    recommended = torch.mps.recommended_max_memory()
    if recommended > 0:
        budget = remaining + torch.mps.driver_allocated_memory()
        torch.mps.set_per_process_memory_fraction(min(1., budget / recommended))


def watch_pipeline_memory(pipe, device=None):
    """Check at model boundaries, including each denoising step and decoding."""
    handles = []
    def before_forward(_module, _inputs):
        check_memory_pressure(device)
    try:
        for component in pipe.components.values():
            if callable(getattr(component, 'register_forward_pre_hook', None)):
                handles.append(component.register_forward_pre_hook(before_forward))
            # Diffusers calls VAE.decode directly, bypassing Module.forward hooks.
            if callable(getattr(component, 'decode', None)):
                original = component.decode
                def guarded_decode(*args, _decode=original, **kwargs):
                    check_memory_pressure(device)
                    return _decode(*args, **kwargs)
                component.decode = wraps(original)(guarded_decode)
                handles.append(SimpleNamespace(remove=lambda module=component, decode=original: setattr(module, 'decode', decode)))
        # A denoising step / tiled decode may be long; also check between blocks
        # and audio tiles so another app's allocations can stop this request.
        for block in getattr(getattr(pipe, 'transformer', None), 'layers', ()):
            handles.append(block.register_forward_pre_hook(before_forward))
        decoder = getattr(getattr(pipe, 'vae', None), 'decoder', None)
        if callable(getattr(decoder, 'register_forward_pre_hook', None)):
            handles.append(decoder.register_forward_pre_hook(before_forward))
        check_memory_pressure(device)
        return handles
    except Exception:
        for handle in handles:
            handle.remove()
        raise
