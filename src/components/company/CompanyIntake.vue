<script setup>
import "./company-design.css";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {useCompanyDraft} from "../../services/company/viewDrafts.js";
import { i18n } from "../../i18n/index.js";
import { operationText, operationError } from "../../i18n/operations.js";
import { statusLabels as workStatusLabels } from "../../services/company/gmaoPresentation.js";
import { intakeLabel, INTAKE_FIELDS } from "../../shared/companyIntake.js";
import {
  importIntakeFile,
  chunkText,
} from "../../services/company/intakeFiles.js";
import * as connectors from "../../services/company/connectors.js";
import CompanyProviderConnect from './CompanyProviderConnect.vue';
const props = defineProps({ companyId: { type: String, required: true } });
defineEmits(["open-tools"]);
const api = () => window.electronAPI?.db?.companyIntake;
const t = (en, fr) =>
  i18n.state.locale === "fr" ? fr : operationText(en, i18n.state.locale);
const state = ref({ sources: [], mailboxes: [], counts: [] }),
  source = ref(null),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  pasted = ref(""),
  mail = ref(false),
  available = ref([]),
  drafts = ref({}),
  query = ref(""),
  savedRecord = ref(null),
  offset = ref(0);
useCompanyDraft(()=>props.companyId+':intake',{pasted,drafts});
const partsRequests=ref([]);
const connectingMailbox = ref(null);
async function loadMailboxes() {
  available.value = (await connectors.list(props.companyId)).filter(c => ['gmail', 'outlook_mail'].includes(c.kind));
}
async function connectMailbox(kind) {
  await perform(async () => {
    await loadMailboxes();
    const existing = available.value.find(c => c.kind === kind);
    connectingMailbox.value = existing || await connectors.create(props.companyId, { kind, authType: 'oauth2', label: kind === 'gmail' ? 'Gmail' : 'Outlook Mail' });
    if (!connectingMailbox.value) throw new Error(t('Connection could not be created. Try again.', 'Impossible de créer la connexion. Réessayez.'));
  });
}
async function mailboxConnected() {
  connectingMailbox.value = null;
  await perform(loadMailboxes);
}
const visible = computed(() => state.value.sources);
const statusLabel = (s) =>
  ({
    queued: t("Queued", "En attente"),
    processing: t("Analyzing", "Analyse en cours"),
    review: t("Needs your attention", "À vérifier"),
    completed: t("Processed", "Traité"),
    applied: t("Saved", "Enregistré"),
    dismissed: t("Dismissed", "Ignoré"),
  })[s] || s;
const label = (k) =>
  ({
    stage: t("Stage", "Étape"),
    workOrderNumber: t("Work order", "Intervention"),
    clientOiNumber: t("Client work-order reference", "Référence OI client"),
    assigneeHuman: t("Technician", "Technicien"),
    name: t("Name", "Nom"),
    email: "Email",
    phone: t("Phone", "Téléphone"),
    address: t("Address", "Adresse"),
    contactName: t("Contact", "Contact"),
    client: t("Client", "Client"),
    site: t("Site", "Site"),
    trigram: t("Site code", "Code du site"),
    title: t("Subject", "Objet"),
    reference: t("Reference", "Référence"),
    description: t("Description", "Description"),
    status: t("Status from source", "État dans la source"),
    scheduledAt: t("Scheduled for", "Date prévue"),
    durationMinutes: t("Duration (minutes)", "Durée (minutes)"),
    technician: t("Technician", "Technicien"),
    priority: t("Priority", "Priorité"),
    type: t("Type", "Type"),
    supplier: t("Supplier", "Fournisseur"),
    workOrderReference: t("Work-order reference", "Référence intervention"),
    requestId: t(
      "Linked parts request",
      "Demande de pièces associée",
    ),
    lines: t("Line items", "Lignes"),
    shippingCents: t("Freight (EUR)", "Transport (€)"),
    vatRate: t("VAT (%)", "TVA (%)"),
    leadDays: t("Delivery lead time (days)", "Délai de livraison (jours)"),
    totalCents: t("Total (EUR)", "Total (€)"),
    dueAt: t("Due date", "Échéance"),
    beneficiary: t("Beneficiary", "Bénéficiaire"),
    territory: t("Territory", "Territoire"),
    scheme: t("Programme", "Dispositif"),
    applicationReference: t("Application reference", "Référence dossier"),
    dueDate: t("Deadline", "Date limite"),
    nextAction: t("Next action", "Prochaine action"),
    customer: t("Customer", "Client"),
    scope: t("Request", "Demande"),
    nextAt: t("Next follow-up", "Prochain suivi"),
    role: t("Team role", "Rôle dans l’équipe"),
    equipmentType: t("Equipment type", "Type d’équipement"),
    brand: t("Brand", "Marque"),
    modelReference: t("Model", "Modèle"),
    serialNumber: t("Serial number", "Numéro de série"),
    assetCode: t("Equipment code", "Code équipement"),
    sku: t("Part reference", "Référence pièce"),
    quantity: t("Quantity", "Quantité"),
    unitPriceCents: t("Unit price (EUR)", "Prix unitaire (€)"),
    label: t("Description", "Désignation"),
  })[k] || k;
const numeric = (k) =>
  [
    "durationMinutes",
    "shippingCents",
    "vatRate",
    "leadDays",
    "totalCents",
    "quantity",
    "unitPriceCents",
  ].includes(k);
const recordStatus = (value) => ({
  qualification: t('Eligibility review', 'Vérification de l’éligibilité'),
  open: t('Open', 'Ouvert'),
  in_progress: t('In progress', 'En cours'),
  todo: t('To do', 'À faire'),
  enquiry: t('Enquiry', 'Demande reçue'),
  quoted: t('Quote recorded', 'Offre enregistrée'),
}[value] || (workStatusLabels[value]
  ? operationText(workStatusLabels[value], i18n.state.locale)
  : String(value).replace(/_/g, ' ')));
async function load() {
  if (!api())
    throw new Error(
      t(
        "Restart BonzAI to enable incoming files and email.",
        "Redémarrez BonzAI pour activer les imports et les emails.",
      ),
    );
  state.value = await api().snapshot(props.companyId, {
    offset: offset.value,
    query: query.value,
  });
  if (source.value)
    source.value = await api().readSource(props.companyId, {
      id: source.value.id,
    });
}
async function perform(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = operationError(e, i18n.state.locale);
  } finally {
    busy.value = false;
  }
}
async function select(row) {
  await perform(async () => {
    source.value = await api().readSource(props.companyId, { id: row.id });
    savedRecord.value = null;
  });
}
async function importFiles(event) {
  const files = [...event.target.files];
  event.target.value = "";
  await perform(async () => {
    let duplicates = 0;
    for (const f of files) {
      const s = await importIntakeFile(props.companyId, f);
      duplicates += Number(!!s.duplicate);
      source.value = s;
    }
    notice.value = t(
      `${files.length} file(s) saved locally; ${duplicates} already imported. The team processes them in the background.`,
      `${files.length} fichier(s) enregistré(s) ; ${duplicates} déjà importé(s). L’équipe les traite en arrière-plan.`,
    );
  });
}
async function importText() {
  await perform(async () => {
    source.value = await api().ingest(props.companyId, {
      name: pasted.value.split("\n")[0].slice(0, 100),
      chunks: chunkText(pasted.value),
    });
    pasted.value = "";
  });
}
async function edit(a) {
  if(INTAKE_FIELDS[a.data.type]?.includes('requestId')) {
    try { partsRequests.value=(await window.electronAPI.db.purchasing.snapshot(props.companyId)).requests; }
    catch(e) { error.value=operationError(e,i18n.state.locale);return; }
  }
  drafts.value[a.id] = JSON.parse(JSON.stringify(a.data.data));
}
async function review(a, decision) {
  await perform(async () => {
    const data = drafts.value[a.id] || a.data.data;
    for (const k of Object.keys(data)) if (data[k] === "") delete data[k];
    source.value = await api().review(props.companyId, {
      actionId: a.id,
      revision: a.revision,
      decision,
      confirmed: true,
      data,
    });
    delete drafts.value[a.id];
  });
}
async function mailbox(conn) {
  await perform(async () => {
    const old = state.value.mailboxes.find((m) => m.connectorId === conn.id);
    await api().saveMailbox(props.companyId, {
      connectorId: conn.id,
      enabled: !old?.enabled,
      filter: conn.intakeFilter ?? old?.filter ?? "",
    });
  });
}
async function showMail() {
  mail.value = !mail.value;
  if (mail.value)
    await perform(loadMailboxes);
}
async function download() {
  await perform(async () => {
    const bytes = await window.electronAPI.db.blobs.read(
        source.value.blobId,
        source.value.ext,
      ),
      url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement("a");
    a.href = url;
    a.download = source.value.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}
async function inspect(a, r) {
  await perform(async () => {
    savedRecord.value = await api().readRecord(props.companyId, {
      actionId: a.id,
      recordId: r.id,
    });
  });
}
let unsubscribe, timer, searchTimer;
watch(query, () => {
  offset.value = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => perform(load), 250);
});
watch(
  () => props.companyId,
  () => {
    source.value = null;
    savedRecord.value = null;
    offset.value = 0;
    perform(load);
  },
);
onMounted(async () => {
  await perform(load);
  unsubscribe = api()?.onChanged?.((e) => {
    if (e.companyId === props.companyId && !busy.value)
      load().catch((e) => (error.value = e.message));
  });
  timer = setInterval(() => {
    if (!busy.value) load().catch(() => {});
  }, 10000);
});
onUnmounted(() => {
  unsubscribe?.();
  clearInterval(timer);
  clearTimeout(searchTimer);
});
</script>
<template>
  <section class="intake company-screen" data-i18n-skip>
    <header class="intake-head">
      <div>
        <h3>{{ t("Files & email", "Fichiers et emails") }}</h3>
        <p>
          {{
            t(
              "Import once. The team identifies records, reuses existing information and prepares the next steps.",
              "Importez une fois. L’équipe identifie les dossiers, réutilise les informations et prépare la suite.",
            )
          }}
        </p>
      </div>
      <div class="intake-buttons">
        <button class="bz-btn bz-btn--ghost" @click="showMail">
          <span class="material-symbols-outlined" aria-hidden="true">mail</span
          >{{ t("Mailboxes", "Boîtes email") }}</button
        ><label class="bz-btn bz-btn--primary"
          ><span class="material-symbols-outlined" aria-hidden="true"
            >upload_file</span
          >{{ t("Import files", "Importer des fichiers")
          }}<input
            type="file"
            multiple
            accept=".docx,.pdf,.txt,.md,.csv,.tsv,.xlsx,.xls,.xlsm,.png,.jpg,.jpeg"
            :disabled="busy"
            @change="importFiles"
            class="intake-file"
        /></label>
      </div>
    </header>
    <p v-if="error" class="intake-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="mail" class="intake-card">
      <header class="intake-head">
        <h4>{{ t("Email intake", "Import des emails") }}</h4>
        <div class="company-actions">
          <button v-if="!available.some(c=>c.kind==='gmail' && c.status==='active')" class="bz-btn" :disabled="busy" @click="connectMailbox('gmail')"><span class="material-symbols-outlined" aria-hidden="true">mail</span>{{ t('Connect Gmail', 'Connecter Gmail') }}</button>
          <button v-if="!available.some(c=>c.kind==='outlook_mail' && c.status==='active')" class="bz-btn" :disabled="busy" @click="connectMailbox('outlook_mail')"><span class="material-symbols-outlined" aria-hidden="true">mail</span>{{ t('Connect Outlook', 'Connecter Outlook') }}</button>
        </div>
      </header>
      <p>
        {{
          t(
            "Enable an inbox to import new messages and attachments while this team is running. Messages stay unchanged in your mailbox.",
            "Activez une boîte pour importer les nouveaux messages et pièces jointes pendant que l’équipe fonctionne. Les messages ne sont pas modifiés.",
          )
        }}
      </p>
      <div v-for="conn in available" :key="conn.id" class="intake-mail">
        <div>
          <strong>{{ conn.label }}</strong>
          <p v-if="conn.accountIdentifier">{{ conn.accountIdentifier }}</p>
          <p v-if="conn.status !== 'active'">{{ t('Sign in to enable email intake.', 'Connectez-vous pour activer l’import des emails.') }}</p>
          <p
            v-if="state.mailboxes.find((m) => m.connectorId === conn.id)?.error"
            role="alert"
          >
            {{ state.mailboxes.find((m) => m.connectorId === conn.id).error }}
          </p>
          <details v-if="conn.status === 'active'" class="intake-mail-filter"><summary>{{ t('Filter incoming mail (optional)', 'Filtrer les emails entrants (facultatif)') }}</summary><label
            >{{
              conn.kind === "gmail"
                ? t("Gmail search (optional)", "Recherche Gmail (facultative)")
                : t("Sender email (optional)", "Email expéditeur (facultatif)")
            }}<input
              v-model="conn.intakeFilter"
              :placeholder="
                state.mailboxes.find((m) => m.connectorId === conn.id)
                  ?.filter || ''
              "
              :disabled="
                state.mailboxes.find((m) => m.connectorId === conn.id)?.enabled
              "
          /></label></details>
        </div>
        <button
          class="bz-btn intake-switch"
          role="switch"
          :aria-checked="
            !!state.mailboxes.find((m) => m.connectorId === conn.id)?.enabled
          "
          :disabled="busy || conn.status !== 'active'"
          @click="mailbox(conn)"
        >
          {{
            state.mailboxes.find((m) => m.connectorId === conn.id)?.enabled
              ? t("Pause import", "Suspendre l’import")
              : t("Enable import", "Activer l’import")
          }}
        </button>
      </div>
    </section>
    <CompanyProviderConnect v-if="connectingMailbox" :key="connectingMailbox.id" :company-id="companyId" :connector="connectingMailbox" @close="connectingMailbox=null" @connected="mailboxConnected" />
    <details class="intake-paste">
      <summary>
        {{
          t(
            "Or paste a message or client description",
            "Ou coller un message ou une fiche client",
          )
        }}
      </summary>
      <textarea
        v-model="pasted"
        rows="4"
        :aria-label="t('Text to import', 'Texte à importer')"
      ></textarea
      ><button
        class="bz-btn"
        :disabled="busy || !pasted.trim()"
        @click="importText"
      >
        {{ t("Send to the team", "Transmettre à l’équipe") }}
      </button>
    </details>
    <div class="intake-layout">
      <aside>
        <input
          v-model="query"
          :placeholder="t('Find an import', 'Rechercher un import')"
          :aria-label="t('Find an import', 'Rechercher un import')"
        />
        <p v-if="!visible.length">
          {{
            t(
              "PDFs, spreadsheets, images and text. Your original files stay on this device.",
              "PDF, tableurs, images et textes. Vos fichiers originaux restent sur cet appareil.",
            )
          }}
        </p>
        <button
          v-for="s in visible"
          :key="s.id"
          class="intake-source"
          :aria-current="source?.id === s.id ? 'true' : undefined"
          @click="select(s)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{
            s.status === "completed"
              ? "task_alt"
              : s.status === "review"
                ? "fact_check"
                : "description"
          }}</span
          ><span
            ><strong>{{ s.name }}</strong
            ><small>{{ statusLabel(s.status) }}</small></span
          >
        </button>
        <div v-if="state.total > 50" class="intake-pages">
          <button
            class="bz-btn"
            :disabled="busy || offset === 0"
            @click="
              offset -= 50;
              perform(load);
            "
          >
            {{ t("Previous", "Précédent") }}</button
          ><span
            >{{ offset + 1 }}–{{ Math.min(offset + 50, state.total) }} /
            {{ state.total }}</span
          ><button
            class="bz-btn"
            :disabled="busy || offset + 50 >= state.total"
            @click="
              offset += 50;
              perform(load);
            "
          >
            {{ t("Next", "Suivant") }}
          </button>
        </div>
      </aside>
      <article v-if="source" class="intake-card intake-detail">
        <header class="intake-head">
          <div>
            <h3>{{ source.name }}</h3>
            <p>{{ statusLabel(source.status) }}</p>
          </div>
          <button
            v-if="source.blobId"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="download"
          >
            {{ t("Original file", "Fichier original") }}
          </button>
          <button
            v-if="source.metadata?.parentId"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="select({ id: source.metadata.parentId })"
          >
            {{ t("Related email", "Email associé") }}
          </button>
        </header>
        <ol class="intake-progress">
          <li class="done">{{ t("Saved", "Enregistré") }}</li>
          <li :class="{ done: source.cursor >= source.chunkCount }">
            {{ t("Analyzed", "Analysé") }}
            <span class="bz-metric"
              >{{ source.cursor }}/{{ source.chunkCount }}</span
            >
          </li>
          <li :class="{ done: source.status === 'completed' }">
            {{ t("Records prepared", "Dossiers préparés") }}
          </li>
        </ol>
        <p v-if="source.error" class="intake-error">
          {{ operationError(source.error, i18n.state.locale) }}
        </p>
        <button
          v-if="source.status === 'review' && source.cursor < source.chunkCount"
          class="bz-btn"
          :disabled="busy"
          @click="perform(() => api().retry(companyId, { id: source.id }))"
        >
          {{ t("Retry analysis", "Relancer l’analyse") }}
        </button>
        <p v-if="!source.actions?.length">
          {{
            source.status === "completed"
              ? t(
                  "No actionable records found. The original remains available.",
                  "Aucun dossier à créer identifié. L’original reste disponible.",
                )
              : t(
                  "Processing continues while you use the rest of BonzAI. Paused teams resume when you press Play.",
                  "Le traitement continue pendant votre navigation. Une équipe en pause reprend lorsque vous appuyez sur Lecture.",
                )
          }}
        </p>
        <section v-for="a in source.actions" :key="a.id" class="intake-action">
          <header class="intake-head">
            <h4>
              {{ intakeLabel(a.data.type, i18n.state.locale) }} ·
              {{
                a.data.data.name || a.data.data.title || a.data.data.reference
              }}
            </h4>
            <span>{{ statusLabel(a.status) }}</span>
          </header>
          <p v-if="a.error" class="intake-error">
            {{ operationError(a.error, i18n.state.locale) }}
          </p>
          <blockquote>{{ a.data.evidence }}</blockquote>
          <p v-for="r in (a.result || []).filter((r) => r.pending)" :key="r.id">
            {{
              t(
                r.pending,
                "Pièces et demande enregistrées. Le transport, la TVA ou le délai fournisseur restent à compléter avant de choisir une offre.",
              )
            }}
          </p>
          <form v-if="drafts[a.id]" @submit.prevent="review(a, 'apply')">
            <div class="intake-fields">
              <template v-for="key in INTAKE_FIELDS[a.data.type]" :key="key"
                ><fieldset v-if="key === 'lines'" class="intake-lines">
                  <legend>{{ label(key) }}</legend>
                  <div
                    v-for="(line, index) in drafts[a.id].lines || []"
                    :key="index"
                    class="intake-fields"
                  >
                    <label v-for="lk in Object.keys(line)" :key="lk"
                      >{{ label(lk)
                      }}<input
                        v-if="numeric(lk)"
                        :value="lk.endsWith('Cents') ? line[lk]/100 : line[lk]" @input="line[lk]=lk.endsWith('Cents') ? Math.round(Number($event.target.value)*100) : Number($event.target.value)"
                        type="number"
                        step="any" /><input v-else v-model="line[lk]"
                    /></label>
                  </div>
                </fieldset>
                <label v-else
                  >{{ label(key)
                  }}<input
                    v-if="numeric(key)"
                    :value="key.endsWith('Cents') ? drafts[a.id][key]/100 : drafts[a.id][key]" @input="drafts[a.id][key]=key.endsWith('Cents') ? Math.round(Number($event.target.value)*100) : Number($event.target.value)"
                    type="number"
                    step="any" /><select
                    v-else-if="key === 'requestId'" v-model="drafts[a.id][key]">
                    <option value="">{{ t('Unassigned','Sans affectation') }}</option><option v-for="request in partsRequests" :key="request.id" :value="request.id">{{ request.title }}</option>
                  </select><select v-else-if="key === 'status' && a.data.type === 'work_order'"
                    v-model="drafts[a.id][key]"
                  >
                    <option value="">{{ t('Choose', 'Choisir') }}</option>
                    <option v-if="drafts[a.id][key] && !['reported','triaged','assigned'].includes(drafts[a.id][key])" :value="drafts[a.id][key]">{{ recordStatus(drafts[a.id][key]) }}</option>
                    <option v-for="value in ['reported','triaged','assigned']" :key="value" :value="value">{{ recordStatus(value) }}</option>
                  </select><textarea
                    v-else-if="['description', 'scope'].includes(key)"
                    v-model="drafts[a.id][key]"
                    rows="3"
                  ></textarea
                  ><input v-else v-model="drafts[a.id][key]" /></label
              ></template>
            </div>
            <button class="bz-btn bz-btn--primary" :disabled="busy">
              {{ t("Confirm and save", "Vérifier et enregistrer") }}
            </button>
          </form>
          <div v-else class="intake-buttons">
            <template v-if="a.status === 'review'"
              ><button class="bz-btn" :disabled="busy" @click="edit(a)">
                {{ t("Review fields", "Vérifier les champs") }}</button
              ><button
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="review(a, 'dismiss')"
              >
                {{ t("Dismiss", "Ignorer") }}
              </button></template
            ><button
              v-for="r in (a.result || []).filter((r) => r.type !== 'part')"
              :key="r.id"
              class="bz-btn bz-btn--ghost"
              @click="inspect(a, r)"
            >
              {{ intakeLabel(r.type, i18n.state.locale)
              }}<span class="material-symbols-outlined" aria-hidden="true"
                >arrow_forward</span
              >
            </button>
          </div>
        </section>
        <section v-if="savedRecord" class="intake-action">
          <h4>{{ t("Saved record", "Dossier enregistré") }}</h4>
          <dl class="intake-fields">
            <template
              v-for="key in [
                'name',
                'title',
                'status',
                'stage',
                'reference',
                'email',
                'phone',
                'address',
                'description',
                'assigneeHuman',
                'beneficiary',
                'scheme',
                'workOrderNumber',
                'clientOiNumber',
              ]"
              :key="key"
              ><div v-if="savedRecord[key]">
                <dt>{{ label(key) }}</dt>
                <dd>{{ ['status', 'stage'].includes(key) ? recordStatus(savedRecord[key]) : savedRecord[key] }}</dd>
              </div></template
            >
          </dl>
          <button class="bz-btn bz-btn--ghost" @click="savedRecord = null">
            {{ t("Close", "Fermer") }}
          </button>
        </section>
        <details>
          <summary>{{ t("Source text", "Texte source") }}</summary>
          <pre>{{ source.text }}</pre>
        </details>
      </article>
      <article v-else class="intake-card intake-empty">
        <span class="material-symbols-outlined" aria-hidden="true"
          >move_to_inbox</span
        >
        <h3>
          {{
            t(
              "Start with the information you already have",
              "Commencez par les informations que vous avez déjà",
            )
          }}
        </h3>
        <p>
          {{
            t(
              "A client description, a supplier proforma or a schedule can become linked records. Only uncertain matches and missing evidence need your attention.",
              "Une fiche client, une proforma fournisseur ou un planning peuvent devenir des dossiers liés. Seuls les rapprochements incertains et justificatifs manquants demandent votre attention.",
            )
          }}
        </p>
      </article>
    </div>
  </section>
</template>
<style scoped>
.intake {
  display: grid;
  gap: 24px;
  color: var(--bz-fg);
  min-width: 0;
}
.intake h3 {
  font: 400 26px/1.2 var(--bz-font-display);
  margin: 0;
}
.intake h4 {
  margin: 0;
  font-size: 17px;
}
.intake p {
  color: var(--bz-fg-mid);
  line-height: 1.55;
  margin: 10px 0;
}
.intake-head,
.intake-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.intake-head > div {
  min-width: 0;
}
.intake-head h3 {
  overflow-wrap: anywhere;
}
.intake-buttons {
  justify-content: flex-start;
}
.intake .bz-btn {
  width: auto;
  flex: none;
  white-space: normal;
  min-height: 40px;
}
.intake-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.intake-layout {
  display: grid;
  grid-template-columns: minmax(240px, 30%) minmax(0, 1fr);
  gap: 24px;
}
.intake-card {
  padding: 28px;
  border: 1px solid var(--bz-border);
  border-radius: 16px;
  background: var(--bz-panel);
  min-width: 0;
}
.intake-source {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--bz-fg);
  width: 100%;
  padding: 16px;
  text-align: left;
  margin-top: 8px;
  min-width: 0;
}
.intake-source span:last-child {
  min-width: 0;
}
.intake-source strong {
  display: block;
  overflow-wrap: anywhere;
}
.intake-source small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 6px;
}
.intake-source:hover,
.intake-source[aria-current="true"] {
  background: var(--bz-panel);
  border-color: var(--bz-accent);
}
.intake-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.intake label {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: var(--bz-fg-mid);
}
.intake label.bz-btn {
  display: flex;
  color: var(--bz-on-accent);
}
.intake input:not([type="file"]),
.intake select,
.intake textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--bz-border);
  border-radius: 10px;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  font: inherit;
  box-shadow: none;
  outline: none;
}
.intake input:focus,
.intake select:focus,
.intake textarea:focus {
  border-color: var(--bz-accent);
}
.intake-paste summary,
.intake summary {
  cursor: pointer;
  color: var(--bz-fg-mid);
  padding: 8px 0;
}
.intake-paste textarea {
  margin: 12px 0;
}
.intake-progress {
  display: flex;
  list-style: none;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0;
  margin: 24px 0;
}
.intake-progress li {
  flex: 1;
  min-width: 100px;
  border-top: 2px solid var(--bz-border);
  padding-top: 12px;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.intake-progress .done {
  border-color: var(--bz-accent);
  color: var(--bz-fg);
}
.intake-progress .bz-metric {
  margin-left: 5px;
}
.intake-action {
  padding: 22px 0;
  border-top: 1px solid var(--bz-border);
}
.intake blockquote {
  padding: 12px 16px;
  margin: 14px 0;
  border-left: 2px solid var(--bz-border);
  color: var(--bz-fg-mid);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  max-height: 170px;
  overflow: auto;
}
.intake pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 350px;
  overflow: auto;
  color: var(--bz-fg-mid);
  background: var(--bz-canvas);
  padding: 16px;
}
.intake-error {
  color: var(--bz-warning) !important;
}
.intake-mail {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;
  padding: 18px 0;
  border-top: 1px solid var(--bz-border);
}
.intake-mail > div {
  flex: 1;
  min-width: 0;
}
.intake-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 13px;
}
.intake dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.intake dt {
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.intake-switch::before {
  content: "";
  display: block;
  flex: none;
  width: 32px;
  height: 20px;
  border: 1px solid var(--bz-border);
  border-radius: 20px;
  background: radial-gradient(
      circle at 9px 50%,
      var(--bz-fg-mid) 5px,
      transparent 6px
    )
    var(--bz-canvas);
}
.intake-switch[aria-checked="true"]::before {
  background: radial-gradient(
      circle at 22px 50%,
      var(--bz-on-accent) 5px,
      transparent 6px
    )
    var(--bz-accent);
  border-color: var(--bz-accent);
}
.intake-lines {
  grid-column: 1/-1;
  min-width: 0;
  border: 0;
  padding: 0;
}
.intake-empty {
  display: grid;
  align-content: center;
  gap: 16px;
  min-height: 340px;
}
.intake-empty > .material-symbols-outlined {
  font-size: 36px;
  color: var(--bz-accent);
}
@media (max-width: 780px) {
  .intake-layout {
    grid-template-columns: 1fr;
  }
  .intake-card {
    padding: 20px;
  }
  .intake-fields {
    grid-template-columns: 1fr;
  }
  .intake-mail {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
