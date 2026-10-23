"""Verified standalone model mirrors. Keep local filenames and adapter settings stable."""
MODEL_CDN = "https://pub-c63241af101045fb837462e5c4c67e33.r2.dev/models"
MODEL_FILES = {'qwen-image-2.1-lora.safetensors': {'sha256': '83aba822ad8ee10a1e836828f5088259d93bce7b5f3419b46dbc0258c2be46a9', 'size': 79744352},
 'ema_vae_fp16.safetensors': {'sha256': '20678548f420d98d26f11442d3528f8b8c94e57ee046ef93dbb7633da8612ca1',
                              'size': 501324814},
 'flux-2-klein-9b-lora-extra.safetensors': {'sha256': '97140b103cb601f83db8ecb854ee804bd4261fba056ecf7802c65359525b0a8a',
                                            'size': 1090563784},
 'flux-2-klein-9b-lora.safetensors': {'sha256': 'bcf84b6b72ccef01f6e36565bd8b69ce8513907e80204476cb3e42098b453341',
                                      'size': 331378480},
 'h3_extra.safetensors': {'sha256': 'fc3e856d14c6c19557c888f48662d591e4794e281233ec0d987be5003068afba',
                          'size': 155095800},
 'h3_hybrid.safetensors': {'sha256': '4dd965496e5b1b83cd13c65cbe7a535b8a4d94ae768a7646b4e336d52c4781cf',
                           'size': 20970414464},
 'h3_lora.safetensors': {'sha256': '52cb409bd89bb5e9a69851c03a1197b3a5b5698c745b812e2f9813492cde7167',
                         'size': 172065637},
 'h3_more.safetensors': {'sha256': '52cb409bd89bb5e9a69851c03a1197b3a5b5698c745b812e2f9813492cde7167',
                         'size': 172065637},
 'h3_turbo.safetensors': {'sha256': '4f95afb2ab503eac876ae5571f4d78b0e0fd0198b626a89f4b7727018ed198a9',
                          'size': 620285592},
 'klein-unchained-v2.safetensors': {'sha256': 'bcf84b6b72ccef01f6e36565bd8b69ce8513907e80204476cb3e42098b453341',
                                    'size': 331378480},
 'minimax_h3_audio_vae_fp32.safetensors': {'sha256': '8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48',
                                           'size': 605254808},
 'minimax_h3_fl2v_turbo_8step_v1.0_bf16.safetensors': {'sha256': 'e16ac20824d6e6649b193806f8fb095639bd9946c97b1bb84b4248eab1cc807f',
                                                       'size': 1383677768},
 'minimax_h3_hyperflow_8step_v1.0_comfyui_pruned_bf16_resized_avg_rank_20_bf16.safetensors': {'sha256': 'f8c307078def510312bb374509e70e8a9384e9ac963cf3da3fbf3dab0e630089',
                                                                                              'size': 315905192},
 'minimax_h3_video_vae_fp16.safetensors': {'sha256': '7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522',
                                           'size': 5207808496},
 'mysticxxx_mmh3-v4.safetensors': {'sha256': 'fc3e856d14c6c19557c888f48662d591e4794e281233ec0d987be5003068afba',
                                   'size': 155095800},
 'sdxl-lora.safetensors': {'sha256': '183157e5d5e5aa264c4ed6e3cdc7e0c7fe2f0047134cd2be47b35f5fe508db67',
                           'size': 6938040866},
 'seedvr2_ema_3b_fp16.safetensors': {'sha256': '2fd0e03a3dad24e07086750360727ca437de4ecd456f769856e960ae93e2b304',
                                     'size': 6783018808},
 'wan-lora-animation-high-safetensors': {'sha256': 'eac4f4341008abb00434d08fed1d4fda4a144bc94cd26b4819f629f930a75181',
                                         'size': 306807280},
 'wan-lora-animation-low.safetensors': {'sha256': 'ad50dfc46c765a6ccc36d40e8a5f77ac2db041f68266593add12ac5f5eac2d76',
                                        'size': 306807280},
 'wan-lora-extra-high.safetensors': {'sha256': '34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39',
                                     'size': 613516752},
 'wan-lora-extra-low.safetensors': {'sha256': 'd6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db',
                                    'size': 613516752},
 'wan-lora-high.safetensors': {'sha256': 'd9931756c202bd8d4946c0d163c1269231a6352b51bb4235f6a19894c9ad8c68',
                               'size': 306807976},
 'wan-lora-low.safetensors': {'sha256': '066ee4bfafb685c85f08174c8283cd11bc6d36f4845347f20d633ab44581601f',
                              'size': 306807976},
 'wan2.2_high_q5.gguf': {'sha256': '08d265fdec21a8a7a1dffb4d32b9429b914aea85a6b5f35f522f2aa33e02839f',
                         'size': 10799418688},
 'wan2.2_low_q5.gguf': {'sha256': '6477c318c0baefd72f3e84378ce39d00e8d789959fc626e98c57a63ce6ee1a7d',
                        'size': 10799418688}}

def model_file(name):
    name = name.lower()
    info = MODEL_FILES.get(name)
    if info is None:
        raise ValueError("Unknown mirrored model: " + name)
    # Legacy name retained for existing installations; the identical blob is
    # published under its current filename (same SHA-256 and byte length).
    remote_name = {'mysticxxx_mmh3-v4.safetensors': 'h3_extra.safetensors'}.get(name, name)
    return dict(name=name, url=f"{MODEL_CDN}/{remote_name}", **info)
