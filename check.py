from pathlib import Path
import json

# Check your local model's configs
base = Path("/Users/wilhempujar/bonzai-models/repos/Wan-AI__Wan2.2-TI2V-5B-Diffusers")  # Update this path

# Print scheduler config
sched = base / "scheduler" / "scheduler_config.json"
if sched.exists():
    print("=== SCHEDULER CONFIG ===")
    print(json.dumps(json.load(open(sched)), indent=2))

# Print VAE config  
vae_cfg = base / "vae" / "config.json"
if vae_cfg.exists():
    print("\n=== VAE CONFIG ===")
    cfg = json.load(open(vae_cfg))
    print(f"latent_channels/z_dim: {cfg.get('latent_channels', cfg.get('z_dim', 'NOT FOUND'))}")
    print(f"latents_mean: {cfg.get('latents_mean', 'NOT FOUND')}")
    print(f"latents_std: {cfg.get('latents_std', 'NOT FOUND')}")
    print(f"scaling_factor: {cfg.get('scaling_factor', 'NOT FOUND')}")

# Print transformer config
tr_cfg = base / "transformer" / "config.json"
if tr_cfg.exists():
    print("\n=== TRANSFORMER CONFIG ===")
    cfg = json.load(open(tr_cfg))
    print(f"in_channels: {cfg.get('in_channels', 'NOT FOUND')}")
    print(f"patch_size: {cfg.get('patch_size', 'NOT FOUND')}")

# Check if image_encoder exists
img_enc = base / "image_encoder"
print(f"\n=== IMAGE ENCODER EXISTS: {img_enc.exists()} ===")
