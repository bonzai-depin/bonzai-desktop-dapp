<script setup>
import { ref, computed, onMounted } from "vue";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  companyId: String,
  contracts: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed"]);
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const api = () => window.electronAPI?.db?.gmaoCasework;
const versions = ref([]),
  draft = ref(null),
  contractId = ref(""),
  confirmed = ref(false),
  busy = ref(false),
  error = ref("");
const items = computed(() =>
  versions.value.filter((v) => v.contractId === contractId.value)
);
async function load() {
  if (api())
    versions.value = (await api().snapshot(props.companyId)).records.filter(
      (r) => r.kind === "pricing"
    );
}
function create() {
  confirmed.value = false;
  draft.value = {
    version: Math.max(0, ...items.value.map((v) => v.profile.version)) + 1,
    reference: "",
    validatedBy: "",
    effectiveFrom: "",
    effectiveUntil: "",
    coefficient: 1,
    includedLaborHours: 0,
    travelIncluded: false,
    accessAboveThreshold: "billable",
    allIncludedBelowThreshold: false,
    vatRate: 20,
    rules: [{ id: "", label: "", section: "ST1", thresholdCents: 0 }],
  };
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api().savePricingVersion(props.companyId, {
      contractId: contractId.value,
      version: draft.value.version,
      profile: draft.value,
      supersedes: draft.value.supersedes || null,
      confirmed: confirmed.value,
    });
    await load();
    draft.value = null;
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => (error.value = e.message)));
</script>
<template>
  <details class="pricing-versions" data-i18n-skip>
    <summary>
      {{
        t(
          "Tarifs contractuels · versions et périodes",
          "Contract pricing · versions and periods"
        )
      }}
    </summary>
    <div class="pricing-head">
      <label
        >{{ t("Contrat", "Contract")
        }}<select v-model="contractId" @change="draft = null">
          <option value="">{{ t("Choisir", "Choose") }}</option>
          <option v-for="c in contracts" :key="c.id" :value="c.id">
            {{ c.name }} · {{ c.reference }}
          </option>
        </select></label
      ><button class="bz-btn" :disabled="!contractId" @click="create">
        + {{ t("Nouvelle version", "New version") }}
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-for="v in items" :key="v.id">
      <strong>{{ v.profile.reference }} · v{{ v.profile.version }}</strong>
      <p>
        {{ v.profile.effectiveFrom }} → {{ v.profile.effectiveUntil }} ·
        {{ v.profile.validatedBy }}
      </p>
      <details>
        <summary>{{ t("Conditions validées", "Validated terms") }}</summary>
        <p>
          K {{ v.profile.coefficient }} · {{ v.profile.includedLaborHours }} h
          {{ t("incluses", "included") }} · TVA {{ v.profile.vatRate }} %
        </p>
        <ul>
          <li v-for="r in v.profile.rules" :key="r.id">
            {{ r.label }} · {{ r.section }} · {{ r.thresholdCents / 100 }} €
          </li>
        </ul>
      </details>
    </article>
    <form v-if="draft" @submit.prevent="save" class="pricing-editor">
      <label class="wide" v-if="items.length"
        >{{
          t(
            "Remplace une version à la date de début (facultatif)",
            "Replaces a version from the start date (optional)"
          )
        }}<select v-model="draft.supersedes">
          <option value="">
            {{ t("Nouvelle période indépendante", "Independent new period") }}
          </option>
          <option v-for="v in items" :key="v.id" :value="v.id">
            {{ v.profile.reference }} · v{{ v.profile.version }} ·
            {{ v.profile.effectiveFrom }} → {{ v.profile.effectiveUntil }}
          </option>
        </select></label
      >
      <label
        >{{ t("Référence / avenant", "Reference / amendment")
        }}<input v-model="draft.reference" required /></label
      ><label
        >{{ t("Validé par", "Validated by")
        }}<input v-model="draft.validatedBy" required
      /></label>
      <label
        >{{ t("Du", "From")
        }}<input v-model="draft.effectiveFrom" type="date" required /></label
      ><label
        >{{ t("Au inclus", "Through")
        }}<input v-model="draft.effectiveUntil" type="date" required
      /></label>
      <label
        >{{ t("Coefficient pièces", "Parts coefficient")
        }}<input
          v-model.number="draft.coefficient"
          type="number"
          min="0.001"
          step="any"
          required /></label
      ><label
        >{{ t("Main-d’œuvre incluse (h)", "Included labor (h)")
        }}<input
          v-model.number="draft.includedLaborHours"
          type="number"
          min="0"
          step="any"
          required
      /></label>
      <label
        >{{ t("TVA (%)", "VAT (%)")
        }}<input
          v-model.number="draft.vatRate"
          type="number"
          min="0"
          max="100"
          step="any"
          required /></label
      ><label
        >{{ t("Accès / levage", "Access / lifting")
        }}<select v-model="draft.accessAboveThreshold">
          <option value="included">{{ t("Inclus", "Included") }}</option>
          <option value="billable">{{ t("Facturable", "Billable") }}</option>
        </select></label
      >
      <label class="pricing-check"
        ><input
          v-model="draft.travelIncluded"
          type="checkbox"
          role="switch"
        />{{ t("Déplacement inclus", "Travel included") }}</label
      ><label class="pricing-check"
        ><input
          v-model="draft.allIncludedBelowThreshold"
          type="checkbox"
          role="switch"
        />{{
          t("Tout inclus sous franchise", "All included below threshold")
        }}</label
      >
      <fieldset class="wide">
        <legend>
          {{ t("Catégories et franchises", "Categories and thresholds") }}
        </legend>
        <div
          v-for="(r, index) in draft.rules"
          :key="index"
          class="pricing-rule"
        >
          <label>{{ t("Code", "Code") }}<input v-model="r.id" required /></label
          ><label
            >{{ t("Désignation", "Name")
            }}<input v-model="r.label" required /></label
          ><label
            >{{ t("Section", "Section")
            }}<input v-model="r.section" required /></label
          ><label
            >{{ t("Domaine (facultatif)", "Domain (optional)")
            }}<input v-model="r.domain" /></label
          ><label
            >{{ t("Franchise HT (€)", "Threshold (€)")
            }}<input
              :value="r.thresholdCents / 100"
              type="number"
              min="0"
              step="0.01"
              @input="
                r.thresholdCents = Math.round(Number($event.target.value) * 100)
              "
              required /></label
          ><button
            class="bz-btn"
            type="button"
            @click="draft.rules.splice(index, 1)"
          >
            {{ t("Retirer", "Remove") }}
          </button>
        </div>
        <button
          class="bz-btn"
          type="button"
          @click="
            draft.rules.push({
              id: '',
              label: '',
              section: '',
              thresholdCents: 0,
            })
          "
        >
          + {{ t("Catégorie", "Category") }}
        </button>
      </fieldset>
      <label class="pricing-check wide"
        ><input v-model="confirmed" type="checkbox" required />{{
          t(
            "Je confirme ces conditions à partir du contrat et de sa période de validité.",
            "I confirm these terms against the contract and its effective period."
          )
        }}</label
      >
      <footer class="wide">
        <button class="bz-btn" type="button" @click="draft = null">
          {{ t("Annuler", "Cancel") }}</button
        ><button class="bz-btn bz-btn--primary" :disabled="busy || !confirmed">
          {{ t("Valider cette version", "Validate version") }}
        </button>
      </footer>
    </form>
  </details>
</template>
<style scoped>
.pricing-versions {
  border: 1px solid var(--bz-border);
  border-radius: 14px;
  padding: 24px;
  margin: 20px 0;
  color: var(--bz-fg);
  background: var(--bz-card);
}
summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 16px;
}
.pricing-head,
footer {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
}
.pricing-versions label {
  display: grid;
  gap: 7px;
}
.pricing-versions input:not([type="checkbox"]),
.pricing-versions select {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 11px 14px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: 9px;
  font: inherit;
}
.pricing-versions select {
  padding-right: 36px;
}
.pricing-versions article {
  padding: 16px;
  margin-top: 12px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
}
.pricing-editor {
  margin-top: 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.wide {
  grid-column: 1/-1;
}
.pricing-versions .pricing-check {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pricing-rule {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 0;
}
.pricing-editor fieldset {
  padding: 16px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
}
@media (max-width: 700px) {
  .pricing-editor,
  .pricing-rule {
    grid-template-columns: 1fr;
  }
  .pricing-head {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
