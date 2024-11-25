#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify
import torch
from diffusers import FluxPipeline

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

@app.route('/image', methods=['POST'])
def get_image():
    payload = request.json
    # prompt = request.form['prompt']
    # height = request.form['height']
    # width = request.form['width']
    prompt=payload['prompt']
    height=payload['height']
    width=payload['width']
    print(prompt)
    pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16)
    pipe.to(get_device())
    # pipe.enable_model_cpu_offload() #save some VRAM by offloading the model to CPU. Remove this if you have enough GPU power

    # prompt = "A night scene in Menton, Cote d'Azur, showing a midnight blue BMW E34 Touring car parked along a seaside promenade, with a backdrop of the sea. Scene includes palm trees and orange lamp lights."
    image = pipe(
        prompt=prompt,
        guidance_scale=0.,
        # height=512,
        # width=768,
        height=height,
        width=width,
        num_inference_steps=4,
        max_sequence_length=256
    ).images[0]
    image.save("flux-schnell.png")
    
    return {'prompt': prompt}, 201

if __name__ == "__main__":
    print('oh hello')
    #time.sleep(5)
    app.run(host='127.0.0.1', port=5000)
    