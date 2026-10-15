<template>
  <section data-i18n-skip class="maintenance-settings company-screen" :aria-label='ui("Réglages maintenance")'>
    <div class="company-settings-layout">
    <nav class="company-settings-nav" :aria-label='ui("Réglages opérationnels")'>
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ selected: view === tab.id }"
        :aria-current="view === tab.id ? 'page' : undefined"
        @click="view = tab.id"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{
          tab.icon
        }}</span
        >{{ tab.label
        }}<span class="bz-metric">{{ rowsFor(tab.id).length }}</span>
      </button>
    </nav>
    <div class="company-settings-content">
    <header class="settings-section-heading"><h2>{{ current.label }}</h2><span class="bz-metric">{{ rowsFor(view).length }}</span></header>
    <p v-if="notice" class="settings-notice" :class="{ error }" role="status">
      {{ notice }}
    </p>
    <div class="settings-toolbar">
      <label class="settings-search"
        ><span class="material-symbols-outlined" aria-hidden="true">search</span
        ><input
          v-model="query"
          :placeholder="ui('Rechercher dans {section}', {section:current.label.toLowerCase()})"
          :aria-label='ui("Rechercher dans les réglages")' /></label
      ><button
        v-if="view === 'assets'"
        class="bz-btn bz-btn--ghost"
        :disabled="busy"
        @click="run(() => store.exportGmaoInventory())"
      >{{ ui("Exporter") }}</button
      ><label v-if="view === 'assets'" class="bz-btn bz-btn--ghost"
        >{{ ui("Importer") }}<input
          class="sr-only"
          type="file"
          accept=".xls,.xlsx,.xlsm,.csv"
          :disabled="busy"
          @change="readInventory" /></label
      ><label v-if="view === 'plans'" class="bz-btn bz-btn--ghost">{{ mt('Importer les gammes','Import checklists') }}<input class="sr-only" type="file" accept=".xls,.xlsx,.xlsm" :disabled="busy" @change="readPlans" /></label><button
        class="bz-btn bz-btn--primary"
        :disabled="busy"
        @click="edit(current.type)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">add</span
        >{{ current.add }}
      </button>
    </div>
    <p v-if="view === 'rates'" class="settings-hint">{{ ui("Tarifs de référence de l’entreprise. Les conditions et la TVA sont à vérifier pour chaque contrat et chaque devis.") }}</p>
    <div v-if="visibleRows.length" class="settings-list">
      <button
        v-for="row in visibleRows.slice(0, limit)"
        :key="row.id"
        class="settings-row"
        @click="edit(current.type, row)"
      >
        <span
          class="settings-row-icon material-symbols-outlined"
          aria-hidden="true"
          >{{ current.icon }}</span
        ><span class="settings-row-main"
          ><strong>{{ rowTitle(row) }}</strong
          ><small>{{ rowDetail(row) }}</small></span
        ><span
          class="settings-row-value"
          :class="{ 'bz-metric': view === 'rates' }"
          >{{ rowValue(row) }}</span
        ><span class="material-symbols-outlined" aria-hidden="true"
          >chevron_right</span
        >
      </button>
      <button
        v-if="visibleRows.length > limit"
        class="bz-btn bz-btn--ghost"
        @click="limit += 30"
      >{{ ui("Voir les") }}{{ Math.min(30, visibleRows.length - limit) }}{{ ui("suivants") }}</button>
    </div>
    <div v-else class="settings-empty">
      <span class="material-symbols-outlined" aria-hidden="true">{{
        current.icon
      }}</span>
      <h3>{{ query ? ui("Aucun résultat.") : current.empty }}</h3>
      <p>
        {{
          query ? ui("Essayez un autre nom ou une autre référence.") : current.hint
        }}
      </p>
      <button
        v-if="!query"
        class="bz-btn bz-btn--ghost"
        @click="edit(current.type)"
      >
        {{ current.add }}
      </button>
    </div>
    </div>
    </div>
    <GmaoDialog
      v-if="editor"
      :title="editor.id ? ui('Modifier') : current.add"
      :busy="busy"
      @close="editor = null"
    >
      <form class="settings-form" @submit.prevent="save">
        <template v-for="field in fields" :key="field.key"
          ><label
            :class="{ wide: field.wide, check: field.type === 'checkbox' }"
            >{{ field.label }}
            <textarea
              v-if="field.type === 'textarea'"
              v-model="form[field.key]"
              rows="4"
              :required="field.required"
            ></textarea>
            <select
              v-else-if="field.options"
              v-model="form[field.key]"
              :required="field.required"
            >
              <option v-if="!field.required" value="">{{ ui("Non rattaché") }}</option>
              <option v-else value="" disabled>{{ ui("Choisir") }}</option>
              <option
                v-for="opt in field.options"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <input
              v-else-if="field.type === 'checkbox'"
              v-model="form[field.key]"
              type="checkbox"
            />
            <input
              v-else
              v-model="form[field.key]"
              :type="field.type || 'text'"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :required="field.required"
            /> </label
        ></template>
        <dl v-if="editor.type === 'asset' && form.metadata?.inventorySource" class="wide inventory-source">
          <dt>{{ ui('Source inventaire') }}</dt><dd>{{ form.metadata.inventorySource.filename }} · {{ form.metadata.inventorySource.sheet }} · {{ ui('Ligne') }} {{ form.metadata.inventorySource.row }}</dd>
          <dt>{{ ui('Fluide') }}</dt><dd>{{ form.metadata.fluid || ui('Non renseigné') }}</dd>
          <dt>{{ ui('Longueur réseau (m)') }}</dt><dd>{{ form.metadata.networkLengthMeters ?? ui('Non renseigné') }}</dd>
          <dt>{{ ui('Mise en service (source)') }}</dt><dd>{{ form.metadata.commissionedAtSource || ui('Non renseigné') }}</dd>
          <dt>{{ ui('Prochaine requalification (source)') }}</dt><dd>{{ form.metadata.nextRequalificationSource || ui('Non renseigné') }}</dd>
          <template v-if="form.metadata.parentAssetCode"><dt>{{ ui('Équipement parent') }}</dt><dd>{{ form.metadata.parentAssetCode }}</dd></template>
        </dl>
        <p v-if="editor.type === 'asset'" class="wide settings-hint">{{ ui("Les indices de santé restent « non évalués » tant qu’aucune analyse n’a été effectuée.") }}</p>
        <p v-if="editor.type === 'compliance'" class="wide settings-hint">{{ ui("Indiquez une pièce ou une référence vérifiable avant de déclarer l’exigence valide.") }}</p>
        <p v-if="error" class="wide settings-notice error" role="alert">
          {{ notice }}
        </p>
        <footer class="wide">
          <button
            type="button"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="editor = null"
          >{{ ui("Annuler") }}</button
          ><button class="bz-btn bz-btn--primary" :disabled="busy">
            {{ busy ? ui("Enregistrement…") : ui("Enregistrer") }}
          </button>
        </footer>
      </form>
    </GmaoDialog>
    <GmaoDialog
      v-if="importRows"
      :title='ui("Vérifier l’inventaire")'
      :busy="busy"
      @close="importRows = null"
      ><p>
        {{ importRows.length }}{{ ui("équipement(s) prêts à rejoindre des sites existants. Aucun site ni client ne sera créé automatiquement.") }}</p>
      <ul class="import-preview">
        <li v-for="(row, i) in importRows.slice(0, 30)" :key="i">
          <strong>{{ row.assetCode || row.equipmentType }}</strong> ·
          {{ siteName(row.siteId) }} · {{ row.equipmentType }}
          <small>{{ row.metadata?.inventorySource?.sheet }} · {{ ui('Ligne') }} {{ row.metadata?.inventorySource?.row }} · {{ row.buildingCode }} {{ row.buildingName }}</small>
          <small v-if="!row.metadata?.inventorySource?.referenceProvided">{{ ui('Référence interne créée ; numéro équipement absent de la source.') }}</small>
        </li>
      </ul>
      <p v-if="importRows.length > 30">{{ ui("Et") }}{{ importRows.length - 30 }}{{ ui("autres équipements.") }}</p>
      <p v-if="error" class="settings-notice error" role="alert">
        {{ notice }}
      </p>
      <footer>
        <button
          class="bz-btn bz-btn--ghost"
          :disabled="busy"
          @click="importRows = null"
        >{{ ui("Annuler") }}</button
        ><button
          class="bz-btn bz-btn--primary"
          :disabled="busy"
          @click="confirmImport"
        >{{ ui("Importer cet inventaire") }}</button>
      </footer></GmaoDialog
    >
    <GmaoDialog v-if="planImportRows" :title="mt('Vérifier et affecter les gammes','Review and assign checklists')" :busy="busy" @close="planImportRows=null">
      <p>{{ mt('Chaque fréquence conserve ses opérations. Affectez les équipements et la première échéance réelle. Les opérations selon besoin restent conditionnelles.','Each frequency retains its operations. Assign equipment and the first actual due date. On-condition operations remain conditional.') }}</p>
      <form @submit.prevent="confirmPlans">
        <section v-for="(plan,index) in planImportRows" :key="index" class="plan-import-row">
          <h3><label class="plan-include"><input v-model="plan.include" type="checkbox" role="switch" :aria-checked="!!plan.include" />{{ plan.name }}</label> <span class="bz-metric">{{ plan.periodicityMonths ? plan.periodicityMonths + mt(' mois',' months') : plan.periodicityDays ? plan.periodicityDays + mt(' jours',' days') : mt('Selon besoin','On condition') }}</span></h3>
          <p>{{ plan.source.sheet }} · {{ plan.checklist.length }} {{ mt('opérations','operations') }}</p>
          <details><summary>{{ mt('Consulter les opérations','Read operations') }}</summary><ol><li v-for="(operation,i) in plan.operations" :key="i">{{ operation.label }}<small v-if="operation.notes">{{ operation.notes }}</small></li></ol></details>
          <label v-if="plan.include">{{ mt('Équipements affectés','Assigned equipment') }}<select v-model="plan.assetIds" multiple required><option v-for="asset in (data.assets || []).filter(a=>a.technicalSection===plan.technicalSection)" :key="asset.id" :value="asset.id">{{ siteName(asset.siteId) }} · {{ asset.assetCode }} · {{ asset.equipmentType }}</option></select></label>
          <label v-if="plan.include && !plan.conditionBased">{{ mt('Première échéance','First due date') }}<input v-model="plan.dueDate" type="date" required /></label>
        </section>
        <p v-if="error" role="alert" class="settings-notice error">{{ notice }}</p><footer><button type="button" class="bz-btn bz-btn--ghost" @click="planImportRows=null">{{ ui('Annuler') }}</button><button class="bz-btn bz-btn--primary" :disabled="busy">{{ mt('Importer les gammes affectées','Import assigned checklists') }}</button></footer>
      </form>
    </GmaoDialog>
  </section>
</template>
<script setup>
import "./company-design.css";
import { readMaintenanceFile } from "../../services/company/maintenanceImport.js";
import { readInventoryFile } from "../../services/company/inventoryImport.js";
import { i18n } from "../../i18n/index.js";
import { operationText } from "../../i18n/operations.js";
const mt=(fr,en)=>i18n.state.locale?.startsWith('fr')?fr:en;
const ui = (source,params) => operationText(source, i18n.state.locale, params);
import { computed, reactive, ref, watch } from "vue";
import {useCompanyDraft} from "../../services/company/viewDrafts.js";
import GmaoDialog from "./GmaoDialog.vue";
import { HVAC_DOMAIN_CODES } from "../../services/company/gmaoDomain.js";
const props = defineProps({ gmao: Object, store: Object, initialView: String });
const store = props.store,
  data = computed(() => props.gmao || {});
const tabs = [
  {
    id: "assets",
    type: "asset",
    get label() { return ui("Équipements"); },
    get singular() { return ui("l’équipement"); },
    icon: "precision_manufacturing",
    get add() { return ui("Ajouter un équipement"); },
    get empty() { return ui("Aucun équipement"); },
    get hint() { return ui("Rattachez les équipements aux sites de vos clients, ou importez un inventaire."); },
  },
  {
    id: "plans",
    type: "plan",
    get label() { return ui("Préventif"); },
    singular: "la gamme",
    icon: "event_repeat",
    get add() { return ui("Créer une gamme"); },
    get empty() { return ui("Aucune gamme préventive"); },
    get hint() { return ui("Une gamme définit les contrôles, les équipements concernés et la fréquence des visites."); },
  },
  {
    id: "compliance",
    type: "compliance",
    get label() { return ui("Accès & conformité"); },
    singular: "l’exigence",
    icon: "verified_user",
    get add() { return ui("Ajouter une exigence"); },
    get empty() { return ui("Aucune exigence"); },
    get hint() { return ui("Suivez les autorisations, les contrôles et leurs dates de validité."); },
  },
  {
    id: "onCall",
    type: "onCall",
    get label() { return ui("Astreintes"); },
    singular: "l’astreinte",
    icon: "support_agent",
    get add() { return ui("Planifier une astreinte"); },
    get empty() { return ui("Aucune astreinte"); },
    get hint() { return ui("Précisez qui est joignable, sur quelle période et pour quel site."); },
  },
  {
    id: "rates",
    type: "rate",
    get label() { return ui("Tarifs"); },
    singular: "le tarif",
    icon: "request_quote",
    get add() { return ui("Ajouter un tarif"); },
    get empty() { return ui("Aucun tarif"); },
    get hint() { return ui("Définissez vos montants, franchises et coefficients de référence."); },
  },
  {
    id: "suppliers",
    type: "supplier",
    get label() { return ui("Fournisseurs"); },
    singular: "le fournisseur",
    icon: "inventory_2",
    get add() { return ui("Ajouter un fournisseur"); },
    get empty() { return ui("Aucun fournisseur"); },
    get hint() { return ui("Conservez leurs contacts et références pour les demandes achats."); },
  },
  {
    id: "subcontractors",
    type: "subcontractor",
    get label() { return ui("Sous-traitants"); },
    singular: "le sous-traitant",
    icon: "engineering",
    get add() { return ui("Ajouter un sous-traitant"); },
    get empty() { return ui("Aucun sous-traitant"); },
    get hint() { return ui("Suivez les déclarations, validations et autorisations de paiement."); },
  },
];
const view = ref(
    tabs.some((t) => t.id === props.initialView) ? props.initialView : "assets",
  ),
  query = ref(""),
  limit = ref(30),
  busy = ref(false),
  notice = ref(""),
  error = ref(false),
  editor = ref(null),
  form = reactive({}),
  importRows = ref(null), planImportRows = ref(null);
useCompanyDraft(() => (props.store.state?.activeId || data.value.contract?.companyId || '') + ':operations', {view,editor,form,importRows,planImportRows});
const current = computed(() => tabs.find((t) => t.id === view.value)),
  rowsFor = (id) => data.value[id] || [];
const siteName = (id) =>
  (data.value.sites || []).find((s) => s.id === id)?.name || ui("Tous les sites");
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString(i18n.state.locale) : ui("À définir");
const money = (c) =>
  new Intl.NumberFormat(i18n.state.locale, { style: "currency", currency: "EUR" }).format(
    Number(c || 0) / 100,
  );
const rowTitle = (r) =>
  ({
    assets: r.assetCode
      ? `${r.assetCode} · ${r.equipmentType}`
      : r.equipmentType,
    plans: r.name,
    compliance: r.subjectName,
    onCall: r.personName,
    rates: r.label,
    suppliers: r.name,
    subcontractors: r.name,
  })[view.value];
const rowDetail = (r) =>
  ({
    assets: `${siteName(r.siteId)} · ${r.brand || ""} ${r.modelReference || ""}`,
    plans: `${r.equipmentType || ui("Tous les types")} · ${r.technicalSection} · ${ui("Tous les {count} mois", {count:r.periodicityMonths})}`,
    compliance: `${r.recordType} · ${siteName(r.siteId)}`,
    onCall: `${r.phone} · ${siteName(r.siteId)}`,
    rates: `${r.rateType} · ${r.technicalSection || ui("Toutes les sections")}`,
    suppliers: [r.email, r.phone, r.reference].filter(Boolean).join(" · "),
    subcontractors: r.registration || ui("Immatriculation à compléter"),
  })[view.value];
const rowValue = (r) =>
  ({
    assets: r.lastRiskEvaluatedAt
      ? ui("Score estimé : {score}/100", {score:r.healthScore})
      : ui("Non évalué"),
    plans: fmtDate(r.nextDueAt),
    compliance:
      {
        get valid() { return ui("Valide"); },
        get pending() { return ui("À obtenir"); },
        get rejected() { return ui("Refusée"); },
        get expired() { return ui("Expirée"); },
        get expiring() { return ui("À renouveler"); },
      }[r.effectiveStatus||r.status] || r.effectiveStatus || r.status,
    onCall: `${fmtDate(r.startsAt)} → ${fmtDate(r.endsAt)}`,
    rates:
      r.rateType === "coefficient"
        ? `× ${r.coefficient}`
        : r.included
          ? ui("Inclus")
          : money(r.amountCents),
    get suppliers() { return ui("Contact"); },
    subcontractors: r.dc4Status === "valid" ? ui("DC4 validé") : ui("DC4 à vérifier"),
  })[view.value];
const visibleRows = computed(() =>
  rowsFor(view.value).filter((r) =>
    `${rowTitle(r)} ${rowDetail(r)}`
      .toLocaleLowerCase()
      .includes(query.value.toLocaleLowerCase()),
  ),
);
watch(view, () => {
  query.value = "";
  limit.value = 30;
});
const options = (values) => values.map((v) => ({ value: v, label: v }));
const field = (key, label, rest = {}) => ({ key, label, ...rest });
const fields = computed(() => {
  const sites = {
    options: (data.value.sites || [])
      .filter((s) => s.active !== false)
      .map((s) => ({ value: s.id, label: s.name })),
  };
  const section = field("technicalSection", ui("Section"), {
    options: options(["ST1", "ST2", "ST3"]),
    required: true,
  });
  return (
    {
      asset: [
        field("siteId", ui("Site"), { ...sites, required: true }),
        field("assetCode", ui("Référence équipement")),
        field("equipmentType", ui("Type d’équipement"), {
          required: true,
          wide: true,
        }),
        section,
        field("domainCode", ui("Domaine"), {
          options: Object.entries(HVAC_DOMAIN_CODES).map(([value, label]) => ({
            value,
            label,
          })),
        }),
        field("buildingCode", ui("N° bâtiment")),
        field("buildingName", ui("Bâtiment")),
        field("occupant", ui("Occupant")),
        field("brand", ui("Marque")),
        field("modelReference", ui("Modèle")),
        field("serialNumber", ui("Numéro de série")),
        field("condition", ui("État"), {
          options: [
            { value: "unknown", get label() { return ui("Non renseigné"); } },
            { value: "1", get label() { return ui("Bon"); } },
            { value: "2", get label() { return ui("À surveiller"); } },
            { value: "3", get label() { return ui("Dégradé"); } },
            { value: "out_of_service", get label() { return ui("Hors service"); } },
          ],
          required: true,
        }),
        field("criticality", ui("Criticité"), {
          options: options(["P0", "P1", "P2", "P3", "P4"]),
          required: true,
        }),
        field("photoRef", ui("Référence photo"), {
          required: form.condition === "3",
        }),
        field("comments", ui("Notes"), { type: "textarea", wide: true }),
      ],
      plan: [
        field("name", ui("Nom de la gamme"), { required: true, wide: true }),
        section,
        field("equipmentType", ui("Type exact d’équipement (vide = tous)")),
        field("periodicityMonths", ui("Fréquence en mois"), {
          type: "number",
          min: 1,
          max: 120,
          required: true,
        }),
        field("nextDueAt", ui("Prochaine visite"), {
          type: "date",
          required: true,
        }),
        field("checklist", ui("Contrôles à effectuer — un par ligne"), {
          type: "textarea",
          required: true,
          wide: true,
        }),
        field("evidenceRequirements", ui("Preuves attendues — une par ligne"), {
          type: "textarea",
          wide: true,
        }),
        field("active", ui("Gamme active"), { type: "checkbox" }),
      ],
      compliance: [
        field("recordType", ui("Type"), {
          options: options([
            "ACCESS",
            "CPR",
            "VIC",
            "PDP",
            "DC4",
            "REGULATORY",
            "LAB",
            "DOCUMENT_DUE",
          ]),
          required: true,
        }),
        field("subjectName", ui("Personne, site ou équipement"), {
          required: true,
        }),
        field("siteId", ui("Site"), sites),
        field("status", ui("État"), {
          options: [
            { value: "pending", get label() { return ui("À obtenir"); } },
            { value: "valid", get label() { return ui("Valide"); } },
            { value: "rejected", get label() { return ui("Refusé"); } },
          ],
          required: true,
        }),
        field("validUntil", ui("Valide jusqu’au"), { type: "date" }),
        field("notes", ui("Référence de preuve et notes"), {
          type: "textarea",
          required: form.status === "valid",
          wide: true,
        }),
      ],
      onCall: [
        field("personName", ui("Intervenant"), { required: true }),
        field("phone", ui("Téléphone"), { type: "tel", required: true }),
        field("siteId", ui("Site"), sites),
        field("startsAt", ui("Début"), { type: "datetime-local", required: true }),
        field("endsAt", ui("Fin"), { type: "datetime-local", required: true }),
        field("notes", ui("Consignes"), { type: "textarea", wide: true }),
      ],
      rate: [
        field("label", ui("Libellé"), { required: true, wide: true }),
        field("technicalSection", ui("Section"), {
          options: options(["ST1", "ST2", "ST3"]),
        }),
        field("rateType", ui("Type"), {
          options: options([
            "bpu",
            "parts",
            "labor",
            "travel",
            "access",
            "franchise",
            "coefficient",
          ]),
          required: true,
        }),
        field(
          "value",
          form.rateType === "coefficient" ? ui("Coefficient") : ui("Montant HT (€)"),
          { type: "number", min: 0, step: "0.01", required: true },
        ),
        field("vatRate", "TVA (%)", {
          type: "number",
          min: 0,
          max: 100,
          step: "0.01",
          required: true,
        }),
        field("included", ui("Inclus au contrat"), { type: "checkbox" }),
      ],
      supplier: [
        field("name", ui("Nom du fournisseur"), { required: true, wide: true }),
        field("email", ui("Email"), { type: "email" }),
        field("phone", ui("Téléphone"), { type: "tel" }),
        field("reference", ui("Référence fournisseur")),
        field("notes", ui("Notes"), { type: "textarea", wide: true }),
      ],
      subcontractor: [
        field("name", ui("Raison sociale"), { required: true, wide: true }),
        field("registration", ui("Immatriculation")),
        field("dc4Status", ui("Déclaration DC4"), {
          options: [
            { value: "missing", get label() { return ui("Manquante"); } },
            { value: "pending", get label() { return ui("À valider"); } },
            { value: "valid", get label() { return ui("Validée"); } },
          ],
          required: true,
        }),
        field("declared", ui("Déclaré au client"), { type: "checkbox" }),
        field("paymentApproved", ui("Paiement autorisé"), { type: "checkbox" }),
      ],
    }[editor.value?.type] || []
  );
});
function inputDate(v, time = false) {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, time ? 16 : 10);
}
function edit(type, row = {}) {
  notice.value = "";
  error.value = false;
  editor.value = { type, id: row.id };
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, {
    technicalSection: "ST1",
    domainCode: "IFC",
    condition: "2",
    criticality: "P2",
    periodicityMonths: 6,
    active: true,
    recordType: "ACCESS",
    status: "pending",
    rateType: "bpu",
    vatRate: 0,
    value: 0,
    dc4Status: "missing",
    ...row,
  });
  for (const k of ["checklist", "evidenceRequirements"])
    form[k] = (row[k] || []).join("\n");
  for (const k of ["nextDueAt", "validUntil"]) form[k] = inputDate(row[k]);
  for (const k of ["startsAt", "endsAt"]) form[k] = inputDate(row[k], true);
  if (type === "rate")
    form.value =
      row.rateType === "coefficient"
        ? row.coefficient
        : (row.amountCents || 0) / 100;
}
async function run(fn, message) {
  if (busy.value) return;
  busy.value = true;
  error.value = false;
  notice.value = "";
  try {
    const result = await fn();
    notice.value = message || "";
    return { result };
  } catch (e) {
    error.value = true;
    notice.value = e.message || ui("Enregistrement impossible.");
  } finally {
    busy.value = false;
  }
}
async function save() {
  const payload = { ...form };
  for (const k of ["siteId", "documentId"]) if (!payload[k]) payload[k] = null;
  for (const k of ["nextDueAt", "validUntil", "startsAt", "endsAt"])
    payload[k] = payload[k] ? new Date(payload[k]).getTime() : null;
  for (const k of ["checklist", "evidenceRequirements"])
    payload[k] = String(payload[k] || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  payload.periodicityMonths = Number(payload.periodicityMonths);
  payload.vatRate = Number(payload.vatRate);
  if (editor.value.type === "rate") {
    payload.amountCents =
      payload.rateType === "coefficient"
        ? null
        : Math.round(Number(payload.value) * 100);
    payload.coefficient =
      payload.rateType === "coefficient" ? Number(payload.value) : null;
  }
  const method = {
    asset: "saveGmaoAsset",
    plan: "saveGmaoPlan",
    compliance: "saveGmaoCompliance",
    onCall: "saveGmaoOnCallShift",
    rate: "saveGmaoRate",
    supplier: "saveGmaoSupplier",
    subcontractor: "saveGmaoSubcontractor",
  }[editor.value.type];
  if (await run(() => store[method](payload), ui("Enregistré.")))
    editor.value = null;
}
async function readPlans(event){const file=event.target.files?.[0];if(!file)return;await run(async()=>{planImportRows.value=(await readMaintenanceFile(file)).map(plan=>({...plan,include:false}));});event.target.value='';}
async function confirmPlans(){const done=await run(async()=>{const api=window.electronAPI?.db?.gmaoMaintenance;if(!api)throw new Error(mt('Redémarrez BonzAI pour importer les gammes.','Restart BonzAI to import checklists.'));const result=await api.importPlans(data.value.contract.companyId,{confirmed:true,plans:planImportRows.value.filter(p=>p.include).map(p=>({...p,nextDueAt:p.dueDate?new Date(p.dueDate).getTime():null}))});await store.refreshActive();return result;},mt('Gammes importées.','Checklists imported.'));if(done)planImportRows.value=null;}
async function readInventory(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await run(async () => {
    importRows.value = await readInventoryFile(file, data.value.sites || []);
  });
  event.target.value = "";
}
async function confirmImport() {
  const done = await run(
    () => store.importGmaoAssets(importRows.value),
    ui("Inventaire importé."),
  );
  if (done) importRows.value = null;
}
function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9°]+/g, " ")
    .trim();
}
function parseCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter =
    lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",";
  const parse = (line) => {
    const out = [];
    let cur = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const headers = parse(lines.shift()).map(normalizeHeader);
  return lines.map((line) =>
    Object.fromEntries(
      parse(line).map((value, i) => [headers[i], value.trim()]),
    ),
  );
}
function matrixToObjects(matrix) {
  const [head = [], ...rows] = matrix || [];
  const headers = head.map(normalizeHeader);
  return rows
    .filter((row) => row.some((value) => value != null && value !== ""))
    .map((row) =>
      Object.fromEntries(
        row.map((value, index) => [
          headers[index],
          value == null ? "" : String(value),
        ]),
      ),
    );
}
</script>
<style scoped>
.plan-import-row .plan-include{display:flex;align-items:center;gap:10px}.plan-import-row .plan-include input{appearance:none;width:36px;min-height:22px;height:22px;flex:none;margin:0;padding:0;position:relative;border:1px solid var(--bz-border-strong);border-radius:999px;background:var(--bz-panel)}.plan-import-row .plan-include input::before{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--bz-fg-mid)}.plan-import-row .plan-include input:checked{background:var(--bz-accent)}.plan-import-row .plan-include input:checked::before{transform:translateX(14px);background:var(--bz-on-accent,#fff)}.plan-import-row{padding:22px 0;border-bottom:1px solid var(--bz-border);display:grid;gap:14px}.plan-import-row h3{font-size:18px;line-height:1.4;margin:0}.plan-import-row h3 span{font-size:15px;color:var(--bz-accent);margin-left:10px}.plan-import-row p,.plan-import-row small{color:var(--bz-fg-mid);font-size:13px}.plan-import-row label{display:grid;gap:7px;font-size:13px;color:var(--bz-fg-mid)}.plan-import-row select,.plan-import-row input{background:var(--bz-panel);border:1px solid var(--bz-border-strong);color:var(--bz-fg);padding:10px;border-radius:9px;width:100%}.plan-import-row select{min-height:120px}.plan-import-row small{display:block}.plan-import-row details{padding:10px 0}.plan-import-row li{padding:5px 0}

.maintenance-settings {
  color: var(--bz-fg);
  min-width: 0;
  font: 400 14px/1.55 var(--bz-font-body);
}
.settings-heading {
  margin-bottom: 24px;
}
.eyebrow {
  font-size: 11px !important;
  letter-spacing: 0.14em;
  color: var(--bz-accent) !important;
}
.settings-heading h2 {
  font-family: "Fira Sans Condensed", sans-serif;
  font-size: 32px;
  font-weight: 900;
  font-style: italic;
  margin: 8px 0;
}
.settings-heading p,
.settings-hint {
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.6;
}
nav {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--bz-border);
  padding-bottom: 12px;
}
nav button {
  display: flex;
  align-items: center;
  gap: 9px;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 12px;
  color: var(--bz-fg-mid);
  background: transparent;
}
nav button.selected {
  background: var(--bz-accent-soft);
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}
nav .material-symbols-outlined {
  font-size: 19px;
}
nav .bz-metric {
  color: var(--bz-accent);
}
.settings-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 24px 0 16px;
}
.settings-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 170px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  padding: 0 12px;
}
.settings-search input {
  border: 0;
  background: none;
  width: 100%;
  padding: 12px 0;
  color: var(--bz-fg);
  outline: none;
}
.settings-search:focus-within {
  outline: 2px solid var(--bz-accent);
}
.settings-row {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  text-align: left;
  padding: 20px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: 12px;
  margin-bottom: 0;
  transition: background var(--bz-dur-fast) var(--bz-ease-out), border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.settings-row:hover {
  border-color: var(--bz-accent);
  background: var(--bz-card);
}
.settings-row-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 0;
  background: var(--bz-raised);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
  font-size: 20px;
}
.settings-row-main {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.settings-row-main strong {
  display: block;
  font-weight: 600;
}
.settings-row-main small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 5px;
  line-height: 1.5;
}
.settings-row-value {
  font-size: 13px;
  color: var(--bz-fg-mid);
  text-align: right;
  max-width: 30%;
  overflow-wrap: anywhere;
}
.settings-row > .material-symbols-outlined:last-child {
  flex-shrink: 0;
  color: var(--bz-fg-mid);
  font-size: 18px;
}
.settings-empty {
  padding: 48px 24px;
  text-align: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  background: var(--bz-panel);
}
.settings-empty > .material-symbols-outlined {
  font-size: 36px;
  color: var(--bz-accent);
}
.settings-empty h3 {
  font-size: 23px;
}
.settings-empty p {
  color: var(--bz-fg-mid);
  max-width: 420px;
  margin: 12px auto 24px;
  line-height: 1.6;
}
.settings-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 20px;
}
.settings-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--bz-fg-mid);
  font-size: 13px;
  min-width: 0;
}
.settings-form input,
.settings-form textarea,
.settings-form select {
  padding: 12px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  width: 100%;
  font: 400 14px/1.5 var(--bz-font-body);
  min-height: 44px;
  box-sizing: border-box;
}
.settings-form textarea { resize: vertical; }
.settings-form :is(input, textarea, select):focus-visible {
  border-color: var(--bz-accent);
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.settings-form .check {
  flex-direction: row;
  align-items: center;
}
.settings-form .check input {
  width: 18px;
  height: 18px;
  min-height: 18px;
  flex: 0 0 18px;
  accent-color: var(--bz-accent);
}
.wide {
  grid-column: 1/-1;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-top: 22px;
  border-top: 1px solid var(--bz-border);
}
.settings-notice {
  padding: 14px;
  background: var(--bz-accent-soft);
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  overflow-wrap: anywhere;
}
.settings-notice.error {
  color: var(--bz-danger);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.import-preview {
  padding: 0;
  list-style-position: inside;
  max-height: 340px;
  overflow: auto;
}
.import-preview li {
  padding: 12px 0;
  border-bottom: 1px solid var(--bz-border);
}
@media (max-width: 600px) {
  .settings-form {
    grid-template-columns: 1fr;
  }
  .settings-row {
    padding: 14px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .settings-row-icon {
    padding: 0;
  }
  .settings-row-value {
    margin-left: auto;
  }
  .settings-row-main {
    flex-basis: 65%;
  }
  .settings-heading h2 {
    font-size: 28px;
  }
  .settings-toolbar > .bz-btn {
    flex: 1 1 auto;
    min-width: max-content;
  }
  .settings-toolbar > .bz-btn--primary {
    flex-basis: 100%;
    min-width: 0;
    width: 100%;
    white-space: normal;
    text-align: center;
  }
  .settings-search {
    flex-basis: 100%;
  }
}
.inventory-source {
  padding: 20px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  line-height: 1.6;
}
@media (prefers-reduced-motion: reduce) { .settings-row { transition: none; } }
.inventory-source{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr);gap:8px;font-size:12px}.inventory-source dt{color:var(--bz-fg-mid)}.inventory-source dd{margin:0;overflow-wrap:anywhere}.import-preview small{display:block;color:var(--bz-fg-mid);margin-top:4px}
</style>
