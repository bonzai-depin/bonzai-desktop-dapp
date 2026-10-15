"""Isolated SeedVR2 worker, also used by the packaged server executable."""
import os
from pathlib import Path
import sys


def main():
    runtime = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(runtime))
    os.environ["HF_HUB_OFFLINE"] = "1"
    import inference_cli as cli
    import torch

    # There are no implicit network actions in the worker. The parent verifies
    # every pinned file before launch and exposes downloads in BonzAI.
    def local_weights_only(dit_model, vae_model, model_dir, **_kwargs):
        for name in (dit_model, vae_model):
            if not (Path(model_dir) / name).is_file():
                raise FileNotFoundError(f"SeedVR2 model missing: {name}")
        return True

    cli.download_weight = local_weights_only
    import src.utils.downloads as downloads
    downloads.download_weight = local_weights_only

    requested = os.environ.get("BONZAI_SEEDVR2_DEVICE", "cpu")
    if requested == "cpu":
        cli.get_gpu_backend = lambda: "cpu"
        # A portable CPU path must not assume bfloat16 hardware instructions.
        import src.core.generation_utils as generation
        generation.COMPUTE_DTYPE = torch.float32

    save = cli.save_frames_to_video

    def save_checked(frames_tensor, *args, **kwargs):
        # Validate/clamp bounded frames instead of allocating two full-video
        # temporaries. These output frames are owned by the worker's export.
        for frame in frames_tensor:
            if not torch.isfinite(frame).all().item():
                raise RuntimeError("SeedVR2 returned non-finite frames; no video was saved.")
            frame.clamp_(0, 1)
        return save(frames_tensor, *args, **kwargs)

    cli.save_frames_to_video = save_checked
    sys.argv = [str(runtime / "inference_cli.py"), *sys.argv[2:]]
    cli.main()


if __name__ == "__main__":
    main()
