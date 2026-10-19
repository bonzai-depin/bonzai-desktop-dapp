# Performance benchmark

Open **Benchmark** in the desktop sidebar:

- **Run scenarios** executes versioned, fixed workloads for cross-machine comparison.
- **Automatic recording** captures all pipeline timings from app startup, including while tests run. No setup or category exclusions apply. Save a report snapshot to archive completed samples without stopping recording.

Both modes store reports locally and allow explicit JSON export or IPFS publication.
Restart BonzAI after updating: Electron and the Python service both have new hooks.

## Standardized scenarios

The `bonzai-standard-1` suite contains 12 scenarios: two text workloads, a lantern
code-generation + isolated GLB-export workload, Klein and Z-Image generation,
10-second instrumental music, vision, OCR, forecasting, and LTX/Wan/H3 video.
Select categories and individual scenarios before starting. Only checked scenarios execute; this never filters automatic recording.
The workload disclosure lists exactly what will run. This is a curated scenario
suite, not automated coverage of every endpoint: SDXL, voice synthesis/cloning,
image editing, enhancement, and the full interactive 3D repair/game loops remain
observed-only. The 3D scenario checks exportable geometry, not artistic quality.

Each scenario uses one unscored first pass followed by two measured passes.
Prompts, fixture image bytes, seed, canvas, frame counts, steps, and token limits
are versioned in `src/shared/benchmark/scenarios.js`. Vision uses a fixed seed,
zero temperature and disabled thinking. First-pass timing remains visible; it
is **not** labeled a cold start. Endpoints may reload models on every call, and
the runner does not force unloading. The measured wall time includes endpoint
loading, queueing, generation and export; text token counts/rates are retained
where reported. Two repetitions are a small sample, not a confidence interval.

The runner lives in Electron and continues across navigation. It waits for idle
LLM/media runtimes before each pass, uses local endpoints directly, and declines
distributed LLM execution. It never pauses teams or cancels another user's work.
Overlapping BonzAI inference invalidates the trial for comparison. Other programs,
thermal throttling and operating-system activity cannot be fully controlled:
close other heavy workloads and use consistent power settings.

**Stop after current test** lets in-flight work finish and skips the remaining
passes. Missing models are skipped with a reason, not downloaded. Text and 3D
use the currently loaded local LLM. H3 requires explicit acceptance of its terms.
Generated media stays in the normal local files directory; reports contain
timing evidence rather than copies of generated media.

Before scoring, SHA-256 fingerprints identify installed model files, adapters
and repository assets. Fingerprinting is streamed and cached by size/modification
time; large models can take minutes on the first pass. Software versions and
source fingerprint are recorded. After each scenario, a second environment check
invalidates results if weights or settings changed.

### Compare two machines

1. Run the same categories in the same BonzAI version on both machines.
2. Use matching models/quantization and decoding configuration.
3. Export JSON on the first machine.
4. On the second machine, open its scenario report and choose **Compare another machine**.
5. Expand a scenario to see medians and relative speed.

Only completed cases with two measured passes and matching comparison keys
receive a ratio. Keys cover the versioned recipe/fixture, model hashes, decoding
settings and software release. Device identity, GPU placement and thread count
are reported separately; accelerator build suffixes such as `+cu128` do not
prevent cross-platform comparison. Different model versions or failed/contended
runs are labeled **Not comparable**, never converted to a hardware score.
Identical seeds do not imply identical outputs across CPU/CUDA/MPS.

## Observed recording

Create normally; all pipelines are recorded automatically. Review the
report. All registered pipelines count toward coverage. This mode does not
schedule any generation or change model residency. Capture survives navigation.

## Coverage and interpretation

- Text completion, streaming, multimodal LLM, worker pool and API gateway requests.
- Every registered image, speech/music, video/enhancement, vision/OCR, forecast and
  Finger Frame inference route; route coverage is tested against `diffuser.py`.
- Full 3D object/level/game generation traces, alongside their individual LLM calls.
  These are nested measurements: **do not sum them**.
- The catalog displays unmeasured pipelines, not invented results. Downloads,
  training, model management and remote-provider inference are not local inference
  benchmarks. Native LLM RPC work is labeled distributed, not local hardware speed.
- Wall time includes queue/execution/export at the measured request boundary.
  Python reports queue and execution separately. Native text timing starts at the
  runtime call; a separate preceding model-load operation is not included. Pool
  timing includes acquisition. No cold/warm classification is inferred.
- Requested numeric parameters and reported output dimensions are separate.
  Unreported model/adapter identity, token counters, GPU peak memory and output
  quality remain unknown. A completed HTTP request is not a quality assessment.
- Failures, cancellations, interrupted runs and asynchronous acceptance remain
  distinct from completion. Medians exclude failures; P95 requires 20 completed
  timed samples. Compare only matching workloads, model settings and hardware.

## Persistence and privacy

Reports live in Electron's user-data directory under `performance-benchmarks/`.
Each session has `report.json` and atomic `sample-<uuid>.json` records. Records are
not automatically deleted. `active.json` identifies the automatic activity session; `suite.json` identifies an independent test run;
Electron supplies the directory through `BONZAI_BENCHMARK_DIR`. No new network
listener or dependency is required. Stopping prevents new samples; already-running
requests finish normally. On app restart, unfinished records become interrupted.

The hardware snapshot includes CPU/core/cache details, all detected GPUs and driver
versions, RAM/available memory/swap, disk capacities and interfaces, OS/kernel and
Electron/Node/Chromium versions. Python adds runtime versions. Identifiers such as
hostnames, serials, MAC/IP addresses, users and filesystem paths are excluded.
For observed sessions, only allowlisted numeric generation parameters and metrics are recorded. Prompts,
media, response text, exception bodies and credentials are excluded. LLM filenames
are retained without directories. Missing hardware fields remain unknown. Standardized sessions additionally retain public built-in recipes and content hashes, never the user’s prompts.

## Decentralized archive

After tests finish, or after saving a snapshot of automatic activity, **Archive to IPFS** shows
the exact public report and requires explicit consent. It uses the existing Pinata
storage integration. The returned CID is saved in the local session. No report is
uploaded merely by starting a benchmark or navigating to the page. Export JSON is
available without storage credentials or a wallet.

IPFS is content-addressed storage, **not a guarantee of permanent availability**.
Maintain pinning (or independently retain/pin the exported report) for long-term
access. Permanent prepaid archival is not implemented by the current provider.

## Checks

```sh
node --test test/performance-benchmark.test.mjs test/benchmark-scenarios.test.mjs test/generation-metrics.test.mjs
bonzai/bin/python -m unittest discover -s test -p test_benchmark_environment.py
bonzai/bin/python -m unittest discover -s test -p test_performance_capture.py
BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/performance-benchmark.browser.test.mjs
```

The browser test uses an isolated in-memory bridge and never uploads or runs a
model. The Flask test verifies actual middleware behavior with lightweight routes.

## Model comparisons

Run the same Text scenarios with each loaded local model/configuration, for example Qwen standard then MTP. Use the saved-run selector or import an exported report. Results display model identity, MTP state, median decoding tok/s and request time. Matching workload hashes permit a descriptive configuration comparison; only matching complete comparison keys permit a hardware-relative speed score. Loading models remains explicit and never interrupts an existing generation automatically.

Video cases show canvas, generation duration and generated frames per second of waiting (not playback FPS).
