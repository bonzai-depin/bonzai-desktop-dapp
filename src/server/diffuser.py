#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, request
import torch
from diffusers import FluxPipeline, AutoPipelineForText2Image, DiffusionPipeline, StableAudioPipeline
import soundfile as sf
import scipy
import os
# os.environ['FOOBAR']='True'
import resource, sys
# resource.setrlimit(resource.RLIMIT_STACK, (4096, 4096)) 
from huggingface_hub import login


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
    pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16)
    pipe.save_pretrained(".")

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
    image.save("flux.png")
    
    return {'prompt': prompt}, 201


@app.route('/image/sd', methods=['POST'])
def get_image_sd():
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16")
    pipe.to(get_device())

    payload = request.json
    prompt=payload['prompt']

    image = pipe(prompt=prompt, num_inference_steps=8, guidance_scale=0.0).images[0]
    image.save("sd.png")
    
    # pipex4 = StableDiffusionUpscalePipeline.from_pretrained("stabilityai/stable-diffusion-x4-upscaler", torch_dtype=torch.float16)
    # pipex4.to(get_device())
    
    # low_res_image = image.resize((256, 256))

    # upscaled_image = pipex4(prompt=prompt, image=low_res_image).images[0]
    # upscaled_image.save("sd_4x.png")
    
    return {'prompt': prompt}, 201

@app.route('/image/sdxl', methods=['POST'])
def get_image_sdxl():
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
    
    image.save("sd_refined.png")
    
    return {'prompt': prompt}, 201


@app.route('/music/sfx', methods=['POST'])
def get_sfx():
    login("REMOVED_HF_TOKEN")
    sys.setrecursionlimit(100000000)
    payload = request.json
    prompt=payload['prompt']
    pipe = StableAudioPipeline.from_pretrained("stabilityai/stable-audio-open-1.0", torch_dtype=torch.float16).to(get_device())

    # define the prompts
    prompt = prompt
    negative_prompt = "Low quality."

    # set the seed for generator
    generator = torch.Generator(get_device()).manual_seed(0)

    # run the generation
    audio = pipe(
        prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=2,
        audio_end_in_s=5.0,
        num_waveforms_per_prompt=3,
        generator=generator,
    ).audios

    output = audio[0].T.float().cpu().numpy()
    sf.write("sfx.wav", output, pipe.vae.sampling_rate)

    return {'prompt': prompt}, 201

if __name__ == "__main__":
    print('oh hello')
    #time.sleep(5)
    app.run(host='127.0.0.1', port=11000)
    