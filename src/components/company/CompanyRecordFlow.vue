<template>
  <section class="record-flow company-screen" data-i18n-skip>
    <p v-if="error" class="record-error" role="alert">{{ error }}</p>
    <template v-if="state">
      <CompanyWorkflowProgress
        v-if="kind === 'supplierInvoice' || kind === 'partsRequest'"
        :stages="stages"
        compact
      />
      <div v-if="state.parts.length" class="record-parts">
        <header>
          <h4>{{ t("Parts & invoices", "Pièces et factures") }}</h4>
          <button
            v-if="billable.length"
            class="bz-btn bz-btn--ghost"
            @click="$emit('prepare-invoice', billable)"
          >
            {{ t("Prepare customer invoice", "Préparer la facture client") }}
          </button>
        </header>
        <article
          v-for="part in state.parts"
          :key="part.procurementId + part.partKey"
        >
          <div>
            <strong>{{ part.description }}</strong
            ><small
              >{{ t("Received", "Reçues") }}
              <b class="bz-metric"
                >{{ part.received }} / {{ part.quantity }}</b
              ></small
            >
          </div>
          <div class="record-links">
            <span v-if="!part.supplierInvoices.length">{{
              t("Supplier invoice pending", "Facture fournisseur attendue")
            }}</span>
            <span v-for="i in part.supplierInvoices" :key="i.id"
              >{{ i.orderNumber }} → {{ i.reference }} ·
              {{ statusText(i.status)
              }}<small v-if="i.historical">{{
                t(
                  "Saved evidence · live link unavailable",
                  "Preuve conservée · lien actif indisponible",
                )
              }}</small
              ><small v-if="i.costUnitCents != null"
                >{{ t("Ordered unit price", "Prix unitaire commandé") }}
                {{ money(i.costUnitCents) }}</small
              ></span
            >
            <button
              v-for="i in part.customerInvoices"
              :key="i.id"
              class="bz-btn bz-btn--ghost"
              @click="$emit('open-invoice', i.id)"
            >
              {{
                i.number ||
                t("Customer invoice draft", "Brouillon de facture client")
              }}
              · {{ i.quantity }} · {{ statusText(i.status) }}
            </button>
            <span v-if="part.disposition?.included"
              >{{ t("Included in contract", "Inclus au contrat") }} ·
              {{ part.disposition.reason }}</span
            >
            <span v-else-if="!part.customerInvoices.length">{{
              t("Not yet billed", "Non facturé")
            }}</span>
          </div>
          <details v-if="!part.customerInvoices.length">
            <summary>
              {{ t("Billing treatment", "Traitement de facturation") }}
            </summary>
            <form @submit.prevent="disposition(part)">
              <label
                >{{
                  t(
                    "Contract reference / reason",
                    "Référence contractuelle / motif",
                  )
                }}<input v-model="reasons[part.partKey]" required /></label
              ><button class="bz-btn bz-btn--ghost" :disabled="busy">
                {{
                  part.disposition?.included
                    ? t("Make billable", "Rendre facturable")
                    : t(
                        "Confirm included in contract",
                        "Confirmer inclus au contrat",
                      )
                }}
              </button>
            </form>
          </details>
        </article>
      </div>
      <template v-if="kind !== 'partsRequest'">
        <div class="record-controls">
          <button class="bz-btn bz-btn--ghost" @click="start('email')">
            <span class="material-symbols-outlined" aria-hidden="true"
              >mail</span
            >Email</button
          ><button class="bz-btn bz-btn--ghost" @click="start('sms')">
            <span class="material-symbols-outlined" aria-hidden="true">sms</span
            >SMS
          </button>
          <label
            v-if="kind === 'supplierInvoice'"
            class="bz-btn bz-btn--ghost"
            tabindex="0"
            @keydown.enter.prevent="
              $event.currentTarget.querySelector('input').click()
            "
            @keydown.space.prevent="
              $event.currentTarget.querySelector('input').click()
            "
            >{{ t("Attach original PDF", "Joindre le PDF original")
            }}<input
              class="record-file"
              type="file"
              accept="application/pdf"
              @change="attach"
              :disabled="busy"
          /></label>
        </div>
        <details v-if="['customerInvoice','supplierInvoice'].includes(kind) && !state.record.terminal" class="record-reminder">
          <summary><span class="material-symbols-outlined" aria-hidden="true">forum</span>{{ t('Payment follow-up', 'Suivi du règlement') }}</summary>
          <p v-if="state.collection">{{ collectionLabel(state.collection.status) }} · {{ state.collection.note }}<span v-if="state.collection.promisedAt"> · {{ date(state.collection.promisedAt) }}</span></p>
          <form @submit.prevent="saveCollection">
            <label>{{ t('Response', 'Réponse') }}<select v-model="collection.status"><option value="disputed">{{ t('Dispute — pause reminders', 'Litige — suspendre les relances') }}</option><option value="promised">{{ t('Payment promised', 'Promesse de paiement') }}</option><option value="resolved">{{ t('Resolved — resume reminders', 'Résolu — reprendre les relances') }}</option></select></label>
            <label v-if="collection.status === 'promised'">{{ t('Promised date', 'Date promise') }}<input v-model="collection.date" type="date" required /></label>
            <label>{{ t('Customer / supplier response', 'Réponse du client / fournisseur') }}<input v-model="collection.note" required /></label>
            <label>{{ t('Evidence reference', 'Référence du justificatif') }}<input v-model="collection.evidenceReference" required /></label>
            <button class="bz-btn bz-btn--ghost" :disabled="busy">{{ t('Save response', 'Enregistrer la réponse') }}</button>
          </form>
        </details>
        <details class="record-reminder" @toggle="loadTeams">
          <summary><span class="material-symbols-outlined" aria-hidden="true">share</span>{{ t('Share evidence with a team', 'Partager le justificatif avec une équipe') }}</summary>
          <form @submit.prevent="shareEvidence">
            <label>{{ t('Receiving team', 'Équipe destinataire') }}<select v-model="share.teamId" required @change="share.role='' "><option value="">{{ t('Choose a team', 'Choisir une équipe') }}</option><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label>
            <label>{{ t('Receiving member', 'Membre destinataire') }}<select v-model="share.role" required><option v-for="role in teams.find(team=>team.id===share.teamId)?.roles || []" :key="role" :value="role">{{ formatRoleTitle(role) }}</option></select></label>
            <button class="bz-btn bz-btn--ghost" :disabled="busy || !share.role">{{ t('Share this record', 'Partager ce dossier') }}</button>
          </form>
        </details>
        <details class="record-reminder">
          <summary>
            <span class="material-symbols-outlined" aria-hidden="true"
              >notifications_active</span
            >{{ t("Reminders", "Relances")
            }}<small>{{
              state.reminder?.enabled
                ? t("Active", "Actives")
                : t("Off", "Désactivées")
            }}</small>
          </summary>
          <form @submit.prevent="saveReminder">
            <label class="record-switch"
              ><input
                v-model="reminder.enabled"
                type="checkbox"
                role="switch"
                :disabled="state.record.terminal"
              />{{
                t("Review when the status stalls", "Revoir si le statut stagne")
              }}</label
            ><label
              >{{ t("After (days)", "Après (jours)")
              }}<input
                type="number"
                min="1"
                max="365"
                v-model.number="reminder.days"
                required /></label
            ><button class="bz-btn bz-btn--ghost" :disabled="busy">
              {{ t("Save", "Enregistrer") }}
            </button>
          </form>
          <p>
            {{
              t(
                "Creates a review task. Every email or SMS is approved before sending.",
                "Crée une tâche de suivi. Chaque email ou SMS est validé avant envoi.",
              )
            }}
          </p>
          <p v-if="state.reminder?.enabled">
            {{ t("Next check", "Prochaine échéance") }} ·
            {{ date(state.reminder.nextAt) }}
          </p>
          <button
            v-if="state.reminder?.issueId"
            class="bz-btn bz-btn--ghost"
            @click="$emit('open-task', state.reminder.issueId)"
          >
            {{ t("Open reminder task", "Ouvrir la tâche de relance") }}
          </button>
        </details>
        <details v-if="state.messages.length" class="record-history">
          <summary>
            {{ t("Communication history", "Historique des communications") }}
            <b class="bz-metric">{{ state.messages.length }}</b>
          </summary>
          <article v-for="m in state.messages" :key="m.id">
            <header>
              <strong
                >{{ m.channel === "email" ? "Email" : "SMS" }} ·
                {{ m.recipient }}</strong
              ><small>{{ date(m.createdAt) }}</small>
            </header>
            <CompanyWorkflowProgress :stages="messageStages(m)" compact />
            <p>{{ m.subject }}</p>
            <p v-if="m.error" class="record-error">{{ m.error }}</p>
            <div class="record-controls">
              <button
                :data-review-message="m.id"
                class="bz-btn bz-btn--ghost"
                @click="review(m)"
              >
                {{ t("Review message", "Relire le message") }}</button
              ><button
                v-if="
                  m.providerId && ['submitted', 'delivered'].includes(m.status)
                "
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="act(() => api().checkDelivery(companyId, m.id))"
              >
                {{ t("Check delivery", "Vérifier la livraison") }}
              </button>
            </div>
            <form v-if="m.status === 'unknown'" @submit.prevent="reconcile(m)">
              <label
                >{{
                  t(
                    "Provider receipt/reference",
                    "Reçu / référence fournisseur",
                  )
                }}<input v-model="proofs[m.id]" required /></label
              ><select v-model="outcomes[m.id]" required>
                <option value="">
                  {{ t("Verified outcome", "Résultat vérifié") }}
                </option>
                <option value="submitted">
                  {{ t("Accepted by provider", "Accepté par le fournisseur") }}
                </option>
                <option value="not_sent">
                  {{ t("Confirmed not sent", "Absence d’envoi confirmée") }}
                </option></select
              ><button class="bz-btn bz-btn--ghost" :disabled="busy">
                {{ t("Confirm receipt", "Confirmer le reçu") }}
              </button>
            </form>
          </article>
        </details>
      </template>
    </template>
    <GmaoDialog
      v-if="composing"
      :title="t('Send document', 'Envoyer le document')"
      @close="composing = false"
      :busy="busy"
    >
      <form class="record-composer" @submit.prevent="prepare">
        <template v-if="!draft"
          ><div class="record-fields">
            <label
              >{{ t("From", "Expéditeur")
              }}<input
                v-model.trim="form.sender"
                :type="form.channel === 'email' ? 'email' : 'tel'"
                required /></label
            ><label
              >{{ t("To", "Destinataire")
              }}<input
                v-model.trim="form.recipient"
                :type="form.channel === 'email' ? 'email' : 'tel'"
                required
            /></label>
          </div>
          <label v-if="form.channel === 'email'"
            >{{ t("Subject", "Objet")
            }}<input v-model="form.subject" required /></label
          ><label
            >{{ t("Message", "Message")
            }}<textarea v-model="form.body" rows="5" required /></label
          ><label v-if="form.channel === 'email'" class="record-switch"
            ><input v-model="form.attachPdf" type="checkbox" role="switch" />{{
              t("Attach PDF", "Joindre le PDF")
            }}</label
          >
          <p v-else>
            {{
              t(
                "SMS sends the reference and message; use email for the PDF.",
                "Le SMS transmet la référence et le message ; utilisez l’email pour le PDF.",
              )
            }}
          </p>
          <button class="bz-btn bz-btn--primary" :disabled="busy">
            {{ t("Preview before sending", "Vérifier avant envoi") }}
          </button></template
        >
        <template v-else
          ><p>
            {{ draft.sender }} → <strong>{{ draft.recipient }}</strong>
          </p>
          <h4>{{ draft.subject }}</h4>
          <p class="record-body">{{ draft.body }}</p>
          <button
            v-if="draft.attachment"
            type="button"
            class="bz-btn bz-btn--ghost"
            @click="download(draft.attachment)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >attach_file</span
            >{{ draft.attachment.filename }}</button
          ><label class="record-switch"
            ><input v-model="approved" type="checkbox" role="switch" />{{
              t(
                "I approve this recipient, message and attachment.",
                "Je valide le destinataire, le message et la pièce jointe.",
              )
            }}</label
          ><button
            type="button"
            class="bz-btn bz-btn--primary"
            :disabled="
              busy || !approved || !['draft', 'failed'].includes(draft.status)
            "
            @click="send"
          >
            {{ t("Send", "Envoyer") }}</button
          ><button
            type="button"
            class="bz-btn bz-btn--ghost"
            @click="draft = null"
          >
            {{ t("New draft", "Nouveau brouillon") }}
          </button></template
        >
        <p v-if="error" role="alert" class="record-error">{{ error }}</p>
      </form>
    </GmaoDialog>
  </section>
</template>
<script setup>
import "./company-design.css";
import {formatRoleTitle} from "../../services/company/presentation.js";
import { ref, reactive, computed, watch, onBeforeUnmount } from "vue";
import { i18n } from "../../i18n/index.js";
import CompanyWorkflowProgress from "./CompanyWorkflowProgress.vue";
import GmaoDialog from "./GmaoDialog.vue";
const props = defineProps({
  companyId: String,
  kind: String,
  recordId: String,
  revision: [Number, String],
});
const emit = defineEmits([
  "prepare-invoice",
  "open-invoice",
  "open-task",
  "changed",
]);
const t = (en, fr) => (i18n.state.locale.startsWith("fr") ? fr : en);
const api = () => {
  const a = window.electronAPI?.db?.recordOperations;
  if (!a)
    throw new Error(
      t(
        "Restart BonzAI to enable record follow-up.",
        "Redémarrez BonzAI pour activer le suivi des dossiers.",
      ),
    );
  return a;
};
const teams=ref([]),share=reactive({teamId:"",role:""});
const state = ref(null),
  error = ref(""),
  busy = ref(false),
  composing = ref(false),
  draft = ref(null),
  approved = ref(false),
  form = ref({}),
  reminder = reactive({ enabled: false, days: 7 }),
  collection = reactive({status:"disputed", note:"", evidenceReference:"", date:""}),
  reasons = reactive({}),
  proofs = reactive({}),
  outcomes = reactive({});
const billable = computed(
  () =>
    state.value?.parts.filter(
      (p) =>
        !p.disposition?.included &&
        p.status !== "cancelled" &&
        p.billedQuantity < p.quantity,
    ) || [],
);
const statusText = (s) =>
  ({
    draft: t("Draft", "Brouillon"),
    validated: t("Validated", "Validée"),
    submitted: t("Submitted", "Transmise"),
    accepted: t("Accepted", "Acceptée"),
    paid: t("Paid", "Payée"),
    matched: t("Matched", "Rapprochée"),
    disputed: t("Disputed", "En litige"),
    rejected: t("Rejected", "Rejetée"),
  })[s] || s;
const stage = (id, label, status) => ({ id, label, status });
const stages = computed(() => {
  const r = state.value?.record;
  if (!r) return [];
  if (props.kind === "supplierInvoice")
    return [
      stage("record", t("Invoice recorded", "Facture enregistrée"), "done"),
      stage(
        "match",
        t("Order & receipt matched", "Commande et réception rapprochées"),
        r.status === "disputed" ? "blocked" : "done",
      ),
      stage(
        "pay",
        t("Settlement", "Règlement"),
        r.status === "paid"
          ? "done"
          : r.status === "disputed"
            ? "pending"
            : "waiting",
      ),
    ];
  const p = state.value.parts,
    ordered = p.length && p.every((x) => !!x.orderReference),
    received = p.length && p.every((x) => x.received >= x.quantity),
    supplier = p.length && p.every((x) => x.supplierInvoices.length),
    billed =
      p.length &&
      p.every(
        (x) =>
          x.disposition?.included ||
          x.customerInvoices
            .filter((i) =>
              ["validated", "submitted", "accepted", "paid"].includes(i.status),
            )
            .reduce((n, i) => n + i.quantity, 0) >= x.quantity,
      );
  return [
    stage(
      "request",
      t("Request", "Demande"),
      r.status === "cancelled" ? "blocked" : "done",
    ),
    stage(
      "order",
      t("Order placed", "Commande passée"),
      ordered ? "done" : "waiting",
    ),
    stage(
      "receipt",
      t("Parts received", "Pièces reçues"),
      received ? "done" : ordered ? "waiting" : "pending",
    ),
    stage(
      "supplier",
      t("Supplier invoice", "Facture fournisseur"),
      supplier ? "done" : received ? "waiting" : "pending",
    ),
    stage(
      "customer",
      t("Customer billing", "Facturation client"),
      billed ? "done" : supplier ? "waiting" : "pending",
    ),
  ];
});
function messageStages(m) {
  return [
    stage("draft", t("Prepared", "Préparé"), "done"),
    stage(
      "accepted",
      t("Provider acceptance", "Acceptation fournisseur"),
      ["submitted", "delivered", "delivery_failed"].includes(m.status)
        ? "done"
        : ["unknown", "failed"].includes(m.status)
          ? "blocked"
          : "waiting",
    ),
    stage(
      "delivered",
      t("Delivery confirmed", "Livraison confirmée"),
      m.status === "delivered"
        ? "done"
        : m.status === "delivery_failed"
          ? "blocked"
          : "waiting",
    ),
  ];
}
const date = (v) => (v ? new Date(v).toLocaleString(i18n.state.locale) : "—");
const money = (v) =>
  new Intl.NumberFormat(i18n.state.locale, {
    style: "currency",
    currency: "EUR",
  }).format(v / 100);
let generation = 0,
  off;
async function load() {
  const token = ++generation;
  try {
    const value = await api().snapshot(props.companyId, {
      kind: props.kind,
      id: props.recordId,
    });
    if (token !== generation) return;
    state.value = value;
    reminder.enabled = !!value.reminder?.enabled;
    reminder.days = value.reminder?.days || 7;
  } catch (e) {
    if (token === generation) error.value = e.message;
  }
}
watch(
  () => [props.companyId, props.kind, props.recordId],
  () => {
    state.value = null;
    composing.value = false;
    draft.value = null;
    error.value = "";
    off?.();
    off = window.electronAPI?.db?.recordOperations?.onChanged?.((e) => {
      if (e.companyId === props.companyId && !busy.value && !composing.value)
        load();
    });
    load();
  },
  { immediate: true },
);
watch(
  () => props.revision,
  () => {
    if (!composing.value) load();
  },
);
onBeforeUnmount(() => {
  generation++;
  off?.();
});
async function act(fn) {
  if (busy.value) return false;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
    emit("changed");
    return true;
  } catch (e) {
    error.value = e.message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      "",
    );
    return false;
  } finally {
    busy.value = false;
  }
}
function review(message) {
  draft.value = message;
  form.value = {
    channel: message.channel,
    sender: message.sender,
    recipient: message.recipient,
    subject: message.subject,
    body: message.body,
    attachPdf: !!message.attachment,
  };
  composing.value = true;
  approved.value = false;
  error.value = "";
}
function start(channel) {
  error.value = "";
  draft.value = null;
  approved.value = false;
  const last = state.value.messages.find((m) => m.channel === channel);
  form.value = {
    channel,
    sender: last?.sender || "",
    recipient:
      last?.recipient ||
      (channel === "email"
        ? state.value.contact?.email
        : state.value.contact?.phone) ||
      "",
    subject: state.value.record.title,
    body: state.value.record.title,
    attachPdf: channel === "email",
  };
  composing.value = true;
}
async function prepare() {
  await act(async () => {
    draft.value = await api().prepareMessage(props.companyId, {
      kind: props.kind,
      id: props.recordId,
      ...form.value,
    });
  });
}
async function send() {
  if (
    await act(() =>
      api().sendMessage(props.companyId, draft.value.id, {
        confirmed: approved.value,
        revision: draft.value.revision,
      }),
    )
  )
    composing.value = false;
  else {
    await load();
    draft.value =
      state.value.messages.find((m) => m.id === draft.value.id) || draft.value;
    approved.value = false;
  }
}
const collectionLabel = status => ({disputed:t('Disputed', 'En litige'),promised:t('Payment promised', 'Paiement promis'),resolved:t('Resolved', 'Résolu')})[status];
async function saveCollection() {
  await act(() => api().saveCollection(props.companyId, {
    kind:props.kind,id:props.recordId,version:state.value.record.version,
    previousId:state.value.collection?.id || null,...collection,
    promisedAt:collection.date ? new Date(collection.date + 'T23:59:59').getTime() : null,
  }));
}
async function loadTeams(event) { if(!event.target.open)return;try{teams.value=await window.electronAPI.db.teams.directory(props.companyId);}catch(e){error.value=e.message;} }
async function shareEvidence(){await act(()=>api().shareEvidence(props.companyId,{kind:props.kind,id:props.recordId,version:state.value.record.version,targetTeamId:share.teamId,targetRole:share.role,confirmed:true}));}
async function saveReminder() {
  await act(() =>
    api().saveReminder(props.companyId, {
      kind: props.kind,
      id: props.recordId,
      ...reminder,
    }),
  );
}
async function disposition(p) {
  await act(() =>
    api().setPartDisposition(props.companyId, {
      procurementId: p.procurementId,
      partKey: p.partKey,
      included: !p.disposition?.included,
      reason: reasons[p.partKey],
      confirmed: true,
    }),
  );
}
async function reconcile(m) {
  await act(() =>
    api().reconcileMessage(props.companyId, m.id, {
      confirmed: true,
      outcome: outcomes[m.id],
      evidence: proofs[m.id],
    }),
  );
}
async function attach(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  await act(async () => {
    if (file.size > 20 * 1024 * 1024)
      throw new Error(
        t("PDF must be under 20 MB.", "Le PDF doit faire moins de 20 Mo."),
      );
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    await api().attachSource(props.companyId, {
      kind: props.kind,
      id: props.recordId,
      filename: file.name,
      base64,
      version: state.value.record.version,
    });
  });
  e.target.value = "";
}
async function download(doc) {
  await act(async () => {
    const raw = await window.electronAPI.db.blobs.read(doc.blobId, doc.blobExt);
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))], {
        type: "application/pdf",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
</script>
<style scoped>
.record-flow {
  min-width: 0;
  padding: var(--bz-space-4) 0;
  border-top: 1px solid var(--bz-border);
  color: var(--bz-fg);
}
.record-flow header,
.record-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.record-controls {
  justify-content: flex-start;
  margin: 12px 0;
}
.record-flow h4 {
  margin: 0;
  font-size: var(--bz-size-body);
  font-weight: 600;
}
.record-flow small {
  display: block;
  color: var(--bz-fg-mid);
  line-height: 1.6;
}
.record-flow article {
  padding: 16px 0;
  border-bottom: 1px solid var(--bz-border);
}
.record-links {
  display: grid;
  gap: 8px;
  margin: 12px 0;
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
.record-links button {
  justify-self: start;
}
.record-flow summary {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 12px 0;
}
.record-flow summary small {
  margin-left: auto;
}
.record-flow form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
.record-flow label {
  display: grid;
  gap: 8px;
  min-width: 0;
  font-size: var(--bz-size-meta);
}
.record-flow input:not([type="checkbox"]),
.record-flow select,
.record-flow textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 10px 14px;
  border-radius: var(--bz-radius-md);
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-input-bg, var(--bz-panel));
  color: var(--bz-fg);
  font: inherit;
}
.record-flow .record-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}
.record-switch input {
  appearance: none;
  flex: none;
  width: 36px;
  height: 22px;
  margin: 0;
  border-radius: 999px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  position: relative;
  cursor: pointer;
}
.record-switch input:before {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 14px;
  height: 14px;
  background: var(--bz-fg-mid);
  border-radius: 50%;
}
.record-switch input:checked {
  background: var(--bz-accent);
  border-color: var(--bz-accent);
}
.record-switch input:checked:before {
  left: 17px;
  background: var(--bz-accent-contrast, #fff);
}
.record-switch input:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.record-file {
  display: none;
}
.record-error {
  color: var(--bz-danger);
  line-height: 1.6;
}
.record-body {
  white-space: pre-wrap;
}
.record-reminder p {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}
.record-composer {
  display: grid !important;
  gap: 18px !important;
}
.record-composer label {
  width: 100%;
}
.record-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 600px) {
  .record-fields {
    grid-template-columns: 1fr;
  }
  .record-flow form > label {
    flex: 1 1 180px;
  }
  .record-flow header {
    align-items: flex-start;
  }
}
</style>
