<script setup>
import { ref, onMounted, watch, onUnmounted } from "vue";
import { i18n } from "../../i18n/index.js";
import MaintenanceSourceViewer from "./MaintenanceSourceViewer.vue";
import MaintenanceFactFields from "./MaintenanceFactFields.vue";
const props = defineProps({
  modelValue: Object,
  companyId: String,
  source: Object,
  readonly: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const api = () => window.electronAPI.db;
const highlighted = ref(null);
const sites = ref([]),
  assets = ref([]),
  matches = ref([]),
  error = ref("");
function addRegion(region) {
  update("sourceLocations", [
    ...(props.modelValue.sourceLocations || []),
    { ...region, field: "", state: "value", quote: "" },
  ]);
}
function location(index, key, value) {
  update(
    "sourceLocations",
    (props.modelValue.sourceLocations || []).map((l, i) =>
      i === index ? { ...l, [key]: value } : l
    )
  );
}
const groups = [
  ["references", "reference", "Références", "References"],
  ["equipment", "equipment", "Équipements et états", "Equipment and outcomes"],
  ["visits", "visit", "Passages et main-d’œuvre", "Visits and labor"],
  ["parts", "part", "Pièces et réemploi", "Parts and reuse"],
  ["fluids", "fluid", "Registre des fluides", "Refrigerant ledger"],
  ["blockers", "blocker", "Attentes et suites", "Blockers and follow-ups"],
  ["signatures", "signature", "Signatures et visas", "Signatures"],
];
function update(k, v) {
  emit("update:modelValue", { ...props.modelValue, [k]: v });
}
function item(k, i, v) {
  update(
    k,
    (props.modelValue[k] || []).map((x, j) => (j === i ? v : x))
  );
}
let matchRequest = 0;
function selectSite(id) {
  emit("update:modelValue", {
    ...props.modelValue,
    siteId: id,
    site:
      props.modelValue.site || sites.value.find((s) => s.id === id)?.name || "",
    targetRecordId: null,
  });
}
async function refreshMatches() {
  const request = ++matchRequest;
  try {
    const result = await api().gmaoCasework.findMatches(props.companyId, {
      title: props.modelValue.title,
      occurredOn: props.modelValue.occurredOn,
      equipment: props.modelValue.equipment || [],
      references: (props.modelValue.references || []).filter(
        (r) => r.type && r.value && r.issuer && r.year
      ),
      site: props.modelValue.site,
      siteId: props.modelValue.siteId,
    });
    if (request === matchRequest) matches.value = result;
  } catch {
    if (request === matchRequest) matches.value = [];
  }
}
onMounted(async () => {
  try {
    const s = await api().gmao.snapshot(props.companyId);
    sites.value = s.sites || [];
    assets.value = s.assets || [];
    await refreshMatches();
  } catch (e) {
    error.value = e.message;
  }
});
watch(
  () => [
    props.modelValue.references,
    props.modelValue.siteId,
    props.modelValue.site,
    props.modelValue.title,
    props.modelValue.occurredOn,
    props.modelValue.equipment,
  ],
  refreshMatches,
  { deep: true }
);
</script>
<template>
  <section class="archive-review" data-i18n-skip>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="archive-proof" v-if="source?.blobId">
      <MaintenanceSourceViewer
        :source="source"
        :readonly="readonly"
        :highlight="highlighted"
        @region="addRegion"
      /><small>{{
        t(
          "Original conservé · aucune opération courante déclenchée",
          "Original preserved · no live operations triggered"
        )
      }}</small>
    </div>
    <div class="archive-editor">
      <div class="archive-top">
        <label
          >{{ t("Titre", "Title")
          }}<input
            :disabled="readonly"
            :value="modelValue.title"
            @input="update('title', $event.target.value)" /></label
        ><label
          >{{
            t(
              "Date de l’opération · vide si inconnue",
              "Operation date · blank if unknown"
            )
          }}<input
            :disabled="readonly"
            type="date"
            :value="modelValue.occurredOn"
            @input="update('occurredOn', $event.target.value)"
        /></label>
        <label
          >{{ t("Site du référentiel", "Registered site")
          }}<select
            :disabled="readonly"
            :value="modelValue.siteId || ''"
            @change="selectSite($event.target.value)"
          >
            <option value="">
              {{ modelValue.site || t("À rapprocher", "To match") }}
            </option>
            <option v-for="site in sites" :key="site.id" :value="site.id">
              {{ site.trigram }} · {{ site.name }}
            </option>
          </select></label
        >
        <label v-if="!modelValue.siteId"
          >{{
            t(
              "Nom / code du site dans la source",
              "Site name / code in source"
            )
          }}<input
            :disabled="readonly"
            :value="modelValue.site"
            @input="update('site', $event.target.value)"
        /></label>
        <label v-if="matches.length"
          >{{
            t(
              "Référence déjà connue · compléter le dossier",
              "Known reference · add to dossier"
            )
          }}<select
            :disabled="readonly"
            :value="modelValue.targetRecordId || ''"
            @change="update('targetRecordId', $event.target.value)"
          >
            <option value="">
              {{ t("Choisir le dossier existant", "Choose existing dossier") }}
            </option>
            <option v-for="m in matches" :key="m.id" :value="m.id">
              {{
                m.matchKind === "suggested"
                  ? t("À comparer : ", "Compare: ")
                  : ""
              }}{{ m.title || m.value }} · {{ m.occurredOn }}
            </option>
          </select></label
        >
      </div>
      <label
        >{{ t("Résumé fidèle à la pièce", "Summary of the evidence")
        }}<textarea
          :disabled="readonly"
          :value="modelValue.description"
          rows="3"
          @input="update('description', $event.target.value)"
        />
      </label>
      <details :open="!!modelValue.sourceLocations?.length">
        <summary>
          {{
            t("Champs vérifiés sur le scan", "Fields checked against the scan")
          }}
          <span>{{ modelValue.sourceLocations?.length || 0 }}</span>
        </summary>
        <article
          v-for="(loc, index) in modelValue.sourceLocations || []"
          :key="index"
        >
          <div class="archive-top">
            <label
              >{{ t("Champ concerné", "Field")
              }}<input
                :disabled="readonly"
                :value="loc.field"
                @input="location(index, 'field', $event.target.value)" /></label
            ><label
              >{{ t("Page", "Page")
              }}<input
                :disabled="readonly"
                type="number"
                min="1"
                :value="loc.page"
                @input="
                  location(index, 'page', Number($event.target.value))
                " /></label
            ><label
              >{{ t("État dans la source", "Source state")
              }}<select
                :disabled="readonly"
                :value="loc.state"
                @change="location(index, 'state', $event.target.value)"
              >
                <option value="value">
                  {{ t("Valeur lisible", "Readable value") }}
                </option>
                <option value="checked">
                  {{ t("Case cochée", "Checked") }}
                </option>
                <option value="unchecked">
                  {{ t("Case non cochée", "Unchecked") }}
                </option>
                <option value="blank">
                  {{ t("Champ vide", "Blank field") }}
                </option>
                <option value="illegible">
                  {{ t("Illisible", "Illegible") }}
                </option>
              </select></label
            ><label
              >{{ t("Lecture exacte", "Exact reading")
              }}<input
                :disabled="readonly"
                :value="loc.quote"
                @input="location(index, 'quote', $event.target.value)"
            /></label>
          </div>
          <button
            type="button"
            class="bz-btn bz-btn--ghost"
            v-if="loc.region"
            @click="highlighted = { ...loc }"
          >
            {{ t("Voir la zone", "Show area") }}</button
          ><button
            type="button"
            class="bz-btn bz-btn--ghost"
            v-if="!readonly"
            @click="
              update(
                'sourceLocations',
                modelValue.sourceLocations.filter((_, i) => i !== index)
              )
            "
          >
            {{ t("Retirer", "Remove") }}
          </button>
        </article>
        <button
          v-if="!readonly"
          type="button"
          class="bz-btn"
          @click="addRegion({ page: 1 })"
        >
          + {{ t("Champ / page sans zone", "Field / page without area") }}
        </button>
      </details>
      <details
        v-for="[key, kind, fr, en] in groups"
        :key="key"
        :open="(modelValue[key] || []).length > 0"
      >
        <summary>
          {{ t(fr, en) }} <span>{{ (modelValue[key] || []).length }}</span>
        </summary>
        <article v-for="(value, index) in modelValue[key] || []" :key="index">
          <fieldset :disabled="readonly" class="archive-fact">
            <MaintenanceFactFields
              :kind="kind"
              :model-value="value"
              :assets="assets"
              @update:model-value="item(key, index, $event)"
            />
          </fieldset>
          <button
            v-if="!readonly"
            type="button"
            class="bz-btn bz-btn--ghost"
            @click="
              update(
                key,
                modelValue[key].filter((_, i) => i !== index)
              )
            "
          >
            {{ t("Retirer la ligne", "Remove row") }}
          </button>
        </article>
        <button
          v-if="!readonly"
          type="button"
          class="bz-btn"
          @click="update(key, [...(modelValue[key] || []), {}])"
        >
          + {{ t("Ajouter", "Add") }}
        </button>
      </details>
    </div>
  </section>
</template>
<style scoped>
.archive-fact {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.archive-review {
  display: grid;
  grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.15fr);
  gap: 24px;
  align-items: start;
}
.archive-proof {
  position: sticky;
  top: 12px;
  display: grid;
  gap: 12px;
}
.archive-proof iframe {
  width: 100%;
  height: 68vh;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
  background: white;
}
.archive-proof img {
  width: 100%;
  max-height: 68vh;
  object-fit: contain;
}
.archive-editor {
  border: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  gap: 18px;
}
.archive-top {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.archive-editor label {
  display: grid;
  gap: 7px;
}
.archive-editor input,
.archive-editor select,
.archive-editor textarea {
  padding: 11px 14px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--bz-border);
  border-radius: 9px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: inherit;
}
.archive-editor select {
  padding-right: 36px;
}
.archive-editor details {
  padding: 16px;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
}
.archive-editor summary {
  cursor: pointer;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.archive-editor article > .bz-btn {
  margin: 12px 8px 0 0;
}
.archive-editor article {
  margin-top: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--bz-border);
}
.archive-editor details > .bz-btn {
  margin-top: 14px;
}
@media (max-width: 1000px) {
  .archive-review {
    grid-template-columns: 1fr;
  }
  .archive-proof {
    position: static;
  }
  .archive-proof iframe {
    height: 420px;
  }
  .archive-top {
    grid-template-columns: 1fr;
  }
}
</style>
