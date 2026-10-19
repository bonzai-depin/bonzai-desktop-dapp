# Local inference engine comparison

`node scripts/benchmarks/compare-llm-engines.mjs config.json results.json` measures already-running, local OpenAI-compatible servers. It does not install engines, download weights, start inference services or send conversation history. Use an unused output filename.

Example configuration (replace model/runtime revisions with exact values):

```json
{
  "hardwareLabel": "M1 Max 32 GB",
  "repeats": 3,
  "engines": [{
    "name": "llama.cpp",
    "url": "http://127.0.0.1:8080/v1",
    "model": "model-served-by-this-engine",
    "revision": "exact-weight-revision",
    "quantization": "Q4_K_M",
    "runtimeVersion": "exact-runtime-commit"
  }]
}
```

Run one engine at a time on memory-constrained machines. Repeat on identical hardware with the other engines. The four workloads cover prose, structured JSON, code and a longer input. Each receives one discarded warm-up followed by measured repetitions; temperature is zero, seed 42, output limit 512 and concurrency one. Thinking is requested off; confirm each server honors this setting.

Reports record time to first output, total elapsed time, server-reported token counts, end-to-end tokens/second, optional server decode speed and output hashes. Missing token counts remain null, never estimates from character counts. JSON output gets a basic required-field check; this is not a comprehensive quality evaluation.

Repeated prompts permit prefix-cache reuse. These results therefore measure warm, repeated-prefix requests, not cold startup or uncached prefill. GPU model/driver, engine launch flags, context size, KV precision, draft configuration and power mode should accompany reports. The automatic hardware snapshot captures CPU, OS, architecture and RAM only.

Compare the same target weights and similar quantization quality. Review output quality separately, especially code correctness, structured-output adherence and reasoning behavior. Different tokenizers, model families, output lengths and quantization can invalidate a speed ranking. This harness does not measure peak memory, energy or multi-user throughput. No performance winner is implied by integration or a successful run.
