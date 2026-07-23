<template>
  <div class="bz-license">
    <header class="bz-license__hero">
      <div>
        <p class="bz-eyebrow">{{ $t('nav.help') }}</p>
        <h1 class="bz-h1 bz-license__title">{{ $t('views.licenses.title') }}</h1>
        <p class="bz-license__copy">Terms for every model in BonzAI.</p>
      </div>
      <div class="bz-license__stats">
        <span class="bz-license__stat-value">{{ filteredRows.length }}</span>
        <span class="bz-license__stat-label">visible</span>
      </div>
    </header>

    <section class="bz-license__toolbar" aria-label="License controls">
      <div class="bz-license__chips">
        <button
          v-for="item in licenseFilters"
          :key="item"
          type="button"
          class="bz-license__chip"
          :class="{ 'is-active': activeLicense === item }"
          @click="activeLicense = item"
        >
          {{ item }}
        </button>
      </div>
      <label class="bz-license__sort">
        <span>Sort</span>
        <select v-model="sortMode">
          <option value="license">License type</option>
          <option value="category">Model type</option>
          <option value="name">Name</option>
        </select>
      </label>
    </section>

    <section class="bz-license__table" aria-label="Model licenses">
      <div class="bz-license__row bz-license__row--head">
        <span>Model</span>
        <span>Type</span>
        <span>License</span>
        <span>Use</span>
      </div>

      <template v-for="row in filteredRows" :key="row.id">
        <article class="bz-license__row" :class="{ 'is-open': expandedId === row.id }">
          <div class="bz-license__model">
            <strong>{{ row.name }}</strong>
            <span>{{ row.description }}</span>
          </div>
          <span class="bz-license__type">{{ row.category }}</span>
          <div class="bz-license__license">
            <span class="bz-license__badge" :class="licenseClass(row.licenseType)">
              {{ row.licenseType }}
            </span>
          </div>
          <button class="bz-license__view" type="button" @click="expandedId = expandedId === row.id ? '' : row.id">
            {{ expandedId === row.id ? 'Close' : 'View' }}
            <span class="material-symbols-outlined">{{ expandedId === row.id ? 'expand_less' : 'expand_more' }}</span>
          </button>
        </article>
        <section v-if="expandedId === row.id" class="bz-license__detail">
          <div>
            <p class="bz-eyebrow">Practical summary</p>
            <p>{{ licenseMeaning(row.licenseType) }}</p>
          </div>
          <dl>
            <div v-for="item in licenseDetails(row.licenseType)" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
          <a v-if="row.licenseUrl" class="bz-btn bz-btn--ghost bz-btn--sm" :href="row.licenseUrl" target="_blank" rel="noreferrer">
            Governing terms
            <span class="material-symbols-outlined">open_in_new</span>
          </a>
        </section>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { listAllLLMs, MODEL_REQUIREMENTS } from "../skills/flagship.js";

const activeLicense = ref("All");
const sortMode = ref("license");
const expandedId = ref("");
const customRows = ref([]);
const fetchedLicenses = ref({});

const normalizeLicense = (license) => {
  const raw = String(license || "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "license metadata pending") return "Fetching";
  if (lower === "apache-2.0" || lower === "apache 2.0") return "Apache-2.0";
  if (lower === "mit") return "MIT";
  if (lower.includes("openrail")) return "OpenRAIL++";
  if (lower.includes("minimax")) return "MiniMax Community";
  if (lower.includes("ltx")) return "LTX-2 Community";
  if (lower === "other") return "Custom";
  return raw;
};

const licenseMeaning = (license) => ({
  "Apache-2.0": "Permissive open-source license with patent grant; suitable for broad commercial and derivative use.",
  MIT: "Permissive open-source license; keep copyright and license notices with redistributed code or model assets.",
  "OpenRAIL++": "Open model license with responsible-use restrictions; commercial use may be allowed within the license terms.",
  "MiniMax Community": "Custom MiniMax community terms for use and redistribution of MiniMax model weights.",
  "LTX-2 Community": "Custom Lightricks community terms for LTX-2 video model use and redistribution.",
  Custom: "Custom or repository-specific terms; BonzAI surfaces the named license and links the governing terms.",
  Fetching: "BonzAI is reading the repository metadata to resolve the exact license.",
  "User supplied": "Imported local LLM GGUFs keep the license of the original file owner or publisher.",
}[license] || "Repository-declared license. Review the linked terms before redistribution or commercial release.");

const licenseDetails = (license) => {
  if (["Apache-2.0", "MIT"].includes(license)) return [
    { label: "Commercial use", value: "Allowed" },
    { label: "Redistribution", value: "Allowed with notices" },
    { label: "Attribution", value: "Keep copyright and license notices" },
  ];
  if (license === "OpenRAIL++") return [
    { label: "Commercial use", value: "Generally allowed" },
    { label: "Redistribution", value: "Allowed under the same use restrictions" },
    { label: "Restrictions", value: "Responsible-use clauses apply" },
  ];
  if (license === "User supplied") return [
    { label: "Commercial use", value: "Depends on the source model" },
    { label: "Redistribution", value: "Not verified by BonzAI" },
    { label: "Action", value: "Record the original model license before publishing" },
  ];
  return [
    { label: "Commercial use", value: "Check the governing terms" },
    { label: "Redistribution", value: "Repository-specific" },
    { label: "Restrictions", value: "Custom conditions may apply" },
  ];
};

const fallbackUrl = (repo) => {
  if (!repo) return "";
  if (Array.isArray(repo)) return `https://huggingface.co/${repo[0]}`;
  return `https://huggingface.co/${repo}`;
};

const licenseKeyForRepo = (repo) => {
  if (!repo) return "";
  if (Array.isArray(repo)) return repo[0];
  return repo;
};

const fetchedFor = (repo) => fetchedLicenses.value[licenseKeyForRepo(repo)] || null;

const llmRows = computed(() => {
  const byBase = new Map();
  for (const model of listAllLLMs()) {
    if (byBase.has(model.baseKey)) continue;
    const fetched = fetchedFor(model.repo);
    byBase.set(model.baseKey, {
      id: `llm:${model.baseKey}`,
      name: model.name.replace(/\sQ[0-9A-Z_]+$/, ""),
      category: "LLM",
      description: model.description || model.filename,
      licenseType: normalizeLicense(fetched?.license || model.license),
      licenseUrl: fetched?.licenseUrl || model.licenseUrl || fallbackUrl(model.repo),
      repo: model.repo,
    });
  }
  return [...byBase.values()];
});

const pipelineRows = computed(() =>
  Object.entries(MODEL_REQUIREMENTS)
    .filter(([, model]) => model.type !== "llm")
    .map(([key, model]) => {
      const fetched = fetchedFor(model.repo);
      return {
        id: `pipeline:${key}`,
        name: model.name,
        category: model.type || "model",
        description: model.description || model.pipeline || model.endpoint || "",
        licenseType: normalizeLicense(fetched?.license || model.license),
        licenseUrl: fetched?.licenseUrl || model.licenseUrl || fallbackUrl(model.repo),
        repo: model.repo,
      };
    }),
);

const importedRows = computed(() =>
  customRows.value.map((row) => ({
    id: `custom:${row.filename}`,
    name: row.modelname || row.name || row.filename,
    category: "LLM",
    description: row.filename,
    licenseType: "User supplied",
    licenseUrl: "",
    repo: "",
  })),
);

const rows = computed(() => [...llmRows.value, ...pipelineRows.value, ...importedRows.value]);

const licenseFilters = computed(() => [
  "All",
  ...Array.from(new Set(rows.value.map((row) => row.licenseType))).sort(),
]);

const filteredRows = computed(() => {
  const out = activeLicense.value === "All"
    ? [...rows.value]
    : rows.value.filter((row) => row.licenseType === activeLicense.value);
  return out.sort((a, b) => {
    if (sortMode.value === "license" && a.licenseType !== b.licenseType) {
      return a.licenseType.localeCompare(b.licenseType);
    }
    if (sortMode.value === "category" && a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });
});

const licenseClass = (license) => ({
  "is-open": license === "Apache-2.0" || license === "MIT",
  "is-rail": license === "OpenRAIL++",
  "is-custom": !["Apache-2.0", "MIT", "OpenRAIL++", "Fetching"].includes(license),
  "is-loading": license === "Fetching",
});

async function fetchRepoLicense(repo) {
  const key = licenseKeyForRepo(repo);
  if (!key || fetchedLicenses.value[key]) return;
  try {
    const res = await fetch(`https://huggingface.co/api/models/${key}`);
    if (!res.ok) return;
    const data = await res.json();
    const card = data.cardData || {};
    const tagLicense = Array.isArray(data.tags)
      ? data.tags.find((tag) => String(tag).startsWith("license:"))
      : "";
    const license =
      card.license_name ||
      card.license ||
      data.license ||
      (tagLicense ? tagLicense.replace("license:", "") : "");
    const link = card.license_link
      ? (String(card.license_link).startsWith("http")
          ? card.license_link
          : `https://huggingface.co/${key}/blob/main/${card.license_link}`)
      : `https://huggingface.co/${key}`;
    if (license) {
      fetchedLicenses.value = {
        ...fetchedLicenses.value,
        [key]: { license, licenseUrl: link },
      };
    }
  } catch {
    // Keep static metadata if offline.
  }
}

onMounted(async () => {
  try {
    customRows.value = await window.electronAPI?.listCustomModels?.() || [];
  } catch {
    customRows.value = [];
  }

  const repos = new Set();
  for (const row of rows.value) {
    if (row.licenseType === "Fetching" && row.repo) repos.add(licenseKeyForRepo(row.repo));
  }
  for (const repo of repos) fetchRepoLicense(repo);
});
</script>

<style scoped>
.bz-license {
  height: 100%;
  overflow: auto;
  padding: var(--bz-space-6);
  color: var(--bz-fg);
  background: var(--bz-canvas);
}

.bz-license__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-6);
  align-items: end;
  padding-bottom: var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
}

.bz-license__title {
  margin: 0;
  color: var(--bz-fg);
}

.bz-license__copy {
  max-width: 760px;
  margin: var(--bz-space-3) 0 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: 1.5;
}

.bz-license__stats {
  min-width: 116px;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  text-align: right;
}

.bz-license__stat-value {
  display: block;
  font-family: var(--bz-font-mono);
  font-size: 28px;
  color: var(--bz-purple-300);
}

.bz-license__stat-label {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.bz-license__toolbar {
  display: flex;
  justify-content: space-between;
  gap: var(--bz-space-4);
  align-items: center;
  margin: var(--bz-space-5) 0;
}

.bz-license__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.bz-license__chip {
  height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  cursor: pointer;
}

.bz-license__chip:hover,
.bz-license__chip.is-active {
  border-color: var(--bz-purple-400);
  color: var(--bz-fg);
  background: var(--bz-raised);
}

.bz-license__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.bz-license__sort select {
  height: 34px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  color: var(--bz-fg);
}

.bz-license__table {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  overflow: hidden;
}

.bz-license__row {
  display: grid;
  grid-template-columns: minmax(240px, 1.4fr) 120px 190px 82px;
  gap: var(--bz-space-4);
  align-items: center;
  padding: var(--bz-space-4);
  border-top: 1px solid var(--bz-border);
}
.bz-license__row.is-open { background: var(--bz-raised); }

.bz-license__row:first-child {
  border-top: 0;
}

.bz-license__row--head {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  text-transform: uppercase;
  letter-spacing: var(--bz-track-eyebrow);
  background: var(--bz-raised);
}

.bz-license__model {
  display: grid;
  gap: var(--bz-space-1);
}

.bz-license__model strong {
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
}

.bz-license__model span,
.bz-license__meaning {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}
.bz-license__view {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bz-space-1);
  border: 0;
  background: transparent;
  color: var(--bz-fg-mid);
  font: 600 var(--bz-size-meta) var(--bz-font-ui);
  cursor: pointer;
}
.bz-license__view:hover { color: var(--bz-fg); }
.bz-license__view .material-symbols-outlined { font-size: 18px; }
.bz-license__detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 1.2fr) auto;
  gap: var(--bz-space-5);
  align-items: start;
  padding: var(--bz-space-5);
  border-top: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
.bz-license__detail p { max-width: 60ch; margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); line-height: 1.5; }
.bz-license__detail dl { display: grid; gap: var(--bz-space-2); margin: 0; }
.bz-license__detail dl div { display: grid; grid-template-columns: 130px 1fr; gap: var(--bz-space-3); }
.bz-license__detail dt { color: var(--bz-fg-low); font-size: var(--bz-size-meta); }
.bz-license__detail dd { margin: 0; color: var(--bz-fg); font-size: var(--bz-size-meta); }

.bz-license__type {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  text-transform: uppercase;
}

.bz-license__license {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.bz-license__badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--bz-space-2);
  border-radius: var(--bz-r-pill);
  background: var(--bz-raised);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-micro);
}

.bz-license__badge.is-open {
  color: var(--bz-emerald-300);
}

.bz-license__badge.is-rail {
  color: var(--bz-amber-300);
}

.bz-license__badge.is-custom {
  color: var(--bz-purple-300);
}

.bz-license__badge.is-loading {
  color: var(--bz-fg-low);
}

.bz-license__license a {
  color: var(--bz-purple-400);
  font-size: var(--bz-size-meta);
  text-decoration: none;
}

.bz-license__license a:hover {
  color: var(--bz-purple-300);
}

@media (max-width: 1100px) {
  .bz-license__row {
    grid-template-columns: 1fr;
    gap: var(--bz-space-2);
  }

  .bz-license__row--head {
    display: none;
  }

  .bz-license__toolbar,
  .bz-license__hero {
    grid-template-columns: 1fr;
    align-items: start;
  }
  .bz-license__detail { grid-template-columns: 1fr; }
}
</style>
