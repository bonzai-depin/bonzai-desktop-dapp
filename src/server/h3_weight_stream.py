"""Bounded, reusable CPU staging for H3's MPS weight transfers.

Returned tensors borrow the calling thread's buffer until its next read. The
consumer must finish its synchronous accelerator transfer before reading again.
No model files are modified and no system-wide cache settings are changed.
"""
import math
import sys
import threading
import weakref

import torch


class _Workspace:
    def __init__(self, handle):
        self.file = handle
        self.buffer = bytearray()
        # Keep the handle alive until cleanup even when module/hook cycles
        # are collected together at the end of an inference phase.
        weakref.finalize(self, handle.close)


class WeightFile:
    def __init__(self, path):
        self.path = str(path)
        self._local = threading.local()

    def _workspace(self, size):
        if not hasattr(self._local, 'workspace'):
            handle = open(self.path, 'rb', buffering=0)
            if sys.platform == 'darwin':
                import fcntl
                # Darwin F_NOCACHE: avoid filling the unified-memory file cache
                # with a checkpoint larger than the available physical RAM.
                try:
                    fcntl.fcntl(handle.fileno(), 48, 1)
                except Exception:
                    handle.close()
                    raise
            self._local.workspace = _Workspace(handle)
        workspace = self._local.workspace
        if len(workspace.buffer) < size:
            workspace.buffer = bytearray(size)
        return workspace.file, memoryview(workspace.buffer)[:size]

    def rows(self, offset, shape, dtype, rows):
        indices = list(rows)
        row_elements = math.prod(shape[1:])
        row_bytes = row_elements * torch.empty((), dtype=dtype).element_size()
        handle, buffer = self._workspace(len(indices) * row_bytes)
        if not indices:
            return torch.empty((0, *shape[1:]), dtype=dtype)
        if min(indices) < 0 or max(indices) >= shape[0]:
            raise IndexError('H3 weight row is outside the checkpoint tensor')
        cursor = 0
        while cursor < len(indices):
            end = cursor + 1
            while end < len(indices) and indices[end] == indices[end-1] + 1:
                end += 1
            handle.seek(offset + indices[cursor] * row_bytes)
            target = buffer[cursor * row_bytes:end * row_bytes]
            received = 0
            while received < len(target):
                count = handle.readinto(target[received:])
                if not count:
                    raise EOFError('H3 checkpoint ended while reading model weights')
                received += count
            cursor = end
        return torch.frombuffer(buffer, dtype=dtype).reshape(len(indices), *shape[1:])


class WeightRows:
    def __init__(self, file, offset, shape, dtype, row_offset=0):
        self.file, self.offset, self.shape, self.dtype = file, offset, tuple(shape), dtype
        self.row_offset = row_offset

    def read(self, rows):
        return self.file.rows(self.offset, self.shape, self.dtype,
                              (int(row) + self.row_offset for row in rows))
