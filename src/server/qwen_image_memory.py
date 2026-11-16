"""Bound Qwen3-VL encoder residency for reference-image conditioning."""
import torch
from inference_memory import configure_pipeline


def configure_qwen_pipeline(pipe, device, checkpoint):
    configure_pipeline(pipe, device, checkpoint, sequential_components=('text_encoder',))
    if device.type == 'mps' and hasattr(pipe.text_encoder, '_hf_hook'):
        def finish_block(_module, _inputs, _output):
            # Offloaded tensors may remain referenced by asynchronous Metal
            # commands. Retire those commands before loading another block.
            torch.mps.synchronize()
            torch.mps.empty_cache()
        for block in pipe.text_encoder.modules():
            if type(block).__name__ in ('Qwen3VLTextDecoderLayer', 'Qwen3VLVisionBlock'):
                block.register_forward_hook(finish_block)
