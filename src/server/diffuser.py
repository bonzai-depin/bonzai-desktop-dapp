#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify
from flask_cors import CORS

import torch
import gc
import os, platform
import subprocess
import base64
import random
from io import BytesIO
import numpy as np
import re
import math

from kokoro import KPipeline
from IPython.display import display, Audio

from diffusers import GGUFQuantizationConfig, DiffusionPipeline, StableDiffusionXLImg2ImgPipeline
from diffusers import FluxPipeline, FluxTransformer2DModel, AutoPipelineForText2Image
from diffusers import AutoencoderKLLTXVideo, LTXPipeline, LTXImageToVideoPipeline, LTXVideoTransformer3DModel
from diffusers import HunyuanVideoTransformer3DModel, HunyuanVideoPipeline, AutoencoderKLHunyuanVideo
from diffusers import AutoencoderKLWan, WanPipeline, WanTransformer3DModel, UniPCMultistepScheduler
from diffusers.utils import export_to_video, load_image
from transformers import T5EncoderModel, T5Tokenizer, CLIPVisionModel

import torchaudio
from einops import rearrange
import soundfile as sf

# from PIL import Image
import requests
from PIL import Image

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

from appdirs import user_data_dir

import gc
import random

# Configure user-data and models path
USER_DATA_PATH = user_data_dir("bonzai", "BonzAI")
MODEL_DIR = os.path.join(USER_DATA_PATH, "models")

def get_model_path(modelname):
    """
    Returns the absolute path for the given model name in the models directory.
    """
    print("Model:", os.path.join(MODEL_DIR, modelname))
    return os.path.join(MODEL_DIR, modelname)

def download_model(url, filename):
    """
    Downloads a file from `url` and saves it under the `models` directory with `filename`.
    Returns True on success, False on error.
    """
    model_path = get_model_path(filename)
    print("Downloading to:", model_path)
    
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(model_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print("Download failed:", e)
        return False

def delete_model(modelname):
    """
    Deletes a file named `modelname` in the `models` directory.
    Returns True on success, False on error.
    """
    model_path = get_model_path(modelname)
    print("Deleting model:", model_path)
    
    try:
        os.remove(model_path)
        print("Model was deleted.")
    except OSError as e:
        print("Error deleting model:", e)
        return False
    
    return True

def check_model(modelname):
    """
    Checks if a file named `modelname` exists in the `models` directory.
    Returns True if it exists, False otherwise.
    """
    model_path = get_model_path(modelname)
    if not os.path.exists(model_path):
        print("Model file not found:", model_path)
        return False
    return True

app = Flask(__name__)
CORS(app)

def get_device():
    gc.collect()
    if torch.backends.mps.is_available():
        return torch.device('mps')
    elif torch.cuda.is_available():
        return torch.device('cuda')
    else:
        return torch.device('cpu')
    
def free_memory():
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()
        
def add_image_watermark(image_path, logo_path, output_path):
    base = Image.open(image_path).convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")

    # Scale logo to 10% of image width
    scale = base.width // 10
    logo = logo.resize((scale, int(logo.height * scale / logo.width)), Image.LANCZOS)

    # Position in bottom-right
    position = (base.width - logo.width - 10, base.height - logo.height - 10)

    # Composite and save
    base.paste(logo, position, logo)
    base.save(output_path)
    
def add_video_watermark(video_path, logo_path, output_path):
    subprocess.run([
        os.environ["IMAGEIO_FFMPEG_EXE"], "-y",
        "-i", video_path,
        "-i", logo_path,
        "-filter_complex",
        "[1][0]scale2ref=w=iw/10:h=ow/mdar[logo][vid];[vid][logo]overlay=W-w-10:H-h-10",
        "-c:a", "copy",
        output_path
    ], check=True)

@app.route("/")
def hello():
    return "Hello Transformer World!"

@app.route('/download', methods=['POST'])
def download_model():
    payload = request.json
    repository=payload['repository']
    pipe = FluxPipeline.from_pretrained(repository, torch_dtype=torch.bfloat16)
    pipe.save_pretrained(".")
    
    return 200

@app.route('/image/quality', methods=['POST'])
def get_image():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    print(prompt)
    
    ckpt_path = (
    "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_1.gguf"
    )
    
    transformer = FluxTransformer2DModel.from_single_file(
        ckpt_path,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
        torch_dtype=torch.bfloat16,
    )

    pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", transformer=transformer, torch_dtype=torch.bfloat16)
    pipe.to(get_device())
    # pipe.enable_model_cpu_offload() #save some VRAM by offloading the model to CPU. Remove this if you have enough GPU power

    image = pipe(
        prompt=prompt,
        guidance_scale=0.,
        height=height, #512
        width=width, #768
        num_inference_steps=4,
        max_sequence_length=256,
    ).images[0]
    image.save("image_max_quality.png")
    
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    base64image = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    return {'prompt': prompt, 'image': base64image}, 201

@app.route('/image/intermediate', methods=['POST'])
def get_image_quality():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    
    base = DiffusionPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", 
        torch_dtype=torch.float16, 
        use_safetensors=True,
        variant="fp16"
    )
    base.to(get_device())

    refiner = StableDiffusionXLImg2ImgPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-refiner-1.0",
        text_encoder_2=base.text_encoder_2,
        vae=base.vae,
        torch_dtype=torch.float16,
        use_safetensors=True,
        variant="fp16",
    )
    refiner.to(get_device())
        
    image = base(
        prompt=prompt,
        num_inference_steps=50,
        denoising_end=0.8,
        output_type="latent",
        width=width,
        height=height
    ).images
        
    image = refiner(
        prompt=prompt,
        num_inference_steps=50,
        denoising_start=0.8,
        image=image,
    ).images[0]
    
    image.save("image_quality.png")
    
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    base64image = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    return {'prompt': prompt, 'image': base64image}, 201

@app.route('/image/turbo', methods=['POST'])
def get_image_turbo():
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16")
    pipe.to(get_device())

    payload = request.json
    prompt=payload['prompt']

    image = pipe(prompt=prompt, num_inference_steps=3, guidance_scale=1).images[0]
    image.save("image_turbo.png")
    
    add_image_watermark("image_turbo.png", "bonzai.png", "image_turbo_watermarked.png")

    buffered = BytesIO()
    image.save(buffered, format="PNG")
    base64image = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    return {'prompt': prompt, 'image': base64image}, 201


# @app.route('/video/quality', methods=['POST'])
# def get_video():
#     free_memory()
#     seed = random.randint(-2147483647, 2147483647)
#     generator = torch.Generator()
#     generator.manual_seed(seed)
#     payload = request.json
#     prompt=payload['prompt']
#     height=payload['height']
#     width=payload['width']
#     frames=payload['frames']
#     steps=payload['steps']
#     fps=payload['fps']
#     single_file = get_model_path("hunyuan-video-t2v-720p-Q3_K_S.gguf")
#     # single_file = get_model_path("fast-hunyuan-video-t2v-720p-Q3_K_S.gguf")
#     # model_id = "FastVideo/FastHunyuan-diffusers"
#     model_id = "hunyuanvideo-community/HunyuanVideo"
#     transformer = HunyuanVideoTransformer3DModel.from_single_file(
#         single_file,
#         quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
#         torch_dtype=torch.bfloat16,
#     )
        
#     pipe = HunyuanVideoPipeline.from_pretrained(
#         model_id, 
#         transformer=transformer,
#         torch_dtype=torch.bfloat16
#     )
        
#     pipe.vae.enable_tiling()
#     # pipe.enable_model_cpu_offload()
    
#     pipe.to(get_device())

#     output = pipe(
#         prompt=prompt,
#         guidance_scale=10,
#         width=width, #512 768
#         height=height, #320 512
#         num_frames=frames, #72
#         num_inference_steps=steps, #30 #50
#         generator=generator
#     ).frames[0]

#     export_to_video(output, "video_quality.mp4", fps=fps)
    
#     return {'prompt': prompt}, 201

@app.route('/video/turbo', methods=['POST'])
def get_video_turbo():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    frames=payload['frames']
    steps=payload['steps']
    fps=payload['fps']
    single_file = get_model_path("ltxv-13b-0.9.7-dev-fp8.safetensors")
    # single_file_url = "https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.1.safetensors"
    single_file_url = "https://huggingface.co/Lightricks/LTX-Video/ltx-video-2b-v0.9.safetensors"
    # transformer = LTXVideoTransformer3DModel.from_single_file(
    # single_file, torch_dtype=torch.bfloat16
    # )
    # vae = AutoencoderKLLTXVideo.from_single_file(single_file, torch_dtype=torch.bfloat16)
    # pipe = LTXImageToVideoPipeline.from_pretrained(
    # "Lightricks/LTX-Video", transformer=transformer, vae=vae, torch_dtype=torch.bfloat16
    # )
    
    
    transformer = LTXVideoTransformer3DModel.from_single_file(
    single_file, torch_dtype=torch.bfloat16
    )
    vae = AutoencoderKLLTXVideo.from_single_file(single_file, torch_dtype=torch.bfloat16)
    text_encoder = T5EncoderModel.from_pretrained(
    "Lightricks/LTX-Video", subfolder="text_encoder", torch_dtype=torch.bfloat16
    )
    tokenizer = T5Tokenizer.from_pretrained(
    "Lightricks/LTX-Video", subfolder="tokenizer", torch_dtype=torch.bfloat16
    )
    pipe = LTXPipeline.from_single_file(
    single_file, transformer=transformer, text_encoder=text_encoder, tokenizer=tokenizer, vae=vae, torch_dtype=torch.bfloat16
    )
    # pipe = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
    pipe.to(get_device())
    negative_prompt = "worst quality, inconsistent motion, blurry, jittery, distorted, ugly face, weird hands"

    video = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width, #512 768
        height=height, #320 512
        num_frames=frames, #192 #96
        num_inference_steps=steps, #50 #100
        max_sequence_length=256,
    ).frames[0]
    export_to_video(video, "video_turbo.mp4", fps=fps)
    
    return {'prompt': prompt}, 201

@app.route('/video', methods=['POST'])
def get_bonzai_video():
    # Parse request payload
    data         = request.json
    prompt       = data['prompt']
    height       = data['height']
    width        = data['width']
    num_frames   = data['frames']
    num_steps    = data['steps']
    fps          = data['fps']

    # Path to the single-file GGUF model
    single_file = get_model_path("Wan2.1-T2V-1.3B-Q8_0.gguf")

    # Base model repo
    model_id = "./Wan2.1-T2V-1.3B-Diffusers"

    # Load CLIP image encoder (float32)
    image_encoder = CLIPVisionModel.from_pretrained(
        model_id,
        subfolder="image_encoder",
        torch_dtype=torch.float32,
        use_safetensors=True
    )

    # Load VAE (float32)
    vae = AutoencoderKLWan.from_pretrained(
        model_id,
        subfolder="vae",
        torch_dtype=torch.float32,
        use_safetensors=True
    )

    # Load quantized transformer from GGUF (bfloat16 compute)
    transformer = WanTransformer3DModel.from_single_file(
        single_file,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
        torch_dtype=torch.bfloat16
    )

    # Configure fast sampling scheduler for flow prediction
    scheduler = UniPCMultistepScheduler(
        prediction_type="flow_prediction",
        use_flow_sigmas=True,
        num_train_timesteps=1000,
        flow_shift=3.0
    )

    # Build the video pipeline (float16 for MPS compatibility)
    pipe = WanPipeline.from_pretrained(
        model_id,
        transformer=transformer,
        vae=vae,
        image_encoder=image_encoder,
        scheduler=scheduler,
        torch_dtype=torch.float16,
        use_safetensors=True
    )

    # Move to the best available device
    device = get_device()  # returns "cuda", "mps", or "cpu"
    pipe.to(device)

    # Memory optimizations
    if device == "cuda":
        # Requires `accelerate` installed
        pipe.enable_model_cpu_offload()
    else:
        # On MPS/CPU, use attention slicing to save memory
        pipe.enable_attention_slicing()

    # Define a comprehensive negative prompt
    negative_prompt = (
        "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, "
        "images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, "
        "incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, "
        "misshapen limbs, fused fingers, still picture, messy background, three legs, many people "
        "in the background, walking backwards"
    )

    # Generate video frames
    video_frames = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=num_steps,
        max_sequence_length=256,
        guidance_scale=5.0
    ).frames  # returns List[PIL.Image] :contentReference[oaicite:6]{index=6}

    # Export to MP4
    export_to_video(video_frames, "bonzai_video.mp4", fps=fps)

    return {'prompt': prompt}, 201

@app.route('/image/video', methods=['POST'])
def get_workflow_i2v():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    frames=payload['frames']
    steps=payload['steps']
    fps=payload['fps']
    image_url=payload['image_url']
    image_base64=payload['image_base64']
    single_file = get_model_path("ltxv-2b-0.9.6-dev-04-25.safetensors")
    transformer = LTXVideoTransformer3DModel.from_single_file(
    single_file, torch_dtype=torch.bfloat16
    )
    vae = AutoencoderKLLTXVideo.from_single_file(single_file, torch_dtype=torch.bfloat16)
    pipe = LTXImageToVideoPipeline.from_pretrained(
    "Lightricks/LTX-Video", transformer=transformer, vae=vae, torch_dtype=torch.bfloat16
    )
    # pipe = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
    pipe.to(get_device())
    negative_prompt = "worst quality, inconsistent motion, blurry, jittery, distorted, ugly face, weird hands"

    if image_base64:
        image_bytes = base64.b64decode(image_base64)
        image = image_bytes
    else:
        image = load_image(image_url)

    video = pipe(
        prompt=prompt,
        image=image,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        num_frames=frames,
        num_inference_steps=steps,
        max_sequence_length=256,
    ).frames[0]
    export_to_video(video, "video_turbo.mp4", fps=fps)
    
    return {'prompt': prompt}, 201

@app.route('/video/wan', methods=['POST'])
def get_video_synth():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    frames=payload['frames']
    steps=payload['steps']
    fps=payload['fps']
    # model_id = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
    # vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.bfloat16)
    # pipe = WanPipeline.from_pretrained(model_id, torch_dtype=torch.bfloat16)
    ckpt_path = "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/diffusion_models/wan2.1_t2v_1.3B_bf16.safetensors"
    transformer = WanTransformer3DModel.from_single_file(ckpt_path, torch_dtype=torch.bfloat16)

    pipe = WanPipeline.from_pretrained("Wan-AI/Wan2.1-T2V-1.3B-Diffusers", transformer=transformer)
    # pipe = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
    pipe.to(get_device())
    negative_prompt = "worst quality, inconsistent motion, blurry, jittery, distorted, ugly face, weird hands"

    video = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        num_frames=frames,
        num_inference_steps=steps,
        guidance_scale=5.0
    ).frames[0]
    export_to_video(video, "video_turbo_alt.mp4", fps=fps)
    
    return {'prompt': prompt}, 201

##############################################################################
# Common Helper Functions
##############################################################################
def format_timestamp(seconds):
    millis = int((seconds - math.floor(seconds)) * 1000)
    s = int(seconds)
    hrs = s // 3600
    mins = (s % 3600) // 60
    secs = s % 60
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

def generate_meal_plan(ingredients, caloric_goal):
    prompt = (f"Generate a gourmet meal plan using these ingredients: {ingredients} "
              f"with a caloric goal of {caloric_goal} kcal.")
    print(f"[LLM Meal] Prompt: {prompt}")
    generated_plan = (
        "Step 1: Gather your premium ingredients: " + ingredients + ". "
        "Step 2: Season and prepare each component individually. "
        "Step 3: Cook each element with precision. "
        "Step 4: Plate the dish artfully, showcasing all prepared components."
    )
    return generated_plan

def generate_travel_plan(city):
    prompt = (f"Generate a travel itinerary for {city} that lists the top 10 activities. "
              "Rank the activities from 10 (least impressive) to 1 (the best). "
              "Each activity should start with 'Activity X:' where X is the rank.")
    print(f"[LLM Travel] Prompt: {prompt}")
    generated_plan = (
        "Activity 10: Explore the historic Old Quarter and its narrow alleys. "
        "Activity 9: Visit Hoan Kiem Lake for a serene escape. "
        "Activity 8: Wander through Dong Xuan Market to experience local flavors. "
        "Activity 7: Stroll around the Temple of Literature and admire ancient architecture. "
        "Activity 6: Enjoy a traditional water puppet show at Thang Long Theatre. "
        "Activity 5: Marvel at the elegant Hanoi Opera House at dusk. "
        "Activity 4: Discover cultural treasures at the Vietnam Museum of Ethnology. "
        "Activity 3: Tour the Ho Chi Minh Mausoleum and Presidential Palace. "
        "Activity 2: Relax in the serene gardens near the Imperial Palace. "
        "Activity 1: Conclude with a breathtaking Red River cruise at sunset offering panoramic views."
    )
    return generated_plan

def generate_tts_audio(text, speech_language_code=None, speed=1, sample_rate=24000):
    # Map language code to a specific voice.
    voice_mapping = {
        "f": "ff_siwis",   # French
        "a": "bm_lewis"    # English
    }
    # Choose the voice based on the provided speech_language_code; default to English if not provided.
    voice = voice_mapping.get(speech_language_code, "bm_lewis")
    # Also choose the lang_code for the pipeline; default to "a" if not provided.
    lang_code = speech_language_code if speech_language_code is not None else "a"
    tts_pipeline = KPipeline(lang_code=lang_code)
    generator = tts_pipeline(text, voice=voice, speed=speed, split_pattern=r'\n+')
    audio_segments = []
    for i, (graphemes, phonemes, audio) in enumerate(generator):
        print(f"[Kokoro TTS] Segment {i}: {graphemes} | {phonemes}")
        audio_segments.append(audio)
    if not audio_segments:
        raise ValueError("No audio segments generated.")
    combined_audio = np.concatenate(audio_segments)
    return combined_audio

def generate_soundtrack(prompt, duration=47):
    model, model_config = get_pretrained_model("stabilityai/stable-audio-open-1.0")
    sample_rate = model_config["sample_rate"]
    sample_size = model_config["sample_size"]
    model = model.to(get_device())
    conditioning = [{"prompt": prompt, "seconds_start": 0, "seconds_total": duration}]
    output = generate_diffusion_cond(
        model, steps=500, cfg_scale=10, conditioning=conditioning,
        sample_size=sample_size, sigma_min=0.3, sigma_max=500,
        sampler_type="dpmpp-3m-sde", device=get_device()
    )
    output = rearrange(output, "b d n -> d (b n)")
    output = output.to(torch.float32).div(torch.max(torch.abs(output))).clamp(-1, 1).mul(32767).to(torch.int16).cpu()
    soundtrack_path = "soundtrack.wav"
    torchaudio.save(soundtrack_path, output, sample_rate)
    return soundtrack_path

def generate_srt(subtitle_entries, srt_filename="titles.srt"):
    with open(srt_filename, "w", encoding="utf-8") as f:
        for entry in subtitle_entries:
            idx = entry["index"]
            start_ts = format_timestamp(entry["start"])
            end_ts = format_timestamp(entry["end"])
            text = entry["text"]
            f.write(f"{idx}\n{start_ts} --> {end_ts}\n{text}\n\n")
    return srt_filename

def create_ken_burns_video(image_path, duration, output_video, fps=60):
    total_frames = int(math.ceil(duration * fps))
    zoom_increment = 0.2 / total_frames  # zoom from 1.0 to 1.2

    zoompan_filter = (
        f"scale='if(gt(a,1),-1,512)':'if(gt(a,1),512,-1)',"
        f"crop=512:512,"
        f"zoompan=z='min(zoom+{zoom_increment:.6f},1.2)':"
        f"d={total_frames}:s=512x512:fps={fps}"
    )

    subprocess.run([
        os.environ["IMAGEIO_FFMPEG_EXE"],
        "-y",
        "-loop", "1",
        "-i", image_path,
        "-vf", zoompan_filter,
        "-t", str(duration),
        "-s", "512x512",
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        output_video
    ], check=True)

    return output_video



def merge_video_audio(video_path, audio_path, output_path):
    subprocess.run([
        os.environ["IMAGEIO_FFMPEG_EXE"],
        "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-shortest",
        output_path
    ], check=True)
    return output_path

##############################################################################
# Meal Planner Agent Endpoint (/agent/meal)
##############################################################################
@app.route("/agent/meal", methods=["POST"])
def meal_agent():
    free_memory()
    payload = request.json
    if not payload:
        return jsonify({"error": "No JSON payload provided"}), 400

    # For the meal planner, expect a list of steps in "meal_plan_steps"
    if "meal_plan_steps" in payload and isinstance(payload["meal_plan_steps"], list):
        steps = payload["meal_plan_steps"]
    else:
        meal_plan_text = payload.get("meal_plan", "")
        if meal_plan_text.strip() == "":
            return jsonify({"error": "No meal plan steps provided."}), 400
        # Fallback: split by newline.
        steps = [line.strip() for line in meal_plan_text.split('\n') if line.strip() != ""]

    step_image_prompts = payload.get("step_image_prompts", [])
    if len(step_image_prompts) < len(steps):
        return jsonify({"error": "Insufficient step_image_prompts for the number of meal plan steps."}), 400

    music_prompt = payload.get("music_prompt", "A soothing orchestral soundtrack that evokes elegance and fine dining.")
    device = get_device()
    FPS = 60
    subtitle_entries = []
    cumulative_time = 0.0
    merged_files = []

    # Load Quality Image Pipeline.
    try:
        print("[MealPlanner] Loading Quality Image pipeline...")
        ckpt_path = "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_1.gguf"
        transformer = FluxTransformer2DModel.from_single_file(
            ckpt_path,
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
            torch_dtype=torch.bfloat16
        )
        quality_pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            transformer=transformer,
            torch_dtype=torch.bfloat16
        )
        quality_pipe.to(device)
        
    except Exception as e:
        return jsonify({"error": f"Error loading Quality Image pipeline: {e}"}), 500

    for i, (step, img_prompt) in enumerate(zip(steps, step_image_prompts)):
        step = step.strip()
        img_prompt = img_prompt.strip()[:256]
        print(f"[MealPlanner] Processing step {i+1}: {step}")

        try:
            speech_language_code = payload.get("speech_language_code", "a")
            tts_audio = generate_tts_audio(step, speech_language_code=speech_language_code, speed=1, sample_rate=24000)
            audio_path = f"meal_step_{i}_audio.wav"
            sf.write(audio_path, tts_audio, 24000)
        except Exception as e:
            print(f"Error generating TTS for meal step {i+1}: {e}")
            continue

        try:
            info = sf.info(audio_path)
            duration = info.frames / info.samplerate
        except Exception as e:
            duration = 5.0

        subtitle_entries.append({
            "index": i + 1,
            "start": cumulative_time,
            "end": cumulative_time + duration,
            "text": step  # Use the step text as title.
        })
        cumulative_time += duration

        try:
            gen = torch.Generator(device=device)
            gen.manual_seed(i + 100)
            image = quality_pipe(prompt=img_prompt, num_inference_steps=4, height=512, width=512, generator=gen).images[0]
            image_path = f"meal_step_{i}_image.png"
            image.save(image_path)
        except Exception as e:
            print(f"Error generating image for meal step {i+1}: {e}")
            continue

        video_path = f"meal_step_{i}_video.mp4"
        try:
            create_ken_burns_video(image_path, duration, video_path, fps=FPS)
        except Exception as e:
            print(f"Error creating Ken Burns video for meal step {i+1}: {e}")
            continue

        merged_path = f"meal_step_{i}_merged.mp4"
        try:
            merge_video_audio(video_path, audio_path, merged_path)
            merged_files.append(merged_path)
        except Exception as e:
            print(f"Error merging video/audio for meal step {i+1}: {e}")
            continue

    if not merged_files:
        return jsonify({"error": "No merged meal step videos generated."}), 500

    final_duration = cumulative_time
    concat_file = "meal_concat_list.txt"
    with open(concat_file, "w") as f:
        for seg in merged_files:
            f.write(f"file '{os.path.abspath(seg)}'\n")
    final_meal_video = "meal_recipe_final.mp4"
    try:
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            final_meal_video
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error concatenating meal videos: {e}"}), 500

    try:
        soundtrack_path = generate_soundtrack(music_prompt, duration=47)
    except Exception as e:
        return jsonify({"error": f"Error generating meal soundtrack: {e}"}), 500

    final_with_music = "meal_recipe_final_with_music.mp4"
    try:
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_meal_video,
            "-stream_loop", "-1",
            "-i", soundtrack_path,
            "-filter_complex", "[0:a]volume=1.0[a0];[1:a]volume=0.1[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=3[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            final_with_music
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error mixing meal soundtrack: {e}"}), 500

    final_faded = "meal_recipe_final_faded.mp4"
    try:
        fade_duration = 2
        fade_out_start = max(0, final_duration - fade_duration)
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_with_music,
            "-vf", f"fade=t=in:st=0:d={fade_duration},fade=t=out:st={fade_out_start}:d={fade_duration}",
            "-af", f"afade=t=in:st=0:d={fade_duration},afade=t=out:st={fade_out_start}:d={fade_duration}",
            final_faded
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error applying meal fade effects: {e}"}), 500

    meal_srt = "meal_titles.srt"
    try:
        generate_srt(subtitle_entries, srt_filename=meal_srt)
    except Exception as e:
        return jsonify({"error": f"Error generating meal SRT: {e}"}), 500

    final_meal_output = "meal_recipe_final_subbed.mp4"
    try:
        subtitles_filter = "subtitles=meal_titles.srt:force_style='Fontsize=20,Alignment=2,MarginV=50'"
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_faded,
            "-vf", subtitles_filter,
            "-c:a", "copy",
            final_meal_output
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error overlaying meal subtitles: {e}"}), 500

    meal_result = {
        "message": "Meal video generated successfully",
        "final_meal_video": final_meal_output
    }
    return jsonify(meal_result), 200

##############################################################################
# Travel Smart Agent Endpoint (/agent/travel)
##############################################################################
@app.route("/agent/travel", methods=["POST"])
def travel_agent():
    free_memory()
    payload = request.json
    if not payload:
        return jsonify({"error": "No JSON payload provided"}), 400

    city = payload.get("city", "the city")
    # Expect travel_plan_activities as an array.
    activities = payload.get("travel_plan_activities", [])
    if not activities or not isinstance(activities, list):
        return jsonify({"error": "No travel plan activities provided."}), 400

    travel_image_prompts = payload.get("activity_image_prompts", [])
    if len(travel_image_prompts) < len(activities):
        return jsonify({"error": "Insufficient activity_image_prompts for the number of travel activities."}), 400

    music_prompt = payload.get("music_prompt", "An uplifting orchestral soundtrack that evokes adventure and cultural richness.")
    device = get_device()
    FPS = 60

    # Use the provided travel_plan_activities array directly.
    # The intro step is the first activity; we do NOT record a subtitle for the intro.
    travel_subtitles = []
    cumulative_time = 0.0
    merged_files = []
    durations = []

    # Load Quality Image Pipeline.
    try:
        print("[TravelAgent] Loading Quality Image pipeline...")
        ckpt_path = "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_1.gguf"
        transformer = FluxTransformer2DModel.from_single_file(
            ckpt_path,
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
            torch_dtype=torch.bfloat16
        )
        quality_pipe = FluxPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            transformer=transformer,
            torch_dtype=torch.bfloat16
        )
        quality_pipe.to(device)
    except Exception as e:
        return jsonify({"error": f"Error loading Quality Image pipeline: {e}"}), 500

    for i, activity in enumerate(activities):
        activity = activity.strip()
        print(f"[TravelAgent] Processing activity {i+1}: {activity}")

        try:
            speech_language_code = payload.get("speech_language_code", "a")
            tts_audio = generate_tts_audio(activity, speech_language_code=speech_language_code, speed=1, sample_rate=24000)
            audio_path = f"travel_activity_{i}_audio.wav"
            sf.write(audio_path, tts_audio, 24000)
        except Exception as e:
            print(f"Error generating TTS for travel activity {i+1}: {e}")
            continue

        try:
            info = sf.info(audio_path)
            duration = info.frames / info.samplerate
            durations.append(duration)
        except Exception as e:
            duration = 5.0
            durations.append(duration)

        # Do not record a subtitle entry for the intro (first activity).
        if i != 0:
            travel_subtitles.append({
                "index": i + 1,
                "start": cumulative_time,
                "end": cumulative_time + duration,
                "text": activity  # Use the activity text as the title.
            })
        cumulative_time += duration

        try:
            gen = torch.Generator(device=get_device())
            gen.manual_seed(i + 200)
            image = quality_pipe(prompt=travel_image_prompts[i], num_inference_steps=4, height=512, width=512, generator=gen).images[0]
            image_path = f"travel_activity_{i}_image.png"
            image.save(image_path)
        except Exception as e:
            print(f"Error generating image for travel activity {i+1}: {e}")
            continue

        num_frames = int(math.ceil(duration * FPS))
        video_path = f"travel_activity_{i}_video.mp4"
        try:
            create_ken_burns_video(image_path, duration, video_path, fps=FPS)
        except Exception as e:
            print(f"Error creating Ken Burns video for travel activity {i+1}: {e}")
            continue

        merged_path = f"travel_activity_{i}_merged.mp4"
        try:
            merge_video_audio(video_path, audio_path, merged_path)
            merged_files.append(merged_path)
        except Exception as e:
            print(f"Error merging video/audio for travel activity {i+1}: {e}")
            continue

    if not merged_files:
        return jsonify({"error": "No merged travel activity videos generated."}), 500

    final_duration = sum(durations)
    concat_file = "travel_concat_list.txt"
    with open(concat_file, "w") as f:
        for seg in merged_files:
            f.write(f"file '{os.path.abspath(seg)}'\n")
    final_video = "travel_itinerary_final.mp4"
    try:
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            final_video
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error concatenating travel videos: {e}"}), 500

    try:
        soundtrack_path = generate_soundtrack(music_prompt, duration=47)
    except Exception as e:
        return jsonify({"error": f"Error generating travel soundtrack: {e}"}), 500

    final_with_music = "travel_itinerary_final_with_music.mp4"
    try:
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_video,
            "-stream_loop", "-1",
            "-i", soundtrack_path,
            "-filter_complex", "[0:a]volume=1.0[a0];[1:a]volume=0.1[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=3[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            final_with_music
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error mixing travel soundtrack: {e}"}), 500

    final_faded = "travel_itinerary_final_faded.mp4"
    try:
        fade_duration = 2
        fade_out_start = max(0, final_duration - fade_duration)
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_with_music,
            "-vf", f"fade=t=in:st=0:d={fade_duration},fade=t=out:st={fade_out_start}:d={fade_duration}",
            "-af", f"afade=t=in:st=0:d={fade_duration},afade=t=out:st={fade_out_start}:d={fade_duration}",
            final_faded
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error applying travel fade effects: {e}"}), 500

    travel_srt = "travel_titles.srt"
    try:
        generate_srt(travel_subtitles, srt_filename=travel_srt)
    except Exception as e:
        return jsonify({"error": f"Error generating travel SRT: {e}"}), 500

    final_travel_output = "travel_itinerary_final_subbed.mp4"
    try:
        # Reduced font size to 16.
        subtitles_filter = "subtitles=travel_titles.srt:force_style='Fontsize=16,Alignment=2,MarginV=50'"
        subprocess.run([
            os.environ["IMAGEIO_FFMPEG_EXE"],
            "-y",
            "-i", final_faded,
            "-vf", subtitles_filter,
            "-c:a", "copy",
            final_travel_output
        ], check=True)
    except Exception as e:
        return jsonify({"error": f"Error overlaying travel subtitles: {e}"}), 500

    travel_result = {
        "message": "Travel itinerary video generated successfully",
        "final_travel_video": final_travel_output
    }
    return jsonify(travel_result), 200

@app.route('/agent/realestate', methods=['POST'])
def real_estate_agent():
    free_memory()
    payload = request.json
    if not payload:
        return jsonify({"error": "No JSON payload provided"}), 400

    description = payload.get("listing_description", "A stunning property.")
    image_urls = payload.get("image_urls", [])
    
    if len(image_urls) == 0:
        return jsonify({"error": "No property images provided."}), 400

    # Generate TTS audio from description
    tts_audio = generate_tts_audio(description, speech_language_code="a", speed=1, sample_rate=24000)
    audio_path = "listing_audio.wav"
    sf.write(audio_path, tts_audio, 24000)

    audio_info = sf.info(audio_path)
    total_duration = audio_info.frames / audio_info.samplerate
    duration_per_image = max(total_duration / len(image_urls), 6.0)

    video_segments = []
    for idx, img_url in enumerate(image_urls):
        img_response = requests.get(img_url)
        img = Image.open(BytesIO(img_response.content))
        img_path = f"listing_img_{idx}.jpg"
        img.save(img_path)

        segment_video_path = f"segment_{idx}.mp4"
        create_ken_burns_video(img_path, duration_per_image, segment_video_path, fps=60)
        video_segments.append(segment_video_path)

    # Concatenate video segments
    concat_file = "segments.txt"
    with open(concat_file, "w") as f:
        for seg in video_segments:
            f.write(f"file '{os.path.abspath(seg)}'\n")

    combined_video = "combined_listing_video.mp4"
    subprocess.run([
        os.environ["IMAGEIO_FFMPEG_EXE"], "-y",
        "-f", "concat", "-safe", "0", "-i", concat_file,
        "-c", "copy", combined_video
    ], check=True)

    # Merge final video with audio
    final_video = "final_listing_video.mp4"
    merge_video_audio(combined_video, audio_path, final_video)
    
    add_video_watermark("final_listing_video.mp4", "bonzai.png", "final_listing_video_watermarked.mp4")

    return jsonify({
        "message": "Real estate video created successfully",
        "listing_video": final_video
    }), 200


if __name__ == "__main__":
    print('Welcome to BonzAI!')
    #time.sleep(5)
    app.run(host='0.0.0.0', port=65000)
    