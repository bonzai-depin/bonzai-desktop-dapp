<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { i18n } from "../../i18n/index.js";
import MaintenanceFactFields from "./MaintenanceFactFields.vue";
import MaintenanceArchiveReview from "./MaintenanceArchiveReview.vue";
const props = defineProps({
  companyId: String,
  workOrderId: String,
  assetId: String,
  assets: { type: Array, default: () => [] },
  readonly: Boolean,
  documents: { type: Array, default: () => [] },
});
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const api = () => window.electronAPI?.db?.gmaoCasework;
const movements = ref([]);
const records = ref([]),
  kind = ref("equipment"),
  draft = ref(null),
  busy = ref(false),
  error = ref(""),
  query = ref(""),
  active = ref(null),
  history = ref([]),
  resolution = ref(""),
  followupDocument = ref("");
const tabs = computed(() => [
  ["reference", t("Références", "References")],
  ["equipment", t("Équipements", "Equipment")],
  ["visit", t("Passages", "Visits")],
  ["part", t("Pièces", "Parts")],
  ["fluid", t("Fluides", "Refrigerants")],
  ["blocker", t("Attentes", "Blockers")],
  ["signature", t("Signatures", "Signatures")],
]);
const visible = computed(() =>
  records.value.filter(
    (r) =>
      (props.workOrderId || props.assetId
        ? r.kind === kind.value
        : r.kind === "archive") &&
      (!query.value ||
        JSON.stringify(r).toLowerCase().includes(query.value.toLowerCase()))
  )
);
const totals = computed(() =>
  records.value
    .filter((r) => r.kind === "visit")
    .reduce(
      (n, r) => ({
        presence: n.presence + (r.presenceMinutes || 0),
        labor: n.labor + (r.laborMinutes || 0),
        unknown: n.unknown + (r.laborMinutes == null ? 1 : 0),
      }),
      { presence: 0, labor: 0, unknown: 0 }
    )
);
async function load() {
  const company = props.companyId,
    work = props.workOrderId,
    asset = props.assetId;
  if (api()) {
    const result = props.assetId
      ? await api().assetHistory(company, { assetId: props.assetId })
      : await api().snapshot(company, { workOrderId: work });
    if (
      props.companyId === company &&
      props.workOrderId === work &&
      props.assetId === asset
    )
      records.value = result.records;
  }
}
async function run(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function save() {
  const submitted = draft.value;
  await run(async () => {
    await api().saveRecord(props.companyId, {
      kind: kind.value,
      workOrderId: props.workOrderId,
      id: submitted.id,
      revision: submitted.revision,
      data: submitted,
      sourceId: submitted.sourceId,
      documentId: submitted.documentId,
    });
    if (draft.value === submitted) draft.value = null;
  });
}
async function inspect(r) {
  const company = props.companyId;
  active.value = r;
  history.value = [];
  resolution.value = "";
  followupDocument.value = "";
  try {
    const result = await api().history(company, { id: r.archiveId || r.id });
    if (active.value?.id === r.id && props.companyId === company)
      history.value = result;
  } catch (e) {
    if (active.value?.id === r.id && props.companyId === company)
      error.value = e.message;
  }
}
function heading(r) {
  return (
    (r.kind === "reference" ? r.type + " · " + r.value : null) ||
    r.label ||
    r.name ||
    r.circuit ||
    r.reason ||
    r.technician ||
    r.role ||
    r.title ||
    r.workPerformed
  );
}
function details(r) {
  if (r.kind === "equipment")
    return (
      t("État", "State") +
      " · " +
      ({
        unknown: t("À vérifier", "To verify"),
        operational: t("Opérationnel", "Operational"),
        degraded: t("Dégradé", "Degraded"),
        out_of_service: t("Hors service", "Out of service"),
      }[r.outcome] || r.outcome)
    );
  if (r.kind === "visit")
    return `${r.date || "—"} · ${r.presenceMinutes ?? "—"} min ${t(
      "présence",
      "presence"
    )} · ${r.laborMinutes ?? "—"} min ${t("main-d’œuvre", "labor")}`;
  if (r.kind === "part")
    return `${r.quantity} · ${r.owner} · ${
      r.unitCostCents == null
        ? t("Coût inconnu", "Unknown cost")
        : (r.unitCostCents / 100).toFixed(2) + " €"
    }`;
  if (r.kind === "fluid")
    return `${r.refrigerant} · ${r.quantityKg ?? "—"} kg · ${r.date}`;
  if (r.kind === "blocker")
    return `${r.owner} · ${r.dueDate} · ${
      r.status === "open" ? t("À suivre", "Open") : t("Résolu", "Resolved")
    }`;
  return r.occurredOn || r.date || r.status || "";
}
watch(
  () => [kind.value, props.companyId, props.workOrderId],
  async ([value, company, work]) => {
    movements.value = [];
    const current = () =>
      kind.value === value &&
      props.companyId === company &&
      props.workOrderId === work;
    if (value === "part" && work && api()?.stockMovements) {
      try {
        const result = await api().stockMovements(company, {
          workOrderId: work,
        });
        if (current()) movements.value = result.movements || [];
      } catch (e) {
        if (current()) error.value = e.message;
      }
    }
  }
);
const refresh = () => load().catch((e) => (error.value = e.message));
onMounted(refresh);
watch(
  () => [props.companyId, props.workOrderId, props.assetId],
  () => {
    draft.value = null;
    active.value = null;
    records.value = [];
    refresh();
  }
);
</script>
<template>
  <section class="casework" data-i18n-skip>
    <header>
      <div>
        <h3>
          {{
            workOrderId
              ? t("Dossier terrain", "Field evidence")
              : assetId
              ? t("Historique de cet équipement", "This equipment’s history")
              : t("Historique des opérations", "Operations archive")
          }}
        </h3>
        <p v-if="workOrderId && records.some((r) => r.kind === 'visit')">
          {{ totals.presence }} min {{ t("de présence", "on site") }} ·
          {{ totals.labor }} min
          {{ t("de main-d’œuvre documentée", "documented labor") }}
          <span v-if="totals.unknown"
            >· {{ totals.unknown }}
            {{ t("durée(s) à qualifier", "duration(s) to qualify") }}</span
          >
        </p>
      </div>
      <button
        v-if="workOrderId && !readonly"
        type="button"
        class="bz-btn"
        @click="draft = {}"
      >
        + {{ t("Ajouter une preuve", "Add evidence") }}
      </button>
    </header>
    <nav
      v-if="workOrderId || assetId"
      :aria-label="t('Preuves terrain', 'Field evidence')"
    >
      <button
        v-for="[key, label] in tabs"
        :key="key"
        type="button"
        :aria-pressed="kind === key"
        @click="
          kind = key;
          draft = null;
          active = null;
        "
      >
        {{ label }}
        <small>{{ records.filter((r) => r.kind === key).length }}</small>
      </button>
    </nav>
    <input
      v-else
      v-model="query"
      type="search"
      :placeholder="
        t(
          'Rechercher un site, une DI, une pièce…',
          'Find a site, reference, part…'
        )
      "
      :aria-label="t('Rechercher les archives', 'Search archives')"
    />
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="draft" class="casework-editor">
      <MaintenanceFactFields
        v-model="draft"
        :kind="kind"
        :assets="assets"
        :movements="movements"
      /><label v-if="kind === 'signature'"
        >{{ t("Preuve de signature", "Signature evidence")
        }}<select v-model="draft.documentId">
          <option value="">
            {{
              t("Choisir un document du dossier", "Choose a dossier document")
            }}
          </option>
          <option v-for="doc in documents" :key="doc.id" :value="doc.id">
            {{ doc.filename || doc.title || doc.kind }}
          </option>
        </select></label
      >
      <footer>
        <button type="button" class="bz-btn" @click="draft = null">
          {{ t("Annuler", "Cancel") }}</button
        ><button
          type="button"
          class="bz-btn bz-btn--primary"
          :disabled="busy"
          @click="save"
        >
          {{ t("Enregistrer la preuve", "Save evidence") }}
        </button>
      </footer>
    </section>
    <div class="casework-list">
      <article v-for="r in visible" :key="r.id">
        <div>
          <strong>{{ heading(r) }}</strong>
          <p>{{ details(r) }}</p>
          <p v-if="r.nextAction || r.followup">
            {{ r.nextAction || r.followup }}
          </p>
        </div>
        <div class="casework-actions">
          <button
            type="button"
            class="bz-btn bz-btn--ghost"
            @click="inspect(r)"
          >
            {{ t("Ouvrir", "Open") }}</button
          ><button
            v-if="
              workOrderId &&
              !readonly &&
              r.status !== 'resolved' &&
              !r.followupResolvedAt
            "
            type="button"
            class="bz-btn bz-btn--ghost"
            @click="draft = JSON.parse(JSON.stringify(r))"
          >
            {{ t("Modifier", "Edit") }}
          </button>
        </div>
      </article>
    </div>
    <p v-if="!visible.length && !draft" class="casework-empty">
      {{
        t("Aucune preuve dans cette rubrique.", "No evidence in this section.")
      }}
    </p>
    <section v-if="active" class="casework-editor">
      <header>
        <h4>{{ heading(active) }}</h4>
        <button class="bz-btn bz-btn--ghost" @click="active = null">
          {{ t("Fermer", "Close") }}
        </button>
      </header>
      <template v-if="active.kind === 'archive'"
        ><details
          v-for="(doc, index) in active.documents"
          :key="index"
          :open="index === 0"
        >
          <summary>
            {{ doc.source.name }} ·
            {{ doc.occurredOn || t("Date inconnue", "Unknown date") }}
          </summary>
          <MaintenanceArchiveReview
            :model-value="doc"
            :source="doc.source"
            :company-id="companyId"
            readonly
          /></details
      ></template>
      <fieldset v-else disabled>
        <MaintenanceFactFields
          :model-value="active"
          :kind="active.kind"
          :assets="assets"
          :movements="movements"
        />
      </fieldset>
      <div
        v-if="
          active.kind === 'blocker' && active.status === 'open' && !readonly
        "
      >
        <label
          >{{ t("Résolution constatée", "Observed resolution")
          }}<textarea v-model="resolution" rows="3" /></label
        ><button
          class="bz-btn bz-btn--primary"
          :disabled="busy || !resolution.trim()"
          @click="
            run(async () => {
              await api().resolveBlocker(companyId, {
                id: active.id,
                revision: active.revision,
                resolution,
              });
              active = null;
            })
          "
        >
          {{ t("Lever ce blocage", "Resolve blocker") }}
        </button>
      </div>
      <div
        v-if="
          active.kind === 'fluid' &&
          active.followupDate &&
          !active.followupResolvedAt &&
          documents.length
        "
      >
        <label
          >{{ t("Résultat du suivi", "Follow-up result")
          }}<textarea v-model="resolution" rows="3" /></label
        ><label
          >{{ t("Compte-rendu justificatif", "Supporting report")
          }}<select v-model="followupDocument">
            <option value="">
              {{ t("Choisir un document", "Choose a document") }}
            </option>
            <option v-for="doc in documents" :key="doc.id" :value="doc.id">
              {{ doc.filename || doc.title || doc.kind }}
            </option>
          </select></label
        ><button
          class="bz-btn bz-btn--primary"
          :disabled="busy || !resolution.trim() || !followupDocument"
          @click="
            run(async () => {
              await api().resolveFluidFollowup(companyId, {
                id: active.id,
                revision: active.revision,
                resolution,
                documentId: followupDocument,
              });
              active = null;
            })
          "
        >
          {{ t("Clore le suivi documenté", "Close documented follow-up") }}
        </button>
      </div>
      <p v-if="active.followupResolvedAt">
        {{ t("Suivi clos", "Follow-up closed") }} ·
        {{ active.followupResolution }}
      </p>
      <details>
        <summary>
          {{ t("Journal des versions", "Revision history") }} ·
          {{ history.length }}
        </summary>
        <ol>
          <li v-for="h in history" :key="h.id">
            {{ new Date(h.created_at).toLocaleString() }} ·
            {{
              h.data.action === "created"
                ? t("Création", "Created")
                : t("Modification conservée", "Revision preserved")
            }}
            <details>
              <summary>
                {{ t("Valeurs conservées", "Preserved values") }}
              </summary>
              <pre>{{
                JSON.stringify(
                  { before: h.data.before, after: h.data.after },
                  null,
                  2
                )
              }}</pre>
            </details>
          </li>
        </ol>
      </details>
    </section>
  </section>
</template>
<style scoped>
.casework pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 16px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  max-height: 360px;
  overflow: auto;
}
.casework {
  padding: 24px;
  border: 1px solid var(--bz-border);
  border-radius: 14px;
  background: var(--bz-card);
  display: grid;
  gap: 20px;
  color: var(--bz-fg);
}
.casework header,
.casework footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.casework h3,
.casework h4 {
  margin: 0;
}
.casework p {
  margin: 8px 0;
  line-height: 1.5;
}
.casework nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.casework nav button {
  padding: 9px 14px;
  border: 1px solid var(--bz-border);
  border-radius: 24px;
  color: var(--bz-fg);
  background: var(--bz-panel);
  font: inherit;
  cursor: pointer;
}
.casework nav button[aria-pressed="true"] {
  border-color: var(--bz-accent);
  background: var(--bz-accent-soft, var(--bz-raised));
}
.casework nav small {
  margin-left: 6px;
}
.casework-list {
  display: grid;
  gap: 10px;
}
.casework-list article {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: 12px;
}
.casework-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.casework-editor {
  display: grid;
  gap: 20px;
  padding: 20px;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
}
.casework-editor fieldset {
  border: 0;
  padding: 0;
}
.casework-editor label {
  display: grid;
  gap: 8px;
}
.casework input,
.casework textarea,
.casework select {
  padding: 12px;
  border: 1px solid var(--bz-border);
  border-radius: 9px;
  color: var(--bz-fg);
  background: var(--bz-panel);
  font: inherit;
  width: 100%;
  box-sizing: border-box;
}
.casework select {
  padding-right: 36px;
}
.casework details summary {
  cursor: pointer;
  margin-bottom: 16px;
}
.casework-empty {
  padding: 16px;
  text-align: center;
}
@media (max-width: 700px) {
  .casework {
    padding: 16px;
  }
  .casework header,
  .casework-list article {
    align-items: start;
    flex-direction: column;
  }
  .casework-editor {
    padding: 12px;
  }
}
</style>
