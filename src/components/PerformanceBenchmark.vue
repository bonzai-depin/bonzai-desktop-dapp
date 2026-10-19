<template>
  <section class="benchmark-view bz-page-content" :aria-busy="loading">
    <header class="bench-header bz-page-header">
      <div class="bench-heading">
        <span
          class="bench-title-icon material-symbols-outlined"
          aria-hidden="true"
          >speed</span
        >
        <div>
          <p class="bz-eyebrow">Performance</p>
          <h1 class="bz-h1">Performance Benchmark</h1>
        </div>
      </div>
      <div class="bench-actions">
        <button
          v-if="!recording"
          class="bz-btn bz-btn--primary"
          :disabled="busy || loading || !api?.run"
          @click="openSetup('standardized')"
        >
          <span class="material-symbols-outlined" aria-hidden="true"
            >play_arrow</span
          >Run scenarios
        </button>
        <button v-if="recording" class="bz-btn" :disabled="busy" @click="stop">
          Stop after current test
        </button>
        <button
          v-if="report?.mode === 'observed' && report?.status === 'recording'"
          class="bz-btn"
          @click="saveSnapshot"
        >
          Save report snapshot
        </button>
      </div>
    </header>
    <p v-if="!api" class="bench-notice" role="status">
      Open the desktop app to measure local inference and save hardware reports.
    </p>
    <div v-if="error" class="bench-notice bench-error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error</span
      ><span>{{ error }}</span
      ><button class="bz-btn" @click="retry">Retry</button>
    </div>
    <div v-if="recording" class="recording-strip" role="status">
      <span class="recording-dot" aria-hidden="true"></span>
      <div>
        <strong>{{
          recording.mode === "standardized"
            ? "Running standardized scenarios"
            : "Recording across BonzAI"
        }}</strong>
        <p>
          {{ (recording.categories || groups).join(" · ") }}.
          {{
            recording.mode === "standardized"
              ? "Keep other workloads idle for comparable results."
              : "Measurements continue while you work."
          }}
        </p>
      </div>
      <button
        v-if="selectedId !== recording.id"
        class="bz-btn"
        @click="selectSession(recording.id)"
      >
        View live session<span
          class="material-symbols-outlined"
          aria-hidden="true"
          >arrow_forward</span
        ></button
      ><span v-else class="live-label">Live session</span>
    </div>
    <div v-if="loading && !report" class="bench-empty" role="status">
      <span class="material-symbols-outlined" aria-hidden="true"
        >hourglass_top</span
      >
      <h2 class="bz-h2">Loading your measurements</h2>
    </div>
    <template v-else-if="!sessions.length">
      <div class="welcome">
        <div class="welcome-copy">
          <p class="bench-eyebrow">YOUR HARDWARE. YOUR RESULTS.</p>
          <h2 class="bz-h2">Your first performance report</h2>
          <p>
            Run fixed scenarios to compare machines, or record your everyday
            generations to see where time is spent.
          </p>
          <span class="privacy-note"
            ><span class="material-symbols-outlined" aria-hidden="true"
              >lock</span
            >Saved locally. Shared only when you choose.</span
          >
        </div>
        <ol class="welcome-steps">
          <li>
            <span class="step-number bz-metric">01</span>
            <div>
              <strong>Automatic local recording</strong>
              <p>
                Every inference records its timing and hardware automatically.
              </p>
            </div>
          </li>
          <li>
            <span class="step-number bz-metric">02</span>
            <div>
              <strong>Create as usual</strong>
              <p>
                Generate text, images, audio, video or 3D. No extra jobs are
                launched.
              </p>
            </div>
          </li>
          <li>
            <span class="step-number bz-metric">03</span>
            <div>
              <strong>Explore your results</strong>
              <p>
                Review timings, export a report, or choose to archive it
                publicly.
              </p>
            </div>
          </li>
        </ol>
      </div>
      <div class="coverage-preview">
        <h2 class="bz-h2">One place for every pipeline</h2>
        <div class="family-grid">
          <div v-for="group in groups" :key="group">
            <span class="material-symbols-outlined" aria-hidden="true">{{
              groupIcon(group)
            }}</span
            ><strong>{{ group }}</strong
            ><span
              >{{
                catalog.filter((p) => p.group === group).length
              }}
              pipelines</span
            >
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="session-toolbar">
        <label class="session-picker"
          ><span>Session</span
          ><select v-model="selectedId" @change="loadReport">
            <option
              v-for="session in sessions"
              :key="session.id"
              :value="session.id"
            >
              {{ date(session.startedAt) }} ·
              {{
                session.mode === "standardized"
                  ? "Scenarios"
                  : "Recorded activity"
              }}
              · {{ statusLabel(session.status) }}
            </option>
          </select></label
        >
        <div class="bench-actions">
          <button
            class="bz-btn"
            :disabled="!report || busy || report.id !== selectedId"
            @click="exportReport"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >file_download</span
            >Export JSON</button
          ><button
            class="bz-btn"
            :disabled="!canArchive || busy"
            :title="archiveHint"
            @click="openArchive"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >cloud_upload</span
            >Archive to IPFS
          </button>
        </div>
      </div>
      <template v-if="report">
        <section
          v-if="report.suite"
          class="suite-results"
          aria-label="Standardized results"
        >
          <div class="bench-header">
            <div>
              <h2 class="bz-h2">Standardized results</h2>
              <p>{{ report.suite.version }} · {{ report.suite.phase }}</p>
              <p v-if="report.status === 'recording'">
                {{ report.suite.current }} · {{ report.suite.completed }} /
                {{ report.suite.total }} passes completed
              </p>
            </div>
          </div>
          <div class="comparison-toolbar" role="group" aria-label="Compare benchmarks">
            <label class="comparison-picker">
              <span>Compare with a previous test</span>
              <select :value="localBaselineId" @change="loadLocalBaseline($event.target.value)">
                <option value="">Choose a test on this machine</option>
                <option v-for="session in sessions.filter(s => s.mode === 'standardized' && s.id !== selectedId && s.status !== 'recording')" :key="session.id" :value="session.id">
                  {{ date(session.startedAt) }} · {{ session.suite?.cases?.find(c => c.environment?.model)?.environment?.model || 'Pipeline tests' }}
                </option>
              </select>
            </label>
            <label class="bz-btn baseline-picker">
              <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>Import a report
              <input type="file" accept=".json,application/json" aria-label="Import a benchmark report" @change="loadBaseline" />
            </label>
          </div>
          <div v-if="baseline" class="comparison-selection">
            <span>Comparing with {{ baseline.hardware?.cpu?.brand || 'imported report' }} · {{ date(baseline.startedAt) }}</span>
            <button class="bz-btn bz-btn--ghost" @click="baseline = null; localBaselineId = ''">Clear comparison</button>
          </div>
          <p v-if="baselineError" class="bench-error" role="alert">
            {{ baselineError }}
          </p>
          <p
            v-if="stopRequested && recording"
            class="bench-notice"
            role="status"
          >
            Stopping after the current test finishes. No other generations will
            be cancelled.
          </p>
          <p v-if="report.suite.error" class="bench-error" role="alert">
            {{ report.suite.error }}
          </p>
          <details
            v-for="entry in report.suite.cases"
            :key="entry.id"
            class="scenario-result"
          >
            <summary>
              <span
                ><strong>{{ entry.label }}</strong
                ><small>{{ entry.status }}</small></span
              >
              <span
                ><strong class="bz-metric">{{
                  humanDuration(scenarioSummary(entry).medianMs)
                }}</strong
                ><small
                  >median · {{ scenarioSummary(entry).completed }} measured
                  passes</small
                ></span
              >
            </summary>
            <p v-if="entry.environment?.model">
              <strong>{{ entry.environment.model }}</strong> · MTP
              {{ entry.environment.settings?.mtp ? "enabled" : "disabled" }}
            </p>
            <p v-if="scenarioSummary(entry).tokensPerSecond != null">
              <strong
                >{{
                  scenarioSummary(entry).tokensPerSecond.toFixed(1)
                }}
                tok/s</strong
              >
              · median decoding speed
            </p>
            <p
              v-if="
                entry.group === 'Video' && scenarioSummary(entry).medianMs > 0
              "
            >
              {{
                (
                  (entry.params.num_frames || entry.params.frames) /
                  (scenarioSummary(entry).medianMs / 1000)
                ).toFixed(2)
              }}
              generated frames / second of waiting · {{ entry.params.width }} ×
              {{ entry.params.height }}
            </p>
            <p v-if="entry.reason">{{ entry.reason }}</p>

            <p v-if="baseline">{{ comparisonText(entry) }}</p>
            <p>
              First pass:
              {{
                humanDuration(
                  entry.trials?.find((t) => t.phase === "warmup")?.metrics
                    ?.elapsedMs,
                )
              }}
              · excluded from the median.
            </p>
            <p v-for="(trial, trialIndex) in entry.trials" :key="trialIndex">
              {{
                trial.phase === "warmup"
                  ? "First pass"
                  : "Measured pass " + trial.repetition
              }}
              · {{ trial.status }} ·
              {{ humanDuration(trial.metrics?.elapsedMs) }}
            </p>
            <details class="method-note">
              <summary>Workload and model fingerprints</summary>
              <pre>{{
                JSON.stringify(
                  {
                    settings: entry.params,
                    environment: entry.environment,
                    comparisonKey: entry.comparisonKey,
                  },
                  null,
                  2,
                )
              }}</pre>
            </details>
          </details>
          <p class="privacy-note">{{ report.suite.methodology }}</p>
        </section>
        <div class="bench-metrics">
          <div>
            <span>Pipeline coverage</span
            ><strong class="bz-metric"
              >{{ measuredCount }}<small> / {{ rows.length }}</small></strong
            >
            <div
              class="coverage-track"
              :aria-label="`${measuredCount} of ${rows.length} pipelines observed`"
            >
              <i :style="{ width: `${coveragePercent}%` }"></i>
            </div>
          </div>
          <div>
            <span>Completed requests</span
            ><strong class="bz-metric">{{ completedCount }}</strong
            ><small>{{ report.samples.length }} recorded in this session</small>
          </div>
          <div>
            <span>Needs attention</span
            ><strong
              class="bz-metric"
              :class="{ 'attention-value': attentionCount > 0 }"
              >{{ attentionCount }}</strong
            ><small>Failed or interrupted requests</small>
          </div>
          <div>
            <span>Device snapshot</span
            ><strong class="device-name">{{
              report.hardware?.cpu?.brand || "Hardware recorded"
            }}</strong
            ><small
              >{{ gib(report.hardware?.memory?.totalBytes) }} RAM · BonzAI
              {{ report.appVersion }}</small
            >
          </div>
        </div>
        <nav class="bench-tabs" aria-label="Report sections">
          <button
            v-for="item in ['Pipelines', 'Hardware', 'Samples']"
            :key="item"
            :aria-pressed="tab === item"
            @click="tab = item"
          >
            <span class="material-symbols-outlined" aria-hidden="true">{{
              {
                Pipelines: "account_tree",
                Hardware: "memory",
                Samples: "receipt_long",
              }[item]
            }}</span
            >{{ item
            }}<span v-if="item === 'Samples'" class="tab-count">{{
              report.samples.length
            }}</span>
          </button>
        </nav>
        <div v-if="tab === 'Pipelines'" class="pipeline-workspace">
          <div class="results-heading">
            <div>
              <h2 class="bz-h2">Pipeline performance</h2>
              <p>
                {{
                  measuredCount
                    ? "Open a pipeline to inspect its recorded runs."
                    : "No requests yet. Create something in BonzAI; its timing appears automatically."
                }}
              </p>
            </div>
            <label class="search-field"
              ><span class="material-symbols-outlined" aria-hidden="true"
                >search</span
              ><input
                v-model="search"
                type="search"
                placeholder="Find a pipeline"
                aria-label="Find a pipeline"
            /></label>
          </div>
          <div class="filter-toolbar">
            <div class="family-filters" aria-label="Pipeline categories">
              <button
                v-for="group in ['All', ...groups]"
                :key="group"
                :aria-pressed="category === group"
                @click="category = group"
              >
                {{ group }}
              </button>
            </div>
            <label class="measured-toggle"
              ><input v-model="onlyMeasured" type="checkbox" />Measured
              only</label
            >
          </div>
          <p v-if="!filteredRows.length" class="filter-empty">
            No pipelines match these filters.
            <button class="text-button" @click="resetFilters">
              Clear filters
            </button>
          </p>
          <div v-else class="pipeline-results">
            <div class="pipeline-columns" aria-hidden="true">
              <span>Pipeline</span><span>Requests</span><span>Median time</span
              ><span></span>
            </div>
            <details
              v-for="row in filteredRows"
              :key="row.id"
              class="pipeline-result"
              :class="{ 'is-unmeasured': !row.samples }"
            >
              <summary>
                <div class="pipeline-name">
                  <span
                    class="pipeline-icon material-symbols-outlined"
                    aria-hidden="true"
                    >{{ groupIcon(row.group) }}</span
                  >
                  <div>
                    <strong>{{ row.label }}</strong
                    ><span>{{
                      row.samples
                        ? `${row.completed} completed${row.failed ? ` · ${row.failed} failed` : ""}${row.interrupted ? ` · ${row.interrupted} interrupted` : ""}`
                        : "Not measured yet"
                    }}</span>
                  </div>
                </div>
                <span class="request-count"
                  >{{ row.samples || "—"
                  }}<small class="mobile-label"> requests</small></span
                ><span class="pipeline-time bz-metric">{{
                  humanDuration(row.medianMs)
                }}</span
                ><span
                  class="material-symbols-outlined expand-chevron"
                  aria-hidden="true"
                  >expand_more</span
                >
              </summary>
              <div class="pipeline-detail">
                <template v-if="row.samples"
                  ><div class="detail-heading">
                    <span
                      >P95 latency:
                      <strong>{{ humanDuration(row.p95Ms) }}</strong
                      ><small v-if="row.p95Ms === null"
                        >20 successful timed samples required</small
                      ></span
                    ><button class="text-button" @click="showSamples(row.id)">
                      Inspect requests
                      <span class="material-symbols-outlined" aria-hidden="true"
                        >arrow_forward</span
                      >
                    </button>
                  </div>
                  <p>
                    Median time includes completed requests only. Compare runs
                    with the same model, settings and workload.
                  </p>
                  <div
                    v-for="sample in pipelineSamples(row.id)
                      .slice(-3)
                      .reverse()"
                    :key="sample.id"
                    class="recent-sample"
                  >
                    <span>{{ sample.model || "Model not reported" }}</span
                    ><span class="status-label" :data-status="sample.status">{{
                      statusLabel(sample.status)
                    }}</span
                    ><strong>{{
                      humanDuration(sample.metrics?.elapsedMs)
                    }}</strong>
                  </div></template
                ><template v-else
                  ><p>
                    {{
                      recording
                        ? "Run this pipeline in its generation view. Its next local request will appear here automatically."
                        : "Run this pipeline in BonzAI. Its timing is recorded automatically."
                    }}
                  </p>
                  <button
                    v-if="destination(row.group)"
                    class="bz-btn"
                    @click="openGeneration(row.group)"
                  >
                    Open {{ destinationLabel(row.group)
                    }}<span class="material-symbols-outlined" aria-hidden="true"
                      >arrow_forward</span
                    >
                  </button></template
                >
              </div>
            </details>
          </div>
          <details class="method-note">
            <summary>
              <span class="material-symbols-outlined" aria-hidden="true"
                >info</span
              >How to read these results
            </summary>
            <p>
              These are real workloads, not a synthetic score. Different
              prompts, models and settings are not directly comparable. Timings
              measure speed, not creative quality. Loading state is not
              inferred. Full 3D runs include their LLM calls: do not add their
              times together.
            </p>
          </details>
        </div>
        <div v-else-if="tab === 'Hardware'" class="hardware">
          <div class="results-heading">
            <div>
              <h2 class="bz-h2">Your machine, at a glance</h2>
              <p>Captured at session start · {{ date(report.startedAt) }}</p>
            </div>
            <span class="privacy-note"
              ><span class="material-symbols-outlined" aria-hidden="true"
                >shield</span
              >No device identifiers</span
            >
          </div>
          <dl class="hardware-grid">
            <div>
              <dt>
                <span class="material-symbols-outlined" aria-hidden="true"
                  >memory</span
                >Processor
              </dt>
              <dd>{{ report.hardware?.cpu?.brand || "Unavailable" }}</dd>
              <p>
                {{ report.hardware?.cpu?.physicalCores ?? "—" }} physical ·
                {{ report.hardware?.cpu?.logicalCores ?? "—" }} logical cores
              </p>
              <small v-if="report.hardware?.cpu?.speedGHz"
                >{{ report.hardware.cpu.speedGHz }} GHz</small
              >
            </div>
            <div>
              <dt>
                <span class="material-symbols-outlined" aria-hidden="true"
                  >developer_board</span
                >Graphics
              </dt>
              <template v-for="(gpu, i) in report.hardware?.gpus" :key="i"
                ><dd>{{ gpu.model }}</dd>
                <p>
                  {{
                    gpu.vramMB
                      ? `${gpu.vramMB} MB VRAM`
                      : "Shared or unavailable VRAM"
                  }}
                </p></template
              >
              <dd v-if="!report.hardware?.gpus?.length">Unavailable</dd>
            </div>
            <div>
              <dt>
                <span class="material-symbols-outlined" aria-hidden="true"
                  >storage</span
                >Memory
              </dt>
              <dd class="bz-metric">
                {{ gib(report.hardware?.memory?.totalBytes) }}
              </dd>
              <p>
                {{ gib(report.hardware?.memory?.availableBytes) }} available
              </p>
              <small
                >{{ gib(report.hardware?.memory?.swapUsedBytes) }} swap
                used</small
              >
            </div>
            <div>
              <dt>
                <span class="material-symbols-outlined" aria-hidden="true"
                  >desktop_windows</span
                >System
              </dt>
              <dd>
                {{
                  report.hardware?.os?.distro ||
                  report.hardware?.os?.platform ||
                  "Unavailable"
                }}
              </dd>
              <p>
                {{ report.hardware?.os?.release }} ·
                {{ report.hardware?.os?.arch }}
              </p>
              <small>BonzAI {{ report.appVersion }}</small>
            </div>
          </dl>
          <details class="method-note">
            <summary>Complete hardware and runtime report</summary>
            <p>
              Includes detected storage, driver and runtime versions. Missing
              fields mean unavailable, not zero.
            </p>
            <pre>{{ JSON.stringify(report.hardware, null, 2) }}</pre>
          </details>
        </div>
        <div v-else class="samples">
          <div class="results-heading">
            <div>
              <h2 class="bz-h2">Request history</h2>
              <p>Inspect timing, settings and the outcome of each run.</p>
            </div>
            <label class="sample-filter"
              >Pipeline<select v-model="samplePipeline">
                <option value="">All pipelines</option>
                <option
                  v-for="row in rows.filter((r) => r.samples)"
                  :key="row.id"
                  :value="row.id"
                >
                  {{ row.label }}
                </option>
              </select></label
            >
          </div>
          <div v-if="!visibleSamples.length" class="bench-empty compact">
            <span class="material-symbols-outlined" aria-hidden="true"
              >receipt_long</span
            >
            <h3>No requests recorded</h3>
            <p>Generate something in BonzAI to see its timing here.</p>
          </div>
          <details
            v-for="sample in visibleSamples.slice(0, sampleLimit)"
            :key="sample.id"
            class="sample-result"
          >
            <summary>
              <div>
                <strong>{{ label(sample.pipeline) }}</strong
                ><small
                  >{{ sample.model || "Model not reported" }} ·
                  {{
                    sample.startedAt
                      ? date(sample.startedAt)
                      : "Time unavailable"
                  }}</small
                >
              </div>
              <span class="status-label" :data-status="sample.status">{{
                statusLabel(sample.status)
              }}</span
              ><strong class="bz-metric">{{
                humanDuration(sample.metrics?.elapsedMs)
              }}</strong
              ><span
                class="material-symbols-outlined expand-chevron"
                aria-hidden="true"
                >expand_more</span
              >
            </summary>
            <div class="sample-body">
              <dl class="sample-metrics">
                <div
                  v-for="metric in sampleMetrics(sample)"
                  :key="metric.label"
                >
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                </div>
              </dl>
              <p>
                {{
                  sample.source === "distributed"
                    ? "Distributed execution — not a local-only hardware measurement."
                    : "Local execution"
                }}
                · Output quality not assessed
              </p>
              <details class="method-note">
                <summary>Raw measurement data</summary>
                <pre>{{ JSON.stringify(sample, null, 2) }}</pre>
              </details>
            </div>
          </details>
          <button
            v-if="visibleSamples.length > sampleLimit"
            class="bz-btn load-more"
            @click="sampleLimit += 50"
          >
            Show more requests
          </button>
        </div>
        <p
          v-if="
            report.samples.some((s) => s.status === 'running') &&
            report.status !== 'recording'
          "
          class="bench-notice"
          role="status"
        >
          Existing requests are finishing. You can archive this session once
          they complete.
        </p>
        <footer class="report-footer">
          <span
            ><span class="material-symbols-outlined" aria-hidden="true"
              >lock</span
            >Stored on your device</span
          ><a
            v-for="archive in report.archives"
            :key="archive.url"
            :href="`https://gateway.pinata.cloud/ipfs/${archive.url.slice(7)}`"
            target="_blank"
            rel="noopener noreferrer"
            >View archived report<span
              class="material-symbols-outlined"
              aria-hidden="true"
              >open_in_new</span
            ></a
          >
        </footer>
      </template>
    </template>
    <dialog
      ref="setupDialog"
      aria-labelledby="setup-title"
      @cancel="busy && $event.preventDefault()"
    >
      <h2 id="setup-title" class="bz-h2">Choose benchmark tests</h2>
      <p>
        How fast can this machine generate, analyse and write? Select
        categories, then the exact scenarios to run. Each uses a fixed workload,
        one first pass and two timed passes. Everyday inference is always
        recorded separately.
      </p>
      <div class="bench-actions">
        <button
          class="bz-btn"
          :disabled="busy"
          @click="selectedCategories = [...groups]"
        >
          Select all
        </button>
        <button
          class="bz-btn"
          :disabled="busy"
          @click="selectedCategories = []"
        >
          Clear categories
        </button>
      </div>
      <div class="category-choices">
        <label
          v-for="group in groups"
          :key="group"
          :class="{ selected: selectedCategories.includes(group) }"
        >
          <input
            type="checkbox"
            v-model="selectedCategories"
            :value="group"
            :disabled="busy"
          />
          <span class="material-symbols-outlined" aria-hidden="true">{{
            groupIcon(group)
          }}</span>
          <span
            ><strong>{{ group }}</strong
            ><small>{{ categoryDescription(group) }}</small></span
          >
        </label>
      </div>
      <template v-if="setupMode === 'standardized'">
        <div
          v-for="group in selectedCategories"
          :key="group"
          class="scenario-result"
        >
          <h3>{{ group }}</h3>
          <label
            v-for="item in scenarios.filter((s) => s.group === group)"
            :key="item.id"
            class="scenario-choice"
          >
            <input
              type="checkbox"
              v-model="selectedScenarioIds"
              :value="item.id"
              :disabled="busy"
            />
            <span
              ><strong>{{ item.label }}</strong
              ><small>{{
                item.detail || scenarioDescription(item)
              }}</small></span
            >
          </label>
        </div>
        <p>
          {{ selectedScenarios.length }} selected scenarios ·
          {{ selectedScenarios.length * 3 }} passes
        </p>
        <label v-if="selectedScenarios.some((s) => s.license)" class="consent"
          ><input type="checkbox" v-model="h3LicenseAccepted" /> Include H3: I
          accept the
          <a
            href="https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            >H3 model terms</a
          >.
        </label>
        <p class="privacy-note">
          To compare Qwen standard and MTP, load each configuration in turn, run
          the same Text scenarios, then compare the saved runs. No automatic
          model downloads. Uses your loaded local LLM for Text and 3D; other
          scenarios use their installed pipeline models. Model hashing may take
          a few minutes. Generated media stays local. Stop lets the current test
          finish.
        </p>
      </template>

      <p v-if="error" class="bench-error" role="alert">{{ error }}</p>
      <div class="bench-actions">
        <button class="bz-btn" :disabled="busy" @click="setupDialog.close()">
          Cancel
        </button>
        <button
          class="bz-btn bz-btn--primary"
          :disabled="busy || !selectedScenarios.length"
          @click="start"
        >
          {{
            busy
              ? "Starting…"
              : setupMode === "standardized"
                ? "Run selected scenarios"
                : "Run selected scenarios"
          }}
        </button>
      </div>
    </dialog>
    <dialog
      ref="archiveDialog"
      aria-labelledby="archive-title"
      @cancel="publishing && $event.preventDefault()"
      @close="publishConsent = false"
    >
      <div class="archive-icon material-symbols-outlined" aria-hidden="true">
        cloud_upload
      </div>
      <h2 id="archive-title" class="bz-h2">Publish this report to IPFS?</h2>
      <p>
        Your hardware, model names, settings and measurements will become
        public. Your prompts and generated media are excluded; standardized
        reports include the built-in test prompts.
      </p>
      <div class="archive-facts">
        <span>{{ publicReport?.samples.length || 0 }} requests</span
        ><span>{{ publicReport ? date(publicReport.startedAt) : "" }}</span>
      </div>
      <p class="archive-retention">
        Pinata hosts the report on IPFS. Maintain pinning for long-term access;
        IPFS does not guarantee permanent storage.
      </p>
      <details class="method-note">
        <summary>Review the exact public report</summary>
        <pre>{{ JSON.stringify(publicReport, null, 2) }}</pre>
      </details>
      <label class="consent"
        ><input
          v-model="publishConsent"
          type="checkbox"
          :disabled="publishing"
        />I agree to publish this hardware and performance report.</label
      >
      <p v-if="publishError" role="alert" class="bench-error">
        {{ publishError }}
      </p>
      <div class="bench-actions">
        <button
          class="bz-btn"
          :disabled="publishing"
          @click="archiveDialog.close()"
        >
          Cancel</button
        ><button
          class="bz-btn bz-btn--primary"
          :disabled="!publishConsent || publishing"
          @click="publish"
        >
          {{ publishing ? "Uploading…" : "Publish report" }}
        </button>
      </div>
    </dialog>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import catalog from "../shared/performanceCatalog.json";
import { scenarios } from "../shared/benchmark/scenarios.js";
import {
  scenarioSummary,
  compareScenario,
  parseBaseline,
} from "../shared/benchmark/comparison.js";
import {
  humanDuration,
  summarizePipeline,
} from "../shared/performanceReport.js";
import { uploadJSON } from "../services/storage.service.js";
import { reportOperation } from "../stores/activityStore.js";
const loading = ref(true),
  search = ref(""),
  category = ref("All"),
  onlyMeasured = ref(false),
  samplePipeline = ref(""),
  sampleLimit = ref(50);
const groups = [...new Set(catalog.map((p) => p.group))];
const setupDialog = ref(null);
const setupMode = ref("standardized"),
  h3LicenseAccepted = ref(false),
  stopRequested = ref(false);
const localBaselineId = ref("");
const baseline = ref(null),
  baselineError = ref("");
const selectedScenarios = computed(() =>
  scenarios.filter(
    (s) =>
      selectedCategories.value.includes(s.group) &&
      selectedScenarioIds.value.includes(s.id),
  ),
);
function categoryDescription(group) {
  const count = (
    setupMode.value === "standardized" ? scenarios : catalog
  ).filter((p) => p.group === group).length;
  return (
    count +
    " " +
    (setupMode.value === "standardized" ? "scenario" : "pipeline") +
    (count === 1 ? "" : "s") +
    (group === "Video" ? " · Long-running generations" : "")
  );
}
function openSetup(mode) {
  setupMode.value = mode;
  error.value = "";
  setupDialog.value.showModal();
}
async function loadLocalBaseline(id) {
  baselineError.value = "";
  try {
    baseline.value = id ? await api.report(id) : null;
    localBaselineId.value = id;
  } catch {
    baselineError.value = "This saved run could not be loaded.";
  }
}
async function loadBaseline(event) {
  baselineError.value = "";
  const file = event.target.files?.[0];
  try {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Report must be smaller than 10 MiB.");
    baseline.value = parseBaseline(await file.text());
    localBaselineId.value = "";
  } catch (e) {
    baseline.value = null;
    baselineError.value = e.message;
  } finally {
    event.target.value = "";
  }
}
function comparisonText(entry) {
  const other = baseline.value?.suite?.cases?.find((c) => c.id === entry.id);
  if (
    other &&
    other.recipeHash === entry.recipeHash &&
    other.status === "completed" &&
    entry.status === "completed" &&
    other.comparisonKey !== entry.comparisonKey
  ) {
    const previous = scenarioSummary(other),
      current = scenarioSummary(entry);
    return `Same workload, different configuration: ${other.environment?.model || "Previous model"} (${other.environment?.settings?.mtp ? "MTP" : "standard"}) ${previous.tokensPerSecond?.toFixed(1) || "—"} tok/s / ${humanDuration(previous.medianMs)} → ${entry.environment?.model || "Current model"} (${entry.environment?.settings?.mtp ? "MTP" : "standard"}) ${current.tokensPerSecond?.toFixed(1) || "—"} tok/s / ${humanDuration(current.medianMs)}. Model, runtime and settings differences may contribute; this is not a hardware-only comparison.`;
  }
  const comparison = compareScenario(entry, baseline.value);
  if (!comparison.comparable) return "Not comparable: " + comparison.reason;
  return (
    "Other machine: " +
    humanDuration(comparison.baselineMs) +
    " · This machine: " +
    comparison.ratio.toFixed(2) +
    "× relative speed (higher is faster)."
  );
}
const selectedCategories = ref([...groups]);
const selectedScenarioIds = ref(scenarios.map((s) => s.id));
function scenarioDescription(item) {
  if (item.kind === "video")
    return `${item.params.width} × ${item.params.height} · ${item.params.frames || item.params.num_frames} frames · generation time and output speed`;
  if (item.group === "Text")
    return "Loaded local model · tokens per second and total response time";
  return "Fixed input and settings · completion time";
}
const api = window.electronAPI?.performanceBenchmark;
const sessions = ref([]),
  selectedId = ref(""),
  report = ref(null),
  error = ref(""),
  busy = ref(false),
  tab = ref("Pipelines");
const archiveDialog = ref(null),
  publicReport = ref(null),
  publishConsent = ref(false),
  publishing = ref(false),
  publishError = ref("");
let timer,
  disposed = false,
  refreshPending = false;
const recording = computed(() =>
  sessions.value.find(
    (s) => s.status === "recording" && s.mode === "standardized",
  ),
);
const canArchive = computed(
  () =>
    report.value &&
    report.value.id === selectedId.value &&
    report.value.status !== "recording" &&
    !report.value.samples.some((s) => s.status === "running"),
);
const gib = (value) =>
  Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(1)} GiB` : "—";
const date = (value) => new Date(value).toLocaleString();
const label = (id) => catalog.find((p) => p.id === id)?.label || id;
const rows = computed(() => {
  const items = catalog.filter((p) =>
    report.value?.suite
      ? report.value.suite.cases.some((c) => c.pipeline === p.id)
      : !report.value?.pipelines || report.value.pipelines.includes(p.id),
  );
  for (const sample of report.value?.samples || [])
    if (!items.some((p) => p.id === sample.pipeline))
      items.push({ id: sample.pipeline, label: sample.pipeline });
  return items.map((p) => ({
    ...p,
    ...summarizePipeline(
      report.value?.samples.filter((s) => s.pipeline === p.id) || [],
    ),
  }));
});
const coveragePercent = computed(() =>
  rows.value.length ? (measuredCount.value / rows.value.length) * 100 : 0,
);
const completedCount = computed(
  () =>
    report.value?.samples.filter((s) => s.status === "completed").length || 0,
);
const attentionCount = computed(
  () =>
    report.value?.samples.filter((s) =>
      ["failed", "interrupted"].includes(s.status),
    ).length || 0,
);
const filteredRows = computed(() =>
  rows.value
    .filter(
      (row) =>
        (category.value === "All" || row.group === category.value) &&
        (!onlyMeasured.value || row.samples > 0) &&
        row.label.toLowerCase().includes(search.value.trim().toLowerCase()),
    )
    .sort((a, b) => Number(b.samples > 0) - Number(a.samples > 0)),
);
const visibleSamples = computed(() =>
  [...(report.value?.samples || [])]
    .filter((s) => !samplePipeline.value || s.pipeline === samplePipeline.value)
    .reverse(),
);
const archiveHint = computed(() =>
  report.value?.status === "recording"
    ? "Save a report snapshot before archiving live activity"
    : report.value?.samples.some((s) => s.status === "running")
      ? "Wait for active requests to finish"
      : "Review and publish this report",
);
const groupIcon = (group) =>
  ({
    Text: "chat",
    Image: "image",
    Audio: "graphic_eq",
    Video: "movie",
    "3D": "deployed_code",
    Analysis: "document_search",
  })[group] || "account_tree";
const statusLabel = (status) =>
  ({
    recording: "Recording",
    stopped: "Saved",
    completed: "Completed",
    failed: "Failed",
    running: "Running",
    interrupted: "Interrupted",
    cancelled: "Cancelled",
    accepted: "Accepted",
  })[status] || status;
const destination = (group) =>
  ({
    Text: "chat",
    Image: "image",
    Audio: "music",
    Video: "video",
    "3D": "game",
  })[group];
const destinationLabel = (group) =>
  ({
    Text: "Chat",
    Image: "Images",
    Audio: "Audio",
    Video: "Video",
    "3D": "3D",
  })[group];
const openGeneration = (group) =>
  window.dispatchEvent(
    new CustomEvent("bonzai:set-mode", { detail: destination(group) }),
  );
function resetFilters() {
  search.value = "";
  category.value = "All";
  onlyMeasured.value = false;
}
function pipelineSamples(id) {
  return report.value?.samples.filter((s) => s.pipeline === id) || [];
}
function showSamples(id) {
  samplePipeline.value = id;
  sampleLimit.value = 50;
  tab.value = "Samples";
}
async function selectSession(id) {
  selectedId.value = id;
  samplePipeline.value = "";
  await loadReport();
}
function sampleMetrics(sample) {
  const m = sample.metrics || {};
  return [
    { label: "Total time", value: humanDuration(m.elapsedMs) },
    { label: "Queue", value: humanDuration(m.queueMs) },
    { label: "Execution", value: humanDuration(m.executionMs) },
    { label: "First token", value: humanDuration(m.firstTokenMs) },
    { label: "Output tokens", value: m.tokenCount ?? "—" },
    {
      label: "Tokens / second",
      value: Number.isFinite(m.tokensPerSecond)
        ? m.tokensPerSecond.toFixed(1)
        : "—",
    },
  ];
}
async function retry() {
  error.value = "";
  clearTimeout(timer);
  await refresh();
}
const measuredCount = computed(
  () => rows.value.filter((r) => r.samples > 0).length,
);
async function loadReport() {
  const id = selectedId.value;
  if (!id) {
    report.value = null;
    return;
  }
  try {
    const value = await api.report(id);
    if (selectedId.value === id) {
      report.value = value;
      return value;
    }
  } catch (e) {
    error.value = e.message;
  }
}
async function refresh() {
  if (!api) {
    loading.value = false;
    return;
  }
  if (refreshPending) return;
  refreshPending = true;
  try {
    sessions.value = await api.list();
    if (!selectedId.value) selectedId.value = sessions.value[0]?.id || "";
    await loadReport();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
    refreshPending = false;
    if (!disposed) timer = setTimeout(refresh, 2500);
  }
}
async function action(fn) {
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function saveSnapshot() {
  await action(async () => {
    const saved = await api.snapshot(selectedId.value);
    sessions.value = await api.list();
    selectedId.value = saved.id;
    await loadReport();
  });
}
async function start() {
  await action(async () => {
    const options = {
      categories: [...selectedCategories.value],
      scenarioIds: selectedScenarios.value.map((s) => s.id),
      h3LicenseAccepted: h3LicenseAccepted.value,
    };
    const session = await api.run(options);
    stopRequested.value = false;
    setupDialog.value.close();
    category.value = "All";
    selectedId.value = session.id;
    sessions.value = await api.list();
    await loadReport();
    reportOperation({
      id: `benchmark:${session.id}`,
      source: "benchmark",
      mode: "benchmark",
      title: "Performance measurement",
      stage:
        setupMode.value === "standardized"
          ? "Preparing scenarios"
          : "Recording local inference",
      status: "running",
      location: "On this device",
    });
  });
}
async function stop() {
  await action(async () => {
    const id = recording.value?.id;
    await api.stop();
    stopRequested.value = recording.value?.mode === "standardized";
    sessions.value = await api.list();
    await loadReport();
    reportOperation({
      id: `benchmark:${id}`,
      source: "benchmark",
      mode: "benchmark",
      title: "Performance measurement",
      stage: stopRequested.value
        ? "Stopping after current test"
        : "Report saved locally",
      status: stopRequested.value ? "running" : "completed",
    });
  });
}
async function exportReport() {
  await action(() => api.export(selectedId.value));
}
async function openArchive() {
  const fresh = await loadReport();
  if (!fresh || !canArchive.value) return;
  publicReport.value = JSON.parse(
    JSON.stringify({ ...report.value, archives: [] }),
  );
  publishConsent.value = false;
  publishError.value = "";
  archiveDialog.value.showModal();
}
async function publish() {
  if (!publishConsent.value || publishing.value) return;
  publishing.value = true;
  try {
    const receipt = await uploadJSON(publicReport.value, {
      type: "performance-benchmark",
    });
    await api.archive(publicReport.value.id, receipt);
    archiveDialog.value.close();
    await loadReport();
  } catch (e) {
    publishError.value = e.message;
  } finally {
    publishing.value = false;
  }
}
onMounted(refresh);
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>
<style scoped>
.suite-results {
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--bz-border);
  margin-bottom: 1.5rem;
}
.scenario-result {
  border-bottom: 1px solid var(--bz-border);
  padding: 1rem 0;
}
.scenario-result > summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
}
.scenario-result small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 0.3rem;
}
.scenario-result p {
  color: var(--bz-fg-mid);
}
.comparison-toolbar { display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap; padding:20px 0; border-block:1px solid var(--bz-border); margin-bottom:20px; }
.comparison-picker { display:grid; gap:8px; flex:1 1 280px; max-width:560px; min-width:0; color:var(--bz-fg-mid); font-size:13px; }
.comparison-picker select { width:100%; min-width:0; height:42px; padding:0 36px 0 12px; border:1px solid var(--bz-border-strong); border-radius:var(--bz-r); background:var(--bz-panel); color:var(--bz-fg); font:inherit; text-overflow:ellipsis; }
.comparison-selection { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px; font-size:13px; color:var(--bz-fg-mid); }
.comparison-selection > span { min-width:0; overflow-wrap:anywhere; }
@media(max-width:600px) { .comparison-picker { flex-basis:100%; max-width:none; } }
.baseline-picker {
  position: relative;
  cursor: pointer;
}
.baseline-picker input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.baseline-picker:focus-within {
  outline: 2px solid var(--bz-accent);
}

.category-choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin: 1.25rem 0;
}
.category-choices label {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  padding: 0.8rem 1rem;
  cursor: pointer;
}
.category-choices label.selected {
  border-color: var(--bz-accent);
}
.category-choices small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 0.2rem;
}
.category-choices input {
  accent-color: var(--bz-accent);
}

.benchmark-view {
  background: var(--bz-canvas);
  color: var(--bz-fg);
  padding: clamp(20px, 3vw, 40px);
  height: 100%;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
}
.bench-header,
.bench-heading,
.bench-actions,
.session-toolbar,
.results-heading,
.filter-toolbar,
.report-footer,
.detail-heading {
  display: flex;
  align-items: center;
  gap: 16px;
}
.bench-header,
.session-toolbar,
.results-heading,
.filter-toolbar,
.detail-heading {
  justify-content: space-between;
  flex-wrap: wrap;
}
.bench-header {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--bz-border);
}
.bench-heading {
  min-width: 0;
}
.bench-title-icon,
.pipeline-icon {
  display: grid;
  place-items: center;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  flex-shrink: 0;
  color: var(--bz-accent);
}
.bench-title-icon {
  width: 48px;
  height: 48px;
  font-size: 26px;
}
h1.bz-h1 {
  font-size: 30px;
  margin: 0;
}
h2.bz-h2 {
  font-size: 24px;
  margin: 0;
}
p {
  margin: 6px 0 0;
  line-height: 1.6;
}
.bench-heading p,
.results-heading p,
.pipeline-name span:not(.material-symbols-outlined),
small,
.bench-metrics > div > span,
.hardware-grid dt,
.hardware-grid p,
.report-footer,
.method-note,
.privacy-note,
.sample-body > p {
  color: var(--bz-fg-mid);
}
.bench-heading p {
  font-size: 14px;
}
.bz-btn {
  min-height: 40px;
  height: auto;
  white-space: normal;
}
.bz-btn:not(.bz-btn--primary) {
  color: var(--bz-fg);
}
.bench-actions {
  flex-wrap: wrap;
}
.bench-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 0;
}
.bench-error {
  color: var(--bz-danger);
}
.recording-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  background: var(--bz-panel);
  margin-top: 24px;
}
.recording-strip > div {
  flex: 1;
}
.recording-strip p {
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.recording-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bz-success);
  flex-shrink: 0;
}
.live-label {
  color: var(--bz-success);
  font-size: 13px;
}
.session-toolbar {
  padding: 24px 0;
}
.session-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-size: 13px;
}
select,
input[type="search"] {
  font: inherit;
  color: var(--bz-fg);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  padding: 11px 12px;
  min-width: 0;
  max-width: 100%;
}
.session-picker select {
  width: 310px;
}
.bench-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.35fr);
  border-block: 1px solid var(--bz-border);
  padding: 24px 0;
  margin-bottom: 28px;
}
.bench-metrics > div {
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-right: 1px solid var(--bz-border);
  min-width: 0;
}
.bench-metrics > div:first-child {
  padding-left: 0;
}
.bench-metrics > div:last-child {
  border: 0;
  padding-right: 0;
}
.bench-metrics > div > span {
  font-size: 13px;
}
.bench-metrics .bz-metric {
  font-size: 36px;
  line-height: 1.2;
}
.bench-metrics .bz-metric small {
  font-size: 20px;
}
.device-name {
  font-size: 17px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.attention-value {
  color: var(--bz-warning);
}
.coverage-track {
  height: 4px;
  background: var(--bz-raised);
  border-radius: 4px;
  max-width: 180px;
  margin-top: 5px;
  overflow: hidden;
}
.coverage-track i {
  display: block;
  height: 100%;
  background: var(--bz-accent);
}
.bench-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid var(--bz-border);
  margin-bottom: 28px;
}
.bench-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  color: var(--bz-fg-mid);
  padding: 0 0 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
}
.bench-tabs button[aria-pressed="true"] {
  color: var(--bz-fg);
  border-bottom-color: var(--bz-accent);
}
.bench-tabs .material-symbols-outlined {
  font-size: 19px;
}
.tab-count {
  font-size: 12px;
  background: var(--bz-panel);
  padding: 1px 6px;
  border-radius: 4px;
}
.results-heading {
  margin-bottom: 22px;
}
.results-heading p {
  font-size: 14px;
}
.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  padding: 0 12px;
  color: var(--bz-fg-mid);
  max-width: 100%;
}
.search-field input {
  border: 0;
  background: transparent;
  padding-left: 0;
  width: 210px;
}
.filter-toolbar {
  margin-bottom: 18px;
  gap: 12px;
}
.family-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.family-filters button {
  padding: 7px 12px;
  background: transparent;
  color: var(--bz-fg-mid);
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.family-filters button[aria-pressed="true"] {
  background: var(--bz-panel);
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}
.measured-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  white-space: nowrap;
}
input[type="checkbox"] {
  accent-color: var(--bz-accent);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.pipeline-columns,
.pipeline-result > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px 150px 24px;
  align-items: center;
  gap: 20px;
}
.pipeline-columns {
  color: var(--bz-fg-mid);
  font-size: 12px;
  padding: 0 16px 12px;
}
.pipeline-columns > span:nth-child(2),
.pipeline-columns > span:nth-child(3) {
  text-align: right;
}
.pipeline-result {
  border-top: 1px solid var(--bz-border);
}
.pipeline-result > summary {
  padding: 16px;
  border-radius: var(--bz-r-sm);
}
.pipeline-result > summary:hover,
.sample-result > summary:hover {
  background: var(--bz-panel);
}
.pipeline-name {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.pipeline-name > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pipeline-name strong {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.pipeline-name > div > span {
  font-size: 12px;
}
.pipeline-icon {
  width: 36px;
  height: 36px;
  font-size: 20px;
}
.is-unmeasured .pipeline-icon {
  background: transparent;
  color: var(--bz-fg-mid);
}
.request-count,
.pipeline-time {
  text-align: right;
}
.request-count {
  font-size: 14px;
}
.pipeline-time {
  font-size: 22px;
}
.is-unmeasured .pipeline-time {
  color: var(--bz-fg-mid);
}
.expand-chevron {
  color: var(--bz-fg-mid);
  font-size: 20px;
  transition: transform 0.15s ease;
}
details[open] > summary > .expand-chevron {
  transform: rotate(180deg);
}
.mobile-label {
  display: none;
}
summary {
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
.pipeline-detail {
  background: var(--bz-panel);
  border-radius: var(--bz-r-sm);
  padding: 20px;
  margin: 0 16px 16px 66px;
  font-size: 13px;
}
.pipeline-detail p {
  color: var(--bz-fg-mid);
  margin-bottom: 12px;
}
.detail-heading small {
  display: block;
  margin-top: 4px;
}
.text-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--bz-fg);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 8px 0;
  font: inherit;
}
.text-button .material-symbols-outlined {
  font-size: 18px;
}
.recent-sample {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--bz-border);
}
.recent-sample > span:first-child {
  overflow-wrap: anywhere;
}
.method-note {
  padding: 18px 0;
  font-size: 13px;
  border-top: 1px solid var(--bz-border);
  margin-top: 16px;
}
.method-note > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bz-fg-mid);
}
.method-note > summary::after {
  content: "+";
  margin-left: auto;
  font-size: 18px;
}
.method-note[open] > summary::after {
  content: "−";
}
.method-note .material-symbols-outlined {
  font-size: 18px;
}
.method-note p {
  max-width: 900px;
}
.hardware-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0 0 24px;
}
.hardware-grid > div {
  padding: 24px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
}
.hardware-grid dt {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  font-size: 13px;
}
.hardware-grid dt .material-symbols-outlined {
  color: var(--bz-accent);
  font-size: 22px;
}
.hardware-grid dd {
  font-size: 22px;
  margin: 0;
  overflow-wrap: anywhere;
}
.hardware-grid p {
  font-size: 14px;
}
.hardware-grid dd.bz-metric {
  font-size: 32px;
}
.sample-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  min-width: 0;
}
.sample-result {
  border-top: 1px solid var(--bz-border);
}
.sample-result > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px 110px 24px;
  gap: 16px;
  padding: 18px 12px;
  align-items: center;
}
.sample-result summary small {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
}
.sample-result summary strong {
  font-weight: 500;
  font-size: 14px;
}
.sample-result summary strong.bz-metric {
  font-size: 22px;
  text-align: right;
}
.sample-body {
  padding: 8px 12px 20px;
}
.sample-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  padding: 16px 0;
}
.sample-metrics dt {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.sample-metrics dd {
  margin: 6px 0 0;
  font-size: 18px;
}
.status-label {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.status-label[data-status="failed"],
.status-label[data-status="interrupted"] {
  color: var(--bz-warning);
}
.status-label[data-status="completed"] {
  color: var(--bz-success);
}
.status-label[data-status="running"] {
  color: var(--bz-accent);
}
.report-footer {
  justify-content: space-between;
  flex-wrap: wrap;
  font-size: 12px;
  padding-top: 24px;
  border-top: 1px solid var(--bz-border);
  margin-top: 24px;
}
.report-footer > span,
.report-footer a,
.privacy-note {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.report-footer .material-symbols-outlined,
.privacy-note .material-symbols-outlined {
  font-size: 16px;
}
.report-footer a {
  color: var(--bz-fg);
}
.load-more {
  margin-top: 20px;
}
.welcome {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(24px, 5vw, 80px);
  padding: 56px 0;
  border-bottom: 1px solid var(--bz-border);
}
.welcome-copy {
  align-self: center;
}
.bench-eyebrow {
  color: var(--bz-fg-mid);
  font-size: 11px;
  margin: 0 0 16px;
}
.welcome h2 {
  font-size: 32px;
}
.welcome-copy > p:not(.bench-eyebrow) {
  max-width: 420px;
  color: var(--bz-fg-mid);
  margin: 16px 0 24px;
}
.privacy-note {
  font-size: 12px;
}
.welcome-steps {
  padding: 0;
  margin: 0;
  list-style: none;
}
.welcome-steps li {
  display: flex;
  gap: 20px;
  padding: 20px 0;
  border-bottom: 1px solid var(--bz-border);
}
.welcome-steps li:last-child {
  border: 0;
}
.step-number {
  font-size: 28px;
  color: var(--bz-accent);
}
.welcome-steps strong {
  font-size: 15px;
  font-weight: 500;
}
.welcome-steps p {
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.coverage-preview {
  padding-top: 32px;
}
.family-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.family-grid > div {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 0;
}
.family-grid .material-symbols-outlined {
  color: var(--bz-accent);
  font-size: 24px;
}
.family-grid strong {
  font-size: 14px;
  font-weight: 500;
}
.family-grid > div > span:last-child {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.bench-empty,
.filter-empty {
  text-align: center;
  padding: 48px 20px;
}
.bench-empty > .material-symbols-outlined {
  font-size: 32px;
  color: var(--bz-fg-mid);
  margin-bottom: 12px;
}
.bench-empty p {
  color: var(--bz-fg-mid);
}
.compact {
  padding: 32px 16px;
}
pre {
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: 12px/1.6 var(--bz-font-mono);
  padding: 16px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 45vh;
  overflow: auto;
  margin-top: 16px;
}
dialog {
  background: var(--bz-card);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: 28px;
  width: min(600px, calc(100vw - 32px));
  max-height: 85vh;
  overflow: auto;
}
dialog::backdrop {
  background: var(--bz-overlay);
}
.archive-icon {
  color: var(--bz-accent);
  font-size: 30px;
  margin-bottom: 16px;
}
dialog p {
  font-size: 14px;
  color: var(--bz-fg-mid);
}
.archive-facts {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 20px 0;
  font-size: 13px;
}
.archive-retention {
  padding: 16px 0;
  border-block: 1px solid var(--bz-border);
}
.consent {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 24px 0;
  font-size: 14px;
}
dialog .bench-actions {
  justify-content: flex-end;
}
button:focus-visible,
summary:focus-visible,
input:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (max-width: 900px) {
  .bench-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px 0;
  }
  .bench-metrics > div:nth-child(2) {
    border: 0;
  }
  .bench-metrics > div:nth-child(3) {
    padding-left: 0;
  }
  .family-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .welcome {
    gap: 32px;
  }
  .pipeline-columns,
  .pipeline-result > summary {
    grid-template-columns: minmax(0, 1fr) 60px 100px 20px;
    gap: 12px;
  }
}
@media (max-width: 600px) {
  .bench-heading {
    align-items: flex-start;
  }
  .bench-title-icon {
    width: 40px;
    height: 40px;
  }
  h1.bz-h1 {
    font-size: 25px;
  }
  .bench-header > .bz-btn {
    margin-left: 56px;
  }
  .welcome {
    grid-template-columns: 1fr;
    padding: 32px 0;
    gap: 16px;
  }
  .welcome h2 {
    font-size: 28px;
  }
  .session-picker {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  }
  .session-picker select {
    width: 100%;
  }
  .bench-actions {
    gap: 8px;
  }
  .bench-metrics > div {
    padding: 0 16px;
  }
  .bench-metrics .bz-metric {
    font-size: 30px;
  }
  .device-name {
    font-size: 14px;
  }
  .bench-tabs {
    gap: 20px;
  }
  .bench-tabs button {
    font-size: 13px;
    gap: 5px;
  }
  .pipeline-columns {
    display: none;
  }
  .pipeline-result > summary {
    grid-template-columns: minmax(0, 1fr) auto 20px;
    padding: 16px 0;
  }
  .request-count {
    display: none;
  }
  .pipeline-time {
    font-size: 19px;
  }
  .pipeline-name {
    gap: 10px;
  }
  .pipeline-icon {
    display: none;
  }
  .pipeline-detail {
    margin: 0 0 16px;
    padding: 16px;
  }
  .recent-sample {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .recent-sample .status-label {
    grid-row: 2;
  }
  .hardware-grid {
    grid-template-columns: 1fr;
  }
  .hardware-grid > div {
    padding: 20px;
  }
  .sample-result > summary {
    grid-template-columns: minmax(0, 1fr) auto 18px;
    padding-inline: 0;
  }
  .sample-result > summary > .status-label {
    grid-row: 2;
  }
  .sample-result > summary > strong {
    grid-column: 2;
    grid-row: 1;
  }
  .sample-result > summary > .expand-chevron {
    grid-column: 3;
    grid-row: 1;
  }
  .sample-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sample-filter {
    width: 100%;
  }
  .sample-filter select {
    flex: 1;
  }
  .recording-strip {
    flex-wrap: wrap;
  }
  .live-label {
    display: none;
  }
  .search-field {
    width: 100%;
  }
  .search-field input {
    width: 100%;
  }
  .detail-heading {
    align-items: flex-start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .expand-chevron {
    transition: none;
  }
}
</style>

<style scoped>
.scenario-choice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  cursor: pointer;
}
.scenario-choice span {
  display: grid;
  gap: 4px;
}
.scenario-choice small {
  color: var(--bz-fg-mid);
}
</style>

<style scoped>
@media (max-width: 480px) {
  .category-choices {
    grid-template-columns: 1fr;
  }
}
</style>

