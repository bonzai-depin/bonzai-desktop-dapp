#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, request
import torch
from diffusers import FluxPipeline, AutoPipelineForText2Image, DiffusionPipeline, CogVideoXImageToVideoPipeline
from diffusers.utils import export_to_video, load_image

import torchaudio
from einops import rearrange
from stable_audio_tools import get_pretrained_model
from stable_audio_tools.inference.generation import generate_diffusion_cond

import sys

app = Flask(__name__)

def get_device():
    if torch.backends.mps.is_available():
        return torch.device('mps')
    elif torch.cuda.is_available():
        return torch.device('cuda')
    else:
        return torch.device('cpu')

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

@app.route('/image/flux', methods=['POST'])
def get_image():
    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    print(prompt)
    pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16)
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
    
    return {'prompt': prompt}, 201

@app.route('/image/turbo', methods=['POST'])
def get_image_turbo():
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16")
    pipe.to(get_device())

    payload = request.json
    prompt=payload['prompt']

    image = pipe(prompt=prompt, num_inference_steps=3, guidance_scale=1).images[0]
    image.save("image_turbo.png")
    
    return {'prompt': prompt}, 201

@app.route('/image/quality', methods=['POST'])
def get_image_quality():
    base = AutoPipelineForText2Image.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16")
    base.to(get_device())

    payload = request.json
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    refiner = DiffusionPipeline.from_pretrained(
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
    
    return {'prompt': prompt}, 201

@app.route('/music', methods=['POST'])
def get_sound():
    # Download model
    model, model_config = get_pretrained_model("stabilityai/stable-audio-open-1.0")
    sample_rate = model_config["sample_rate"]
    sample_size = model_config["sample_size"]

    model = model.to(get_device())
    payload = request.json
    prompt=payload['prompt']
    
    # Set up text and timing conditioning
    conditioning = [{
        "prompt": prompt,
        "seconds_start": 0, 
        "seconds_total": 47
    }]

    # Generate stereo audio
    output = generate_diffusion_cond(
        model,
        steps=500,
        cfg_scale=10,
        conditioning=conditioning,
        sample_size=sample_size,
        sigma_min=0.3,
        sigma_max=500,
        sampler_type="dpmpp-3m-sde",
        device=get_device()
    )

    # Rearrange audio batch to a single sequence
    output = rearrange(output, "b d n -> d (b n)")

    # Peak normalize, clip, convert to int16, and save to file
    output = output.to(torch.float32).div(torch.max(torch.abs(output))).clamp(-1, 1).mul(32767).to(torch.int16).cpu()
    torchaudio.save("music.wav", output, sample_rate)
    
    return {'prompt': prompt}, 201

if __name__ == "__main__":
    print('Welcome to BonzAI!')
    #time.sleep(5)
    app.run(host='127.0.0.1', port=22222)
    