<template>
  <section class="maintenance-controls company-screen" :class="{ embedded: !!workOrderId }">
    <header class="control-heading">
      <div>
        <span class="material-symbols-outlined" aria-hidden="true"
          >fact_check</span
        >
        <h2>
          {{
            workOrderId
              ? t("Preuves et contrôles", "Evidence and checks")
              : t("Contrôles du contrat", "Contract controls")
          }}
        </h2>
      </div>
      <label v-if="!workOrderId"
        >{{ t("Site", "Site")
        }}<select v-model="siteId">
          <option value="">{{ t("Choisir un site", "Choose a site") }}</option>
          <option v-for="site in data.sites" :key="site.id" :value="site.id">
            {{ site.name }}
          </option>
        </select></label
      >
      <button class="bz-btn bz-btn--ghost" :disabled="busy" @click="load">
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span
        >{{ t("Actualiser", "Refresh") }}
      </button>
    </header>
    <p v-if="error" role="alert" class="control-error">{{ error }}</p>
    <p v-if="notice" role="status" class="control-notice">{{ notice }}</p>
    <div v-if="loading" class="control-empty" role="status">
      {{ t("Chargement des contrôles…", "Loading checks…") }}
    </div>
    <template v-else>
      <div v-if="currentWorkOrder" class="requirement-list">
        <span v-if="!requirements?.configured" class="requirement-note">{{
          t(
            "Exigences spécifiques du contrat non activées pour ce site.",
            "Contract-specific requirements are not enabled for this site.",
          )
        }}</span>
        <span
          v-for="check in requirements?.checks || []"
          :key="check.key"
          :class="['requirement', { complete: check.ok }]"
          :title="check.errors?.join(', ')"
          ><span class="material-symbols-outlined" aria-hidden="true">{{
            check.ok ? "check_circle" : "pending"
          }}</span
          >{{ checkLabel(check) }}</span
        >
      </div>
      <div v-if="actionable.length" class="obligation-preview">
        <button
          class="obligation-summary"
          :aria-expanded="showObligations"
          @click="showObligations = !showObligations"
        >
          <span class="material-symbols-outlined" aria-hidden="true"
            >event_upcoming</span
          ><span>{{ t("Échéances à suivre", "Deadlines to follow") }}</span
          ><strong class="bz-metric">{{ actionable.length }}</strong
          ><span class="material-symbols-outlined" aria-hidden="true">{{
            showObligations ? "expand_less" : "expand_more"
          }}</span>
        </button>
        <ul v-if="showObligations" class="obligations">
          <li
            v-for="item in actionable"
            :key="item.recordId + item.title + item.dueAt + item.workOrderId"
          >
            <button @click="openObligation(item)">
              <span
                >{{ obligationTitle(item)
                }}<small
                  >{{
                    item.dueDate || (item.dueAt
                      ? formatDate(item.dueAt)
                      : t("Date à renseigner", "Date needed"))
                  }}<template v-if="item.kind === 'periodic_report'">
                    ·
                    {{
                      item.issueId
                        ? t("Ouvrir la tâche", "Open task")
                        : t("Préparer avec l’équipe", "Prepare with the team")
                    }}</template
                  ></small
                ></span
              ><span class="obligation-state" :class="item.status">{{
                item.status === "late"
                  ? t("En retard", "Overdue")
                  : item.status === "missing"
                    ? t("À compléter", "Incomplete")
                    : t("À préparer", "Upcoming")
              }}</span
              ><span class="material-symbols-outlined" aria-hidden="true"
                >chevron_right</span
              >
            </button>
          </li>
        </ul>
      </div>
      <details
        class="controls-disclosure"
        :open="expanded"
        @toggle="expanded = $event.target.open"
      >
        <summary>
          <span class="material-symbols-outlined" aria-hidden="true">tune</span
          >{{
            workOrderId
              ? t(
                  "Renseigner les preuves et validations",
                  "Manage evidence and approvals",
                )
              : t(
                  "Configurer les exigences et dossiers",
                  "Manage requirements and records",
                )
          }}<span class="bz-metric">{{ scopedRecordCount }}</span
          ><span
            class="material-symbols-outlined expand-icon"
            aria-hidden="true"
            >expand_more</span
          >
        </summary>
        <div class="control-workspace">
          <aside
            class="control-sections"
            :aria-label="t('Catégorie de contrôle', 'Control category')"
          >
            <button
              v-for="item in sections"
              :key="item.kind"
              :class="{ selected: kind === item.kind }"
              :aria-pressed="kind === item.kind"
              @click="selectKind(item.kind)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{
                item.icon
              }}</span
              ><span>{{ item.label }}</span
              ><span class="bz-metric">{{ recordsFor(item.kind).length }}</span>
            </button>
          </aside>
          <div class="control-editor">
            <div class="control-toolbar">
              <label
                >{{ t("Dossier", "Record")
                }}<select
                  :value="selectedId"
                  @change="selectRecord($event.target.value)"
                >
                  <option value="">
                    {{ t("Nouveau dossier", "New record") }}
                  </option>
                  <option
                    v-for="item in recordsFor(kind)"
                    :key="item.id"
                    :value="item.id"
                  >
                    {{ recordName(item) }}
                  </option>
                </select></label
              ><button class="bz-btn bz-btn--ghost" @click="reset">
                {{ t("Nouveau", "New") }}</button
              ><label class="bz-btn bz-btn--ghost upload-control"
                ><span class="material-symbols-outlined" aria-hidden="true"
                  >attach_file</span
                >{{ t("Joindre une preuve", "Attach evidence")
                }}<input
                  type="file"
                  accept=".pdf,image/*"
                  :disabled="busy"
                  @change="uploadEvidence"
              /></label>
            </div>
            <p class="control-hint">{{ hints[kind] }}</p>
            <form class="control-form" @submit.prevent="save">
              <label
                v-if="['regulatory', 'monograph'].includes(kind)"
                class="wide"
                >{{ t("Équipement", "Equipment")
                }}<select v-model="assetId" required>
                  <option value="">{{ t("Choisir", "Choose") }}</option>
                  <option
                    v-for="asset in scopedAssets"
                    :key="asset.id"
                    :value="asset.id"
                  >
                    {{ asset.assetCode }} · {{ asset.equipmentType }}
                  </option>
                </select></label
              >
              <div
                v-if="kind === 'monograph' && selectedMetrics"
                class="wide asset-metrics"
              >
                <div v-for="metric in metricValues" :key="metric.label">
                  <span>{{ metric.label }}</span
                  ><strong class="bz-metric">{{ metric.value }}</strong>
                </div>
                <p>
                  {{
                    t(
                      "Sur les 30 derniers jours. Disponibilité et MTBF exigent un calendrier d’ouverture validé.",
                      "Last 30 days. Availability and MTBF require a verified operating calendar.",
                    )
                  }}
                </p>
              </div>
              <template v-for="field in fields" :key="field.key">
                <label
                  v-if="field.type === 'checkbox'"
                  class="control-check"
                  :class="{ wide: field.wide }"
                  ><input
                    v-model="form[field.key]"
                    type="checkbox"
                    role="switch"
                    :aria-checked="!!form[field.key]"
                  />{{ field.label }}</label
                >
                <label v-else :class="{ wide: field.wide }"
                  >{{ field.label }}
                  <select
                    v-if="field.type === 'select'"
                    v-model="form[field.key]"
                    :required="field.required"
                  >
                    <option value="">{{ t("À renseigner", "Not set") }}</option>
                    <option
                      v-for="option in field.options"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <textarea
                    v-else-if="field.type === 'textarea'"
                    v-model="form[field.key]"
                    rows="3"
                    :required="field.required"
                  ></textarea>
                  <input
                    v-else
                    v-model="form[field.key]"
                    :type="field.type || 'text'"
                    :min="field.min"
                    :max="field.max"
                    :required="field.required"
                  />
                </label>
              </template>
              <dl v-if="kind === 'regulatory'" class="wide regulatory-preview">
                <template v-for="due in regulatoryPreview" :key="due.label"
                  ><dt>{{ due.label }}</dt>
                  <dd>
                    {{
                      due.at
                        ? formatDate(due.at)
                        : t(
                            "Dernier contrôle à renseigner",
                            "Last inspection needed",
                          )
                    }}
                  </dd></template
                >
              </dl>
              <fieldset v-if="kind === 'programme'" class="wide">
                <legend>
                  {{ t("Gammes du programme", "Programme checklists") }}
                </legend>
                <label
                  v-for="plan in sitePlans"
                  :key="plan.id"
                  class="control-check"
                  ><input
                    v-model="form.planIds"
                    type="checkbox"
                    :value="plan.id"
                  />{{ plan.name }}</label
                >
                <p v-if="!data.plans?.length">
                  {{
                    t(
                      "Importez ou créez les gammes avant ce programme.",
                      "Import or create maintenance checklists first.",
                    )
                  }}
                </p>
              </fieldset>
              <fieldset v-if="kind === 'policy'" class="wide">
                <legend>
                  {{
                    t(
                      "Points du document à valider",
                      "Document questions to resolve",
                    )
                  }}
                </legend>
                <label v-for="decision in decisions" :key="decision.id"
                  >{{ decision.label
                  }}<textarea
                    v-model="form.decisions[decision.id]"
                    rows="2"
                    :required="form.enabled"
                  ></textarea></label
                ><label
                  >{{
                    t(
                      "Jours ouvrés (1=lundi, 7=dimanche)",
                      "Working days (1=Monday, 7=Sunday)",
                    )
                  }}<input
                    v-model="form.workingDaysText"
                    placeholder="1, 2, 3, 4, 5" /></label
                ><label
                  >{{
                    t(
                      "Jours fériés · une date AAAA-MM-JJ par ligne",
                      "Holidays · one YYYY-MM-DD date per line",
                    )
                  }}<textarea v-model="form.holidaysText" rows="2"></textarea>
                </label>
              </fieldset>
              <fieldset
                v-if="kind === 'field_report' && workChecklist.length"
                class="wide"
              >
                <legend>{{ t("Contrôles prévus", "Planned checks") }}</legend>
                <div
                  v-for="(check, i) in form.checklistChecks"
                  :key="i"
                  class="checklist-row"
                >
                  <label class="control-check"
                    ><input
                      v-model="check.done"
                      type="checkbox"
                      role="switch"
                      :aria-checked="!!check.done"
                    />{{ check.label }}</label
                  ><input
                    v-model="check.note"
                    :aria-label="
                      t('Mesure ou justification', 'Reading or reason') +
                      ' ' +
                      check.label
                    "
                    :placeholder="
                      t(
                        'Mesure ou justification si non réalisé',
                        'Reading or reason if not completed',
                      )
                    "
                  />
                </div>
              </fieldset>
              <label class="control-check wide confirmation"
                ><input
                  v-model="confirmed"
                  type="checkbox"
                  role="switch"
                  :aria-checked="confirmed"
                  required
                />{{
                  t(
                    "Je confirme les informations et les preuves enregistrées.",
                    "I confirm these details and the recorded evidence.",
                  )
                }}</label
              >
              <footer class="wide">
                <button
                  class="bz-btn bz-btn--primary"
                  :disabled="busy || (!siteId && !workOrderId)"
                >
                  {{
                    busy
                      ? t("Enregistrement…", "Saving…")
                      : t("Enregistrer", "Save")
                  }}</button
                ><button
                  v-if="kind === 'programme' && selectedId"
                  type="button"
                  class="bz-btn bz-btn--secondary"
                  :disabled="busy"
                  @click="approve"
                >
                  {{ t("Valider le programme", "Approve programme") }}</button
                ><button
                  v-if="kind === 'monograph' && assetId"
                  type="button"
                  class="bz-btn bz-btn--ghost"
                  :disabled="busy"
                  @click="exportSheet"
                >
                  {{ t("Exporter la fiche", "Export sheet") }}
                </button>
              </footer>
              <CompanyCasework v-if="kind==='monograph' && assetId" class="control-wide" :company-id="companyId" :asset-id="assetId" :assets="data.assets || []" readonly />
            </form>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
<script setup>
import CompanyCasework from './CompanyCasework.vue';
import "./company-design.css";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { i18n } from "../../i18n/index.js";
import { saveDocumentFile } from "../../services/company/gmao.js";
import { monographicHtml } from "../../services/company/maintenanceDocuments.js";
import {
  CONTRACT_AMBIGUITIES,
  regulatoryDates,
} from "../../services/company/maintenanceRules.js";
const props = defineProps({
  companyId: { type: String, required: true },
  workOrderId: String,
  gmao: Object,
});
const emit = defineEmits(["changed", "open-work-order", "open-task"]);
const t = (fr, en) => (i18n.state.locale?.startsWith("fr") ? fr : en);
const data = ref({
    sites: [],
    assets: [],
    plans: [],
    documents: [],
    workOrders: [],
    outbox: [],
  }),
  snapshot = ref({ records: [], obligations: [], workOrders: [] });
const siteId = ref(""),
  assetId = ref(""),
  kind = ref(props.workOrderId ? "field_report" : "policy"),
  selectedId = ref(""),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  confirmed = ref(false),
  form = reactive({ decisions: {}, planIds: [], checklistChecks: [] });
const api = () => {
  const value = window.electronAPI?.db?.gmaoMaintenance;
  if (!value)
    throw new Error(
      t(
        "Redémarrez BonzAI pour activer les contrôles du contrat.",
        "Restart BonzAI to enable contract controls.",
      ),
    );
  return value;
};
const currentWorkOrder = computed(() =>
  data.value.workOrders?.find((w) => w.id === props.workOrderId),
);
const requirements = computed(
  () =>
    snapshot.value.workOrders?.find((w) => w.id === props.workOrderId)
      ?.requirements,
);
const scopedAssets = computed(
  () =>
    data.value.assets?.filter(
      (a) => !siteId.value || a.siteId === siteId.value,
    ) || [],
);
const sitePlans = computed(() =>
  data.value.plans.filter(
    (p) => !p.assetId || scopedAssets.value.some((a) => a.id === p.assetId),
  ),
);
const selectedMetrics = computed(() =>
  snapshot.value.metrics?.find((m) => m.assetId === assetId.value),
);
const metricValues = computed(() => {
  const m = selectedMetrics.value;
  if (!m) return [];
  const n = (value) =>
    value == null
      ? "—"
      : new Intl.NumberFormat(i18n.state.locale, {
          maximumFractionDigits: 1,
        }).format(value);
  return [
    {
      label: t("Disponibilité", "Availability"),
      value: n(m.availabilityPct) + (m.availabilityPct == null ? "" : "%"),
    },
    {
      label: t("Indisponibilité", "Downtime"),
      value: n(m.downtimeHours) + " h",
    },
    {
      label: "MTBF",
      value: n(m.mtbfHours) + (m.mtbfHours == null ? "" : " h"),
    },
    {
      label: "MTTR",
      value: n(m.mttrHours) + (m.mttrHours == null ? "" : " h"),
    },
  ];
});
const regulatoryPreview = computed(() => {
  const dates = regulatoryDates(
    Object.fromEntries(
      ["lastInspectionAt", "lastRequalificationAt", "lastGasServiceAt"].map(
        (key) => [key, form[key] ? new Date(form[key]).getTime() : null],
      ),
    ),
  );
  return form.equipmentFamily === "ESP"
    ? [
        {
          label: t("Inspection · 48 mois", "Inspection · 48 months"),
          at: dates.inspectionDueAt,
        },
        {
          label: t(
            "Requalification · 120 mois",
            "Requalification · 120 months",
          ),
          at: dates.requalificationDueAt,
        },
      ]
    : form.equipmentFamily === "REG"
      ? [
          {
            label: t("Gaz · 12 mois", "Gas inspection · 12 months"),
            at: dates.gasServiceDueAt,
          },
        ]
      : [];
});
const workChecklist = computed(
  () =>
    data.value.plans?.find(
      (p) => p.id === currentWorkOrder.value?.maintenancePlanId,
    )?.checklist || [],
);
const expanded = ref(false),
  showObligations = ref(false);
const scopedRecordCount = computed(
  () =>
    snapshot.value.records.filter(
      (r) =>
        (!siteId.value || r.siteId === siteId.value) &&
        (!props.workOrderId || r.workOrderId === props.workOrderId),
    ).length,
);
const actionable = computed(() =>
  snapshot.value.obligations.filter(
    (r) =>
      r.status !== "sent" &&
      (!props.workOrderId || r.workOrderId === props.workOrderId) &&
      (!siteId.value || !r.siteId || r.siteId === siteId.value) &&
      (!r.dueAt || r.dueAt < Date.now() + 30 * 86400000),
  ),
);
const formatDate = (at) =>
  new Intl.DateTimeFormat(i18n.state.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
const checkLabel = (check) =>
  i18n.state.locale?.startsWith("fr")
    ? check.label
    : {
        access: "Site access and qualifications",
        safety: "Joint inspection and prevention",
        programme: "Approved annual programme",
        notice: "Visit notice sent",
        shutdown: "Approved shutdown window",
      }[check.key] || check.label;
const obligationTitle = (item) =>
  i18n.state.locale?.startsWith("fr")
    ? item.title
    : item.kind === "intervention_report"
      ? "Intervention report · " + item.title
      : item.kind === "annual_access"
        ? "Annual access renewal"
        : item.kind === "periodic_report"
          ? {
              p0_weekly: "Weekly P0 report",
              equipment_weekly: "Weekly equipment report",
              equipment_quarterly: "Quarterly equipment report",
              st1_monthly: "Monthly ST1 report",
              st2_semester: "Half-year ST2 report",
            }[item.key] || "Periodic report"
          : {
              person: "Access / identity / qualification expiry",
              vehicle: "Vehicle document expiry",
              site_safety: "Site safety expiry",
              regulatory: "Equipment inspection due",
            }[item.recordKind] || item.title;
async function openObligation(item) {
  if(item.kind==='casework_followup'){emit('open-work-order',item.workOrderId);return;}
  if (item.kind === "periodic_report") {
    const result = item.issueId
      ? { issueId: item.issueId }
      : await act(() =>
          api().prepareReportTask(props.companyId, {
            siteId: item.siteId,
            reportId: item.reportId,
          }),
        );
    if (result?.issueId) emit("open-task", result.issueId);
    return;
  }
  if (item.workOrderId && !props.workOrderId) {
    emit("open-work-order", item.workOrderId);
    return;
  }
  expanded.value = true;
  if (item.recordId) {
    kind.value = item.recordKind;
    selectRecord(item.recordId);
  } else {
    selectKind("report_delivery");
    form.reportId = item.reportId || "";
  }
}

const allSections = computed(() =>
  [
    ["policy", "rule", t("Exigences", "Requirements")],
    ["person", "badge", t("Intervenants", "People")],
    ["vehicle", "local_shipping", t("Véhicules", "Vehicles")],
    [
      "site_safety",
      "health_and_safety",
      t("Accès et prévention", "Site safety"),
    ],
    ["programme", "event_available", t("Programme annuel", "Annual programme")],
    [
      "regulatory",
      "verified",
      t("Contrôles périodiques", "Periodic inspections"),
    ],
    ["monograph", "description", t("Fiches équipements", "Equipment records")],
    ["field_report", "fact_check", t("Rapport terrain", "Field report")],
    ["signature", "draw", t("Signatures", "Signatures")],
    ["visit_notice", "outgoing_mail", t("Avis de passage", "Visit notice")],
    ["shutdown", "power_settings_new", t("Arrêt planifié", "Planned shutdown")],
    ["reschedule", "event_repeat", t("Déplacement de visite", "Reschedule")],
    [
      "report_delivery",
      "forward_to_inbox",
      t("Rapport transmis", "Report delivery"),
    ],
  ].map(([kind, icon, label]) => ({ kind, icon, label })),
);
const sections = computed(() =>
  allSections.value.filter((x) =>
    props.workOrderId
      ? [
          "field_report",
          "signature",
          "visit_notice",
          "shutdown",
          "reschedule",
          "report_delivery",
        ].includes(x.kind)
      : !["field_report", "signature", "visit_notice", "reschedule"].includes(
          x.kind,
        ),
  ),
);
const hints = computed(() => ({
  policy: t(
    "Activez les règles après validation du contrat et de ses ambiguïtés.",
    "Enable rules after reviewing the contract and resolving its ambiguities.",
  ),
  person: t(
    "Les pièces restent locales. L’autorisation est vérifiée avant le départ sur site.",
    "Documents stay local. Access is checked before dispatch.",
  ),
  vehicle: t(
    "Références et dates de validité du véhicule affecté.",
    "Assigned vehicle documents and expiry dates.",
  ),
  site_safety: t(
    "Pièces validées lors de l’inspection commune et de la préparation de la visite.",
    "Approved joint inspection and prevention documents.",
  ),
  programme: t(
    "Enregistrez le programme, puis joignez l’accord du responsable.",
    "Save the programme, then attach the contract manager’s approval.",
  ),
  regulatory: t(
    "Les prochaines échéances partent des contrôles réalisés et documentés.",
    "Upcoming deadlines use the dates of documented inspections.",
  ),
  monograph: t(
    "Identification, historique et réserves propres à cet équipement.",
    "Equipment identity, history and contract reservations.",
  ),
  field_report: t(
    "Ces éléments rejoignent la feuille terrain lors de son enregistrement.",
    "These details are included when the field visit is recorded.",
  ),
  signature: t(
    "Joignez l’OI signé et identifiez le signataire. Aucun document n’est signé automatiquement.",
    "Attach the signed work order and identify its signer. Documents are not signed automatically.",
  ),
  visit_notice: t(
    "Sélectionnez l’email transmis au moins 15 jours avant la visite.",
    "Select the email sent at least 15 days before the visit.",
  ),
  shutdown: t(
    "Consignez les accords du SID et de l’occupant sur la période d’arrêt.",
    "Record SID and occupant approval for the downtime window.",
  ),
  reschedule: t(
    "Un déplacement du préventif nécessite un accord et une justification.",
    "Rescheduling preventive work requires approval and a reason.",
  ),
  report_delivery: t(
    "Le reçu doit correspondre à un email transmis, avec le rapport joint.",
    "The receipt must identify a submitted email with its report attached.",
  ),
}));
const docs = computed(() =>
  data.value.documents
    .filter((d) => !props.workOrderId || d.workOrderId === props.workOrderId)
    .map((d) => ({ value: d.id, label: d.originalName || d.filename })),
);
const decisions = computed(() =>
  CONTRACT_AMBIGUITIES.map((x) => ({
    ...x,
    label: i18n.state.locale?.startsWith("fr")
      ? x.label
      : {
          report_frequency:
            "Report for installations >12 kW: quarterly or every Thursday (p10)",
          st3_reporting_scope:
            "ST3 report: p23 refers to ventilation and hoods",
          esp_frequency:
            "Pressure equipment: 48-month inspection; historical certificate says 40 or 48 (p22)",
        }[x.id],
  })),
);
const f = (key, fr, en, type = "text", rest = {}) => ({
  key,
  label: t(fr, en),
  type,
  ...rest,
});
const d = (key, fr, en) => f(key, fr, en, "select", { options: docs.value });
const date = (key, fr, en) => f(key, fr, en, "datetime-local");
const fields = computed(
  () =>
    ({
      policy: [
        f("name", "Profil du contrat", "Contract profile", "text", {
          required: true,
        }),
        f(
          "sourceReference",
          "Référence et pages source",
          "Source reference and pages",
          "text",
          { required: true },
        ),
        f("timezone", "Fuseau horaire", "Time zone"),
        f("validatedBy", "Responsable de validation", "Approved by"),
        f(
          "enabled",
          "Activer les contrôles contractuels",
          "Enable contract checks",
          "checkbox",
        ),
        f(
          "calendarValidated",
          "Calendrier ouvré validé",
          "Working calendar verified",
          "checkbox",
        ),
        f(
          "requireAccess",
          "Vérifier les accès",
          "Check site access",
          "checkbox",
        ),
        f(
          "requireSafety",
          "Inspection commune et prévention requises",
          "Require joint inspection and prevention",
          "checkbox",
        ),
        f(
          "requireShutdown",
          "Accord d’arrêt pour le préventif",
          "Require preventive shutdown approval",
          "checkbox",
        ),
        f(
          "vehicleRequired",
          "Documents véhicule requis",
          "Require vehicle documents",
          "checkbox",
        ),
        f(
          "onCallReportHour",
          "Heure du rapport le lendemain matin",
          "Next-morning report hour",
          "number",
          { min: 0, max: 12 },
        ),
        f(
          "equipmentReportCadence",
          "Rapport > 12 kW · fréquence validée",
          "Equipment >12 kW · approved cadence",
          "select",
          {
            options: [
              { value: "weekly", label: t("Hebdomadaire", "Weekly") },
              {
                value: "quarterly",
                label: t(
                  "Trimestriel · fin du trimestre civil",
                  "Quarterly · calendar-quarter end",
                ),
              },
            ],
          },
        ),
        f(
          "periodicReportHour",
          "Heure limite des bilans périodiques",
          "Periodic report cut-off hour",
          "number",
          { min: 0, max: 23 },
        ),
        f(
          "st1MonthlyReport",
          "Bilan ST1 une semaine avant fin de mois",
          "ST1 report one week before month end",
          "checkbox",
        ),
        f(
          "st2SemesterReport",
          "Bilan ST2 une semaine avant fin de semestre",
          "ST2 report one week before half-year end",
          "checkbox",
        ),
        f(
          "openingStartHour",
          "Ouverture du site (heure)",
          "Site opening hour",
          "number",
          { min: 0, max: 23 },
        ),
        f(
          "openingEndHour",
          "Fermeture du site (heure)",
          "Site closing hour",
          "number",
          { min: 1, max: 24 },
        ),
        f("campaignName", "Campagne", "Campaign"),
        f(
          "campaignColor",
          "Couleur validée de la campagne",
          "Approved campaign colour",
        ),
      ],
      person: [
        f("name", "Nom et prénom", "Full name", "text", { required: true }),
        f("birthDate", "Date de naissance", "Date of birth", "date"),
        f("birthPlace", "Lieu de naissance", "Place of birth"),
        f("nationality", "Nationalité", "Nationality"),
        f("employer", "Entreprise", "Employer", "text", { required: true }),
        f("visitPurpose", "Motif de visite", "Visit purpose"),
        f(
          "visitedService",
          "Personne / service visité",
          "Person / service visited",
        ),
        f("identityType", "Pièce d’identité", "Identity type", "select", {
          options: [
            ["passport", t("Passeport", "Passport")],
            ["national_id", t("Carte nationale", "National ID")],
            ["residence_permit", t("Titre de séjour", "Residence permit")],
            ["military_id", t("Carte militaire", "Military ID")],
          ].map(([value, label]) => ({ value, label })),
        }),
        d("identityDocumentId", "Fichier identité", "Identity document"),
        date(
          "identityValidUntil",
          "Identité valable jusqu’au",
          "Identity expires",
        ),
        d("cprDocumentId", "CPR actif complété", "Completed active CPR"),
        date(
          "accessValidUntil",
          "Accès autorisé jusqu’au",
          "Access approved until",
        ),
        f("approvedBy", "Accès validé par", "Access approved by"),
        date(
          "renewalSubmittedAt",
          "Renouvellement annuel transmis",
          "Annual renewal submitted",
        ),
        f(
          "qualificationsText",
          "Habilitations · une par ligne",
          "Qualifications · one per line",
          "textarea",
          { wide: true },
        ),
        d(
          "qualificationsDocumentId",
          "Attestations d’habilitation",
          "Qualification evidence",
        ),
        date(
          "qualificationsValidUntil",
          "Habilitations valables jusqu’au",
          "Qualifications valid until",
        ),
        f("vehicleId", "Véhicule affecté", "Assigned vehicle", "select", {
          options: snapshot.value.records
            .filter((r) => r.kind === "vehicle")
            .map((r) => ({ value: r.id, label: r.data.registration })),
        }),
      ],
      vehicle: [
        f("registration", "Immatriculation", "Registration", "text", {
          required: true,
        }),
        f(
          "trailerRegistration",
          "Immatriculation remorque",
          "Trailer registration",
        ),
        d("registrationDocumentId", "Carte grise", "Registration document"),
        d("inspectionDocumentId", "Contrôle technique", "Inspection document"),
        date(
          "inspectionValidUntil",
          "Contrôle technique valable jusqu’au",
          "Inspection expires",
        ),
        d("insuranceDocumentId", "Assurance", "Insurance document"),
        date(
          "insuranceValidUntil",
          "Assurance valable jusqu’au",
          "Insurance expires",
        ),
        d("pollutionDocumentId", "Contrôle pollution", "Emissions document"),
        date(
          "pollutionValidUntil",
          "Contrôle pollution valable jusqu’au",
          "Emissions test expires",
        ),
      ],
      site_safety: [
        d(
          "jointInspectionDocumentId",
          "Inspection commune",
          "Joint inspection",
        ),
        d("preventionDocumentId", "Plan de prévention", "Prevention plan"),
        f("approvedBy", "Validé par", "Approved by"),
        date("validUntil", "Valable jusqu’au", "Valid until"),
      ],
      programme: [
        f("name", "Programme", "Programme", "text", { required: true }),
        f("year", "Année", "Year", "number", { min: 2020, max: 2100 }),
        f("approvedBy", "Responsable de validation", "Approved by"),
        d("approvalDocumentId", "Accord du responsable", "Manager approval"),
      ],
      regulatory: [
        f("equipmentFamily", "Famille", "Family", "select", {
          options: ["ESP", "REG", "HVAC", "VENTILATION"].map((value) => ({
            value,
            label: value,
          })),
        }),
        date(
          "lastInspectionAt",
          "Dernière inspection ESP",
          "Last pressure inspection",
        ),
        d(
          "inspectionDocumentId",
          "Certificat inspection",
          "Inspection certificate",
        ),
        date(
          "lastRequalificationAt",
          "Dernière requalification ESP",
          "Last pressure requalification",
        ),
        d(
          "requalificationDocumentId",
          "Certificat requalification",
          "Requalification certificate",
        ),
        date("lastGasServiceAt", "Dernier contrôle gaz", "Last gas inspection"),
        d("gasServiceDocumentId", "Rapport gaz", "Gas report"),
        f(
          "createPlans",
          "Créer / actualiser les gammes aux échéances calculées",
          "Create / update checklists at the calculated due dates",
          "checkbox",
          { wide: true },
        ),
      ],
      monograph: [
        f("name", "Nom équipement", "Equipment name", "text", {
          required: true,
        }),
        f("secondaryCode", "Code secondaire", "Secondary code"),
        f("gtpCode", "Code GTP", "GTP code"),
        f("associatedEquipment", "Matériel associé", "Associated equipment"),
        f(
          "minLifetimeYears",
          "Durée de vie minimale (ans)",
          "Minimum life (years)",
          "number",
        ),
        f(
          "maxLifetimeYears",
          "Durée de vie maximale (ans)",
          "Maximum life (years)",
          "number",
        ),
        date("acquiredAt", "Acquisition", "Acquired"),
        date("lastRepairAt", "Dernier dépannage", "Last repair"),
        date("lastWorksAt", "Derniers travaux", "Last works"),
        date("lastLeakAt", "Dernière fuite", "Last leak"),
        f(
          "includedInContract",
          "Inclusion au forfait",
          "Contract inclusion",
          "select",
          {
            options: [
              { value: "yes", label: t("Oui", "Yes") },
              {
                value: "reservations",
                label: t("Avec réserves", "With reservations"),
              },
              { value: "no", label: t("Non", "No") },
            ],
          },
        ),
        f("reservations", "Réserves", "Reservations", "textarea", {
          wide: true,
        }),
        f("comments", "Commentaires", "Comments", "textarea", { wide: true }),
      ],
      field_report: [
        f(
          "siteRepresentative",
          "Représentant du site",
          "Site representative",
          "text",
          { required: true },
        ),
        f(
          "causes",
          "Anomalies et causes constatées",
          "Observed issues and causes",
          "textarea",
          { required: true, wide: true },
        ),
        f(
          "consumables",
          "Consommables utilisés",
          "Consumables used",
          "textarea",
        ),
        f("finalState", "État final", "Final state", "select", {
          required: true,
          options: [
            { value: "operational", label: t("Opérationnel", "Operational") },
            { value: "degraded", label: t("Dégradé", "Degraded") },
            { value: "stopped", label: t("À l’arrêt", "Stopped") },
          ],
        }),
        f(
          "safetyConfirmed",
          "Mise en sécurité réalisée",
          "Site made safe",
          "checkbox",
        ),
        f("userInformed", "Usagers informés", "Users informed", "checkbox"),
        f(
          "registerUpdated",
          "Registre du site mis à jour",
          "Site register updated",
          "checkbox",
        ),
      ],
      signature: [
        f("role", "Signataire", "Signer role", "select", {
          required: true,
          options: [
            { value: "technician", label: t("Technicien", "Technician") },
            {
              value: "contract_manager",
              label: t("Responsable du suivi du contrat", "Contract manager"),
            },
          ],
        }),
        f("name", "Nom du signataire", "Signer name", "text", {
          required: true,
        }),
        d("documentId", "OI signé", "Signed work order"),
        f("evidenceReference", "Référence de signature", "Signature reference"),
      ],
      visit_notice: [
        f("outboxId", "Email transmis", "Submitted email", "select", {
          options: mailOptions.value,
        }),
        d(
          "exceptionDocumentId",
          "Dérogation si préavis < 15 jours",
          "Exception if notice is under 15 days",
        ),
      ],
      shutdown: [
        date("startsAt", "Début de l’arrêt", "Shutdown starts"),
        date("endsAt", "Fin de l’arrêt", "Shutdown ends"),
        f("approvedBy", "Validé par", "Approved by"),
        d("approvalDocumentId", "Accord SID", "SID approval"),
        d("occupantApprovalDocumentId", "Accord occupant", "Occupant approval"),
      ],
      reschedule: [
        date("fromAt", "Date initiale", "Original date"),
        date("toAt", "Nouvelle date", "New date"),
        f("reason", "Motif du déplacement", "Reason for change", "textarea", {
          wide: true,
        }),
        f("approvedBy", "Validé par", "Approved by"),
        d("approvalDocumentId", "Accord DID", "DID approval"),
        d(
          "exceptionDocumentId",
          "Dérogation si préavis < 15 jours",
          "Exception if notice is under 15 days",
        ),
      ],
      report_delivery: [
        ...(!props.workOrderId
          ? [
              f(
                "reportId",
                "Échéance du rapport",
                "Report deadline",
                "select",
                {
                  required: true,
                  options: snapshot.value.obligations
                    .filter(
                      (r) =>
                        r.kind === "periodic_report" &&
                        r.siteId === siteId.value,
                    )
                    .map((r) => ({
                      value: r.reportId,
                      label: obligationTitle(r) + " · " + formatDate(r.dueAt),
                    })),
                },
              ),
            ]
          : []),
        ...(props.workOrderId
          ? [
              f(
                "outboxId",
                "Email avec rapport joint",
                "Email with attached report",
                "select",
                { options: mailOptions.value },
              ),
            ]
          : [
              f(
                "issueId",
                "Tâche et reçu d’envoi",
                "Task and delivery receipt",
                "select",
                {
                  options: snapshot.value.records
                    .filter(
                      (r) =>
                        r.kind === "report_task" &&
                        r.siteId === siteId.value &&
                        r.data.reportId === form.reportId,
                    )
                    .map((r) => ({
                      value: r.data.issueId,
                      label: r.data.reportId,
                    })),
                },
              ),
            ]),
      ],
    })[kind.value] || [],
);
const mailOptions = computed(() =>
  data.value.outbox
    .filter(
      (m) =>
        (!props.workOrderId || m.workOrderId === props.workOrderId) &&
        m.channel === "email" &&
        ["submitted", "delivered"].includes(m.status),
    )
    .map((m) => ({ value: m.id, label: m.subject + " · " + m.recipient })),
);
function recordsFor(type) {
  return snapshot.value.records.filter(
    (r) =>
      r.kind === type &&
      (!siteId.value || !r.siteId || r.siteId === siteId.value) &&
      (!props.workOrderId || r.workOrderId === props.workOrderId),
  );
}
function recordName(r) {
  return (
    r.data.name ||
    r.data.registration ||
    r.data.sourceReference ||
    r.data.equipmentFamily ||
    r.data.approvedBy ||
    new Date(r.updatedAt).toLocaleDateString()
  );
}
function dateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function reset() {
  selectedId.value = "";
  assetId.value = "";
  confirmed.value = false;
  for (const key of Object.keys(form)) delete form[key];
  Object.assign(form, {
    decisions: {},
    planIds: [],
    checklistChecks: workChecklist.value.map((label) => ({
      label,
      done: false,
      note: "",
    })),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    requireAccess: true,
    requireSafety: true,
    requireShutdown: true,
    st1MonthlyReport: true,
    st2SemesterReport: true,
    workingDaysText: "1, 2, 3, 4, 5",
    holidaysText: "",
    year: new Date().getFullYear(),
    fromAt: dateInput(currentWorkOrder.value?.scheduledAt),
  });
}
function selectKind(value) {
  kind.value = value;
  reset();
}
function selectRecord(id) {
  reset();
  if (!id) return;
  const r = snapshot.value.records.find((r) => r.id === id);
  if (!r) return;
  selectedId.value = id;
  assetId.value = r.assetId || "";
  Object.assign(form, JSON.parse(JSON.stringify(r.data)));
  for (const field of fields.value)
    if (field.type === "datetime-local")
      form[field.key] = dateInput(r.data[field.key]);
  form.decisions ||= {};
  form.planIds ||= [];
  form.checklistChecks ||= workChecklist.value.map((label) => ({
    label,
    done: false,
    note: "",
  }));
  form.qualificationsText = (r.data.qualifications || []).join("\n");
  form.workingDaysText = (r.data.workingDays || [1, 2, 3, 4, 5])
    .map((d) => d || 7)
    .join(", ");
  form.holidaysText = (r.data.holidays || []).join("\n");
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [records, gmao] = await Promise.all([
      api().snapshot(props.companyId),
      props.gmao || window.electronAPI.db.gmao.snapshot(props.companyId),
    ]);
    snapshot.value = records;
    data.value = gmao;
    if (props.workOrderId)
      siteId.value =
        gmao.workOrders.find((w) => w.id === props.workOrderId)?.siteId || "";
    else if (!siteId.value && gmao.sites?.length === 1)
      siteId.value = gmao.sites[0].id;
    reset();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
async function act(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await fn();
    await load();
    if (result?.id && snapshot.value.records.some((r) => r.id === result.id))
      selectRecord(result.id);
    notice.value = t("Enregistré.", "Saved.");
    emit("changed");
    return result;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function save() {
  await act(async () => {
    const payload = JSON.parse(JSON.stringify(form));
    for (const field of fields.value)
      if (field.type === "datetime-local")
        payload[field.key] = payload[field.key]
          ? new Date(payload[field.key]).getTime()
          : null;
      else if (field.type === "number")
        payload[field.key] =
          payload[field.key] === "" ? null : Number(payload[field.key]);
    payload.qualifications = String(payload.qualificationsText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    payload.workingDays = String(payload.workingDaysText || "")
      .split(",")
      .map((n) => Number(n.trim()) % 7);
    payload.holidays = String(payload.holidaysText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    delete payload.qualificationsText;
    delete payload.workingDaysText;
    delete payload.holidaysText;
    if (kind.value === "signature")
      return api().signIntervention(props.companyId, {
        ...payload,
        workOrderId: props.workOrderId,
        confirmed: confirmed.value,
      });
    if (kind.value === "report_delivery")
      return api().recordReportDelivery(props.companyId, {
        ...payload,
        siteId: siteId.value,
        workOrderId: props.workOrderId,
      });
    return api().saveRecord(props.companyId, {
      id: selectedId.value || undefined,
      kind: kind.value,
      siteId: siteId.value || undefined,
      assetId: assetId.value || undefined,
      workOrderId: props.workOrderId,
      data: payload,
      confirmed: confirmed.value,
    });
  });
}
async function approve() {
  await act(() =>
    api().approveProgramme(props.companyId, {
      programmeId: selectedId.value,
      approver: form.approvedBy,
      documentId: form.approvalDocumentId,
      confirmed: confirmed.value,
    }),
  );
}
async function uploadEvidence(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const saved = JSON.parse(JSON.stringify(form)),
    id = selectedId.value,
    asset = assetId.value;
  await act(async () =>
    saveDocumentFile(props.companyId, file, {
      siteId: siteId.value || undefined,
      workOrderId: props.workOrderId,
      category: "maintenance_evidence",
    }),
  );
  Object.assign(form, saved);
  selectedId.value = id;
  assetId.value = asset;
  event.target.value = "";
}
async function exportSheet() {
  await act(async () => {
    const result = await api().monographicSheet(props.companyId, assetId.value);
    const html = monographicHtml(result, i18n.state.locale);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiche-${result.asset.asset_code}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
let refreshTimer, clockTimer;
const unsubscribers = [];
async function refreshEvidence() {
  if (busy.value || loading.value) return;
  const companyId = props.companyId;
  try {
    const [next, workspace] = await Promise.all([
      api().snapshot(companyId),
      props.gmao || window.electronAPI.db.gmao.snapshot(companyId),
    ]);
    if (companyId !== props.companyId) return;
    snapshot.value = next;
    data.value = workspace;
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(() => {
  load();
  const changed = (event) => {
    if (event?.companyId && event.companyId !== props.companyId) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshEvidence, 100);
  };
  for (const namespace of ["gmaoMaintenance", "gmao"]) {
    const unsubscribe =
      window.electronAPI?.db?.[namespace]?.onChanged?.(changed);
    if (typeof unsubscribe === "function") unsubscribers.push(unsubscribe);
  }
  clockTimer = setInterval(refreshEvidence, 60000);
});
onUnmounted(() => {
  clearTimeout(refreshTimer);
  clearInterval(clockTimer);
  unsubscribers.forEach((fn) => fn());
});
watch(() => props.companyId, load);
watch(
  () => props.workOrderId,
  () => {
    kind.value = props.workOrderId ? "field_report" : "policy";
    load();
  },
);
watch(siteId, reset);
</script>
<style scoped>
.maintenance-controls {
  color: var(--bz-fg);
  padding: 24px 0;
  border-bottom: 1px solid var(--bz-border);
  font-size: 14px;
}
.control-heading {
  display: flex;
  align-items: end;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.control-heading > div {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: auto;
  align-self: center;
}
.control-heading > button { min-height: 44px; }
.control-heading h2 {
  font-size: 24px;
  line-height: 1.15;
  margin: 0;
}
.control-heading .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-accent);
}
.control-heading > label {
  min-width: 220px;
}
.controls-disclosure {
  border-top: 1px solid var(--bz-border);
}
.controls-disclosure > summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  list-style: none;
  padding: 16px 0;
  color: var(--bz-fg);
  font-weight: 600;
}
.controls-disclosure > summary::-webkit-details-marker {
  display: none;
}
.controls-disclosure > summary .bz-metric {
  margin-left: auto;
  color: var(--bz-fg-mid);
}
.controls-disclosure .expand-icon {
  font-size: 20px;
}
.controls-disclosure[open] .expand-icon {
  transform: rotate(180deg);
}
.controls-disclosure[open] > .control-workspace {
  padding-top: 12px;
}
.control-workspace {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.control-sections {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.control-sections button {
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: var(--bz-radius-md, 10px);
  padding: 10px 12px;
  background: transparent;
  color: var(--bz-fg-mid);
  text-align: left;
}
.control-sections button.selected {
  background: var(--bz-accent-soft);
  border-color: var(--bz-accent);
  color: var(--bz-fg);
}
.control-sections button:hover {
  background: var(--bz-raised);
}
.control-sections .bz-metric {
  margin-left: auto;
}
.control-sections .material-symbols-outlined {
  font-size: 22px;
  flex: none;
}
.control-toolbar {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.control-toolbar label {
  flex: 1;
}
.control-toolbar > label:first-child {
  min-width: 200px;
}
.control-toolbar .upload-control {
  flex: none;
  position: relative;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
}
.upload-control input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
}
.upload-control:focus-within {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.control-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
}
.wide {
  grid-column: 1/-1;
}
label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  line-height: 1.45;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
input,
select,
textarea {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--bz-border);
  background: var(--bz-panel);
  border-radius: var(--bz-radius-md, 10px);
  color: var(--bz-fg);
  padding: 10px 12px;
  font: inherit;
}
textarea {
  resize: vertical;
  line-height: 1.55;
}
.control-check {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  color: var(--bz-fg);
}
.control-check input {
  appearance: none;
  width: 36px;
  height: 22px;
  min-height: 22px;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-panel);
  border-radius: 999px;
  position: relative;
  flex: none;
  margin: 0;
  padding: 0;
  cursor: pointer;
}
.control-check input::before {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: var(--bz-fg-mid);
  transition: transform 0.15s;
}
.control-check input:checked {
  background: var(--bz-accent);
}
.control-check input:checked::before {
  transform: translateX(14px);
  background: var(--bz-on-accent, #fff);
}
.control-check:has(input:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

fieldset {
  border: 0;
  border-top: 1px solid var(--bz-border);
  margin: 8px 0 0;
  padding: 18px 0 0;
  display: grid;
  gap: 14px;
}
legend {
  font-weight: 600;
  color: var(--bz-fg);
  padding-right: 12px;
}
.confirmation {
  border-top: 1px solid var(--bz-border);
  padding-top: 20px;
  margin-top: 4px;
}
footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.control-hint {
  color: var(--bz-fg-mid);
  line-height: 1.6;
  margin: 0 0 24px;
  max-width: 75ch;
}
.control-error,
.control-notice {
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-left: 3px solid var(--bz-danger);
  border-radius: 10px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.control-error {
  color: var(--bz-danger);
}
.control-notice {
  border-left-color: var(--bz-success);
  color: var(--bz-fg);
}
.control-empty {
  padding: 32px 0;
  color: var(--bz-fg-mid);
}
.requirement-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}
.requirement {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border: 1px solid var(--bz-border);
  border-radius: 24px;
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.requirement .material-symbols-outlined {
  font-size: 18px;
  color: var(--bz-warning);
}
.requirement.complete .material-symbols-outlined {
  color: var(--bz-success);
}
.requirement-note {
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.obligation-preview {
  margin: 0 0 12px;
  border-top: 1px solid var(--bz-border);
}
.obligation-summary {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: transparent;
  border: 0;
  color: var(--bz-fg);
  padding: 14px 0;
}
.obligation-summary > strong {
  margin-left: auto;
}
.obligations {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  max-height: 290px;
  overflow: auto;
}
.obligations li + li {
  border-top: 1px solid var(--bz-border);
}
.obligations button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--bz-fg);
}
.obligations button:hover {
  background: var(--bz-raised);
}
.obligations small {
  display: block;
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin-top: 5px;
}
.obligation-state {
  margin-left: auto;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.obligation-state.late,
.obligation-state.missing {
  color: var(--bz-warning);
}
.report-alert {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--bz-warning);
  padding: 12px 0 18px;
}
.report-alert strong {
  margin-left: 10px;
}
.asset-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding: 16px 0;
  border-block: 1px solid var(--bz-border);
}
.asset-metrics > div {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-metrics span {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.asset-metrics strong {
  font-size: 23px;
}
.asset-metrics p {
  grid-column: 1/-1;
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin: 0;
}
.regulatory-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0;
  padding: 14px 0;
  border-top: 1px solid var(--bz-border);
  font-size: 13px;
}
.regulatory-preview dd {
  margin: 0;
}
.regulatory-preview dt {
  color: var(--bz-fg-mid);
}
.checklist-row {
  display: grid;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--bz-border);
}
:is(button, input, select, textarea, summary):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.embedded .control-heading h2 {
  font-size: 21px;
}
.embedded .control-workspace {
  grid-template-columns: 190px minmax(0, 1fr);
}
@media (max-width: 800px) {
  .control-workspace,
  .embedded .control-workspace {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .control-sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .control-sections button {
    font-size: 12px;
  }
  .control-heading > label {
    flex: 1;
  }
  .control-form {
    gap: 16px;
  }
  .control-heading h2 {
    font-size: 22px;
  }
}
@media (max-width: 480px) {
  .asset-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .control-form {
    grid-template-columns: 1fr;
  }
  .control-heading {
    gap: 12px;
  }
  .control-heading > label {
    flex-basis: 100%;
  }
  .control-toolbar {
    flex-wrap: wrap;
  }
  .control-toolbar > label:first-child {
    flex-basis: 100%;
  }
  .maintenance-controls {
    padding: 18px 0;
  }
  .control-heading h2 {
    font-size: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }
}
</style>
