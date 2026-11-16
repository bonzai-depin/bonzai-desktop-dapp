<script setup>
import { computed } from "vue";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  kind: String,
  assets: { type: Array, default: () => [] },
  movements: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue"]);
const t = (fr, en) => (i18n.state.locale.startsWith("fr") ? fr : en);
const field = (key, fr, en, type = "text", options) => ({
  key,
  label: t(fr, en),
  type,
  options,
});
const choice = (v, fr, en) => ({ value: v, label: t(fr, en) });
const schemas = computed(() => ({
  reference: [
    field(
      "type",
      "Type",
      "Type",
      "select",
      ["DI", "OI", "OT", "SILLAGE", "GTP", "GMAO", "BON"].map((v) => ({
        value: v,
        label: v,
      }))
    ),
    field("value", "Numéro", "Number"),
    field("issuer", "Émetteur", "Issuer"),
    field("year", "Année de référence", "Reference year", "number"),
  ],
  equipment: [
    field("building", "Bâtiment", "Building"),
    field("room", "Local", "Room"),
    field(
      "initialOutcome",
      "État initial",
      "Initial condition",
      "select",
      ["unknown", "operational", "degraded", "out_of_service"].map((v) =>
        choice(
          v,
          {
            unknown: "À vérifier",
            operational: "Opérationnel",
            degraded: "Dégradé",
            out_of_service: "Hors service",
          }[v],
          v
        )
      )
    ),
    field("finding", "Constat", "Finding", "select", [
      choice("unknown", "À vérifier", "Unknown"),
      choice("fault", "Panne constatée", "Fault found"),
      choice("no_fault", "Aucune panne constatée", "No fault found"),
      choice("monitoring", "Sous surveillance", "Under observation"),
    ]),
    field(
      "measurements",
      "Mesures / contrôles",
      "Measurements / checks",
      "textarea"
    ),
    field("nextAction", "Suite à donner", "Next action", "textarea"),
    field(
      "assetId",
      "Équipement du référentiel",
      "Registered equipment",
      "asset"
    ),
    field("label", "Désignation", "Equipment name"),
    field("serialNumber", "N° de série", "Serial number"),
    field("task", "Travaux / contrôle", "Work / inspection", "textarea"),
    field("outcome", "État après intervention", "Outcome", "select", [
      choice("unknown", "À vérifier", "To verify"),
      choice("operational", "Opérationnel", "Operational"),
      choice("degraded", "Dégradé", "Degraded"),
      choice("out_of_service", "Hors service", "Out of service"),
    ]),
    field("downtimeFrom", "Indisponible depuis", "Unavailable from", "date"),
    field("downtimeUntil", "Rétabli le", "Restored on", "date"),
  ],
  visit: [
    field(
      "assetId",
      "Équipement concerné (facultatif)",
      "Equipment (optional)",
      "asset"
    ),
    field(
      "travelMinutes",
      "Déplacement (min) · vide si inconnu",
      "Travel (min) · blank if unknown",
      "number"
    ),
    field("date", "Date du passage", "Visit date", "date"),
    field(
      "technician",
      "Technicien (si durée seule)",
      "Technician (duration only)"
    ),
    field("diagnosis", "Diagnostic", "Diagnosis", "textarea"),
    field("workPerformed", "Travaux effectués", "Work performed", "textarea"),
    field(
      "duration",
      "Durée attestée sans horaires (ex. 1,5 h)",
      "Attested duration without times (e.g. 1.5 h)"
    ),
    field(
      "durationBasis",
      "Nature de la durée seule",
      "Duration meaning",
      "select",
      [
        choice("unspecified", "Non précisée", "Unspecified"),
        choice("presence", "Présence sur site", "On-site presence"),
        choice("labor", "Main-d’œuvre", "Labor"),
      ]
    ),
  ],
  part: [
    field("reference", "Référence", "Reference"),
    field("unit", "Unité", "Unit"),
    field("serialNumber", "Numéro de série", "Serial number"),
    field("name", "Pièce / référence", "Part / reference"),
    field("origin", "Origine", "Origin", "select", [
      choice("purchased", "Achetée", "Purchased"),
      choice("stock", "Stock", "Stock"),
      choice("reused", "Réemploi", "Reused"),
      choice("customer_supplied", "Fournie par le client", "Customer supplied"),
    ]),
    field("quantity", "Quantité", "Quantity", "number"),
    field("owner", "Propriétaire", "Owner"),
    field("condition", "État", "Condition"),
    field("donorAssetId", "Équipement donneur", "Donor equipment", "asset"),
    field(
      "donorLabel",
      "Donneur / site hors référentiel",
      "Unregistered donor / site"
    ),
    field(
      "recipientAssetId",
      "Équipement receveur",
      "Recipient equipment",
      "asset"
    ),
    field(
      "recipientLabel",
      "Receveur / site hors référentiel",
      "Unregistered recipient / site"
    ),
    field(
      "unitCostCents",
      "Coût unitaire HT (€) · vide = inconnu",
      "Unit cost (€) · blank = unknown",
      "money"
    ),
    field(
      "stockMovementId",
      "Sortie de stock enregistrée (Achats)",
      "Recorded stock movement (Purchasing)",
      "movement"
    ),
  ],
  fluid: [
    field("technician", "Intervenant", "Technician"),
    field("followupDate", "Échéance du suivi", "Follow-up date", "date"),
    field("assetId", "Équipement", "Equipment", "asset"),
    field("circuit", "Circuit", "Circuit"),
    field("refrigerant", "Fluide (ex. R407C)", "Refrigerant (e.g. R407C)"),
    field("operation", "Opération", "Operation", "select", [
      choice("added", "Charge ajoutée", "Added"),
      choice("recovered", "Fluide récupéré", "Recovered"),
      choice("leak_test", "Recherche de fuite", "Leak test"),
    ]),
    field("quantityKg", "Masse (kg)", "Mass (kg)", "number"),
    field("date", "Date", "Date", "date"),
    field("leakResult", "Résultat fuite", "Leak result", "select", [
      choice("unknown", "À vérifier", "Unknown"),
      choice("found", "Fuite trouvée", "Leak found"),
      choice("not_found", "Fuite non localisée", "Leak not located"),
      choice("repaired", "Fuite réparée", "Leak repaired"),
    ]),
    field(
      "followup",
      "Suivi / prochaine action",
      "Follow-up / next action",
      "textarea"
    ),
  ],
  blocker: [
    field("type", "Motif d’attente", "Blocker", "select", [
      choice("parts", "Pièces", "Parts"),
      choice("quote", "Devis", "Quote"),
      choice("customer", "Décision client", "Customer decision"),
      choice("access", "Accès / nacelle", "Access / lift"),
      choice("expert", "Expertise constructeur", "Expert report"),
      choice("diagnosis", "Diagnostic", "Diagnosis"),
      choice("return_visit", "Nouveau passage", "Return visit"),
      choice("other", "Autre", "Other"),
    ]),
    field("reason", "Situation", "Situation", "textarea"),
    field("owner", "Responsable du suivi", "Follow-up owner"),
    field("dueDate", "Date de relance", "Follow-up date", "date"),
    field("nextAction", "Prochaine action", "Next action", "textarea"),
  ],
  signature: [
    field("role", "Rôle", "Role", "select", [
      choice("technician", "Technicien", "Technician"),
      choice(
        "site_representative",
        "Représentant du site",
        "Site representative"
      ),
      choice("contract_manager", "Responsable du contrat", "Contract manager"),
      choice("service_acceptance", "Service fait", "Service acceptance"),
    ]),
    field(
      "status",
      "Preuve dans le document",
      "Evidence in document",
      "select",
      [
        choice("present", "Signature présente", "Signature present"),
        choice("absent", "Non signé", "Not signed"),
        choice("illegible", "Illisible", "Illegible"),
      ]
    ),
    field("name", "Nom lisible", "Readable name"),
    field("date", "Date signée", "Signature date", "date"),
    field("note", "Observation", "Observation", "textarea"),
  ],
}));
const fields = computed(() => schemas.value[props.kind] || []);
function update(key, value) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function input(f, event) {
  const value = event.target.value;
  update(
    f.key,
    f.type === "money"
      ? value === ""
        ? null
        : Math.round(Number(value) * 100)
      : f.type === "number"
      ? value === ""
        ? null
        : Number(value)
      : value
  );
}
function segment(index, key, value) {
  const segments = (props.modelValue.segments || []).map((s) => ({ ...s }));
  segments[index][key] = value;
  update("segments", segments);
}
function addSegment() {
  update("duration", null);
  emit("update:modelValue", {
    ...props.modelValue,
    duration: null,
    segments: [
      ...(props.modelValue.segments || []),
      {
        date: props.modelValue.date || "",
        endDate: "",
        start: "",
        end: "",
        breakMinutes: 0,
        technicians: [],
        timezone: "",
      },
    ],
  });
}
</script>
<template>
  <div class="maintenance-fields" data-i18n-skip>
    <label
      v-for="f in fields"
      :key="f.key"
      :class="{ wide: f.type === 'textarea' }"
      ><span>{{ f.label }}</span>
      <textarea
        v-if="f.type === 'textarea'"
        :value="modelValue[f.key]"
        rows="3"
        @input="input(f, $event)"
      />
      <select
        v-else-if="
          f.type === 'select' || f.type === 'asset' || f.type === 'movement'
        "
        :value="modelValue[f.key] || ''"
        @change="input(f, $event)"
      >
        <option value="">{{ t("Choisir", "Choose") }}</option>
        <option
          v-for="o in f.type === 'asset'
            ? assets.map((a) => ({
                value: a.id,
                label: [a.assetCode, a.label || a.name, a.serialNumber]
                  .filter(Boolean)
                  .join(' · '),
              }))
            : f.type === 'movement'
            ? movements.map((m) => ({
                value: m.id,
                label: [
                  m.reference || m.id,
                  {
                    consume: t('Sortie', 'Issue'),
                    transfer: t('Transfert', 'Transfer'),
                    fulfill: t('Affectation', 'Fulfilment'),
                  }[m.type] || m.type,
                  m.quantity,
                  m.locationId,
                  m.destinationId,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))
            : f.options"
          :key="o.value"
          :value="o.value"
        >
          {{ o.label }}
        </option>
      </select>
      <input
        v-else
        :type="f.type === 'money' ? 'number' : f.type"
        :step="['money', 'number'].includes(f.type) ? 'any' : undefined"
        :value="
          f.type === 'money' && modelValue[f.key] != null
            ? modelValue[f.key] / 100
            : modelValue[f.key]
        "
        @input="input(f, $event)"
      />
    </label>
    <section v-if="kind === 'visit'" class="wide maintenance-segments">
      <header>
        <strong>{{ t("Créneaux de travail", "Work segments") }}</strong
        ><button type="button" class="bz-btn bz-btn--ghost" @click="addSegment">
          + {{ t("Créneau", "Segment") }}
        </button>
      </header>
      <div
        v-for="(s, index) in modelValue.segments || []"
        :key="index"
        class="maintenance-segment"
      >
        <label
          >{{ t("Jour", "Day")
          }}<input
            type="date"
            :value="s.date"
            @input="segment(index, 'date', $event.target.value)"
        /></label>
        <label
          >{{ t("Début", "Start")
          }}<input
            type="time"
            :value="s.start"
            @input="segment(index, 'start', $event.target.value)"
        /></label>
        <label
          >{{ t("Fin", "End")
          }}<input
            type="time"
            :value="s.end"
            @input="segment(index, 'end', $event.target.value)"
        /></label>
        <label
          >{{ t("Jour de fin (si différent)", "End date (if different)")
          }}<input
            type="date"
            :value="s.endDate"
            @input="segment(index, 'endDate', $event.target.value)"
        /></label>
        <label
          >{{ t("Pause (min)", "Break (min)")
          }}<input
            type="number"
            min="0"
            :value="s.breakMinutes"
            @input="
              segment(index, 'breakMinutes', Number($event.target.value))
            "
        /></label>
        <label
          >{{
            t(
              "Techniciens · séparés par une virgule",
              "Technicians · comma separated"
            )
          }}<input
            :value="(s.technicians || []).join(', ')"
            @change="
              segment(
                index,
                'technicians',
                $event.target.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean)
              )
            "
        /></label>
        <label
          >{{
            t("Qualifications des participants", "Participant qualifications")
          }}<input
            :value="s.qualifications"
            @input="segment(index, 'qualifications', $event.target.value)"
        /></label>
        <label
          >{{
            t(
              "Fuseau connu (ex. Europe/Paris)",
              "Known timezone (e.g. Europe/Paris)"
            )
          }}<input
            :value="s.timezone"
            @input="segment(index, 'timezone', $event.target.value)"
        /></label>
        <button
          type="button"
          class="bz-btn bz-btn--ghost"
          @click="
            update(
              'segments',
              modelValue.segments.filter((_, i) => i !== index)
            )
          "
        >
          {{ t("Retirer", "Remove") }}
        </button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.maintenance-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.maintenance-fields label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  color: var(--bz-fg);
}
.maintenance-fields input,
.maintenance-fields select,
.maintenance-fields textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid var(--bz-border);
  border-radius: 9px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: inherit;
}
.maintenance-fields select {
  padding-right: 36px;
}
.maintenance-fields textarea {
  resize: vertical;
}
.wide {
  grid-column: 1/-1;
}
.maintenance-segments header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.maintenance-segment {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  margin-top: 12px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
}
@media (max-width: 700px) {
  .maintenance-fields,
  .maintenance-segment {
    grid-template-columns: 1fr;
  }
}
</style>
