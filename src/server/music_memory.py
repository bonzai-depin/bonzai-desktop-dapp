"""Placement for request-owned ACE-Step text-to-music pipelines."""


def configure_streamed_music(pipe, device):
    """Keep clean CPU weights mapped; move only denoiser leaves onto Metal.

    Do not offload the entire pipeline to meta: ACE-Step reads the condition
    encoder's silence buffer directly before calling its forward method.
    Small components instead move as a whole and are freed at their last use.
    """
    from accelerate import cpu_offload, cpu_offload_with_hook
    from inference_memory import release_on_first_forward, release_before_decode

    if device.type == 'mps':
        from diffusers.models.transformers.ace_step_transformer import AceStepAttention
        for module in pipe.transformer.modules():
            if isinstance(module, AceStepAttention):
                module.set_processor(BoundedMusicAttention())
    cpu_offload(pipe.transformer, execution_device=device)
    if device.type == 'mps':
        # Metal is asynchronous. Dropping a layer's tensors does not release
        # transfers still referenced by queued GPU commands. Bound that queue
        # to one transformer block before loading the next block's weights.
        import torch
        def finish_block(_module, _inputs, _output):
            torch.mps.synchronize()
            torch.mps.empty_cache()
        for block in pipe.transformer.layers:
            block.register_forward_hook(finish_block)
    for name in ('text_encoder', 'condition_encoder', 'vae'):
        # No chained hooks: those retain finished components and can try to
        # move the meta-backed transformer wholesale at the next stage.
        cpu_offload_with_hook(getattr(pipe, name), execution_device=device)
    release_on_first_forward(pipe, ('text_encoder', 'condition_encoder'), device)
    release_before_decode(pipe, ('transformer',), device)


def configure_music_decode(pipe):
    """Bound waveform-decoder activations without shortening the song."""
    # AutoencoderOobleck supports overlapping time tiles, but its default is
    # disabled. Whole-song decoding scales its convolution scratch with length.
    pipe.vae.use_tiling = True
    pipe.vae.tile_latent_min_length = 256
    pipe.vae.tile_latent_overlap = 64

class BoundedMusicAttention:
    """Exact non-causal ACE-Step attention in query tiles for Metal.

    Every tile attends to all keys with the original mask. This bounds the
    fallback attention score scratch without shortening audio or its context.
    """
    def __init__(self, chunk_size=256):
        self.chunk_size = chunk_size

    def __call__(self, attn, hidden_states, encoder_hidden_states=None,
                 attention_mask=None, image_rotary_emb=None):
        import torch
        from diffusers.models.embeddings import apply_rotary_emb
        cross = attn.is_cross_attention and encoder_hidden_states is not None
        source = encoder_hidden_states if cross else hidden_states
        query = attn.norm_q(attn.to_q(hidden_states).unflatten(-1, (attn.heads, attn.head_dim)))
        key = attn.norm_k(attn.to_k(source).unflatten(-1, (attn.kv_heads, attn.head_dim)))
        value = attn.to_v(source).unflatten(-1, (attn.kv_heads, attn.head_dim))
        if not cross and image_rotary_emb is not None:
            query = apply_rotary_emb(query, image_rotary_emb, use_real=True, use_real_unbind_dim=-2, sequence_dim=1)
            key = apply_rotary_emb(key, image_rotary_emb, use_real=True, use_real_unbind_dim=-2, sequence_dim=1)
        query, key, value = (tensor.transpose(1, 2) for tensor in (query, key, value))
        output = torch.empty_like(query)
        for start in range(0, query.shape[2], self.chunk_size):
            end = start + self.chunk_size
            mask = attention_mask
            if mask is not None and mask.ndim >= 3 and mask.shape[-2] != 1:
                mask = mask[..., start:end, :]
            output[:, :, start:end] = torch.nn.functional.scaled_dot_product_attention(
                query[:, :, start:end], key, value, attn_mask=mask,
                dropout_p=0.0, scale=attn.scaling, enable_gqa=attn.heads != attn.kv_heads)
            if query.device.type == 'mps':
                torch.mps.synchronize()
                torch.mps.empty_cache()
        output = output.transpose(1, 2).flatten(2, 3)
        return attn.to_out[1](attn.to_out[0](output))
