import { executeTeamAction } from "./teamCommunication.js";
import { executeFinanceLocal } from "./finance/evidence.js";
/**
 * BonzAI Company — Skills Registry (runtime executor)
 *
 * Wraps the static manifests in `skillManifests.js` with a runtime
 * `execute()` API that the dispatcher calls when a role's LLM emits a
 * skill-action call. v0 ships with mock executors that log + return
 * deterministic stub results in demo mode and validated connector
 * executors in live mode.
 */

import * as treasury from "./treasury.solo.js";
import * as connectors from "./connectors.js";
import { append } from "./auditLog.js";
import { SKILL_MANIFESTS, getManifest } from "./skillManifests.js";
import { executeConnectorAction } from "./connectorExecutors.js";
import { executeLocalAction } from "./gmao.js";
import { OPERATIONAL_ACTIONS, executeOperationalAction } from './operationalActions.js';
import { saveSupplierSearchEvidence, simulateSupplierSearch } from "./supplierSourcing.js";

/**
 * Find the manifest that owns an action type. Returns the manifest, or
 * null if the action isn't part of any registered skill.
 */
export function findSkillForAction(actionType) {
  for (const m of Object.values(SKILL_MANIFESTS)) {
    if (m.actions.some((a) => a.type === actionType)) return m;
  }
  return null;
}

/**
 * Returns true if the role's grantedSkills permit the given action type.
 */
export function actionGranted(grantedSkills, actionType) {
  if (!Array.isArray(grantedSkills)) return false;
  for (const sid of grantedSkills) {
    const m = getManifest(sid);
    if (m && m.actions.some((a) => a.type === actionType)) return true;
  }
  return false;
}

/**
 * Execute a skill action. Routes to the right executor based on the
 * owning skill's required connectors. Demo mode logs deterministic
 * results; live mode calls the production executor.
 *
 * @param {string} companyId
 * @param {string} actionType — e.g. "twilio.sendSMS"
 * @param {object} params     — action arguments emitted by the LLM
 * @param {object} ctx        — { role, companion, charter }
 */
export async function execute(companyId, actionType, params, ctx = {}) {
  const manifest = findSkillForAction(actionType);
  if (!manifest) {
    throw new Error(`unknown skill action: ${actionType}`);
  }

  const supplierSearch = actionType === "sourcing.searchSuppliers";
  if (supplierSearch && ctx.role !== "PurchasingManager") throw new Error("Supplier web search is restricted to the Purchasing Manager.");
  if (supplierSearch && ctx.charter?.demoMode) return { ok: true, ...simulateSupplierSearch(params) };

  // Connector pre-flight — every required connector must be active.
  for (const kind of manifest.requiredConnectors) {
    const conn = await connectors.getByKind(companyId, kind);
    if (!conn) {
      const msg = `connector "${kind}" not configured for ${actionType}`;
      await append(companyId, {
        kind: "action", role: ctx.role, action: actionType, status: "error", note: msg,
      });
      return { ok: false, error: msg };
    }
  }

  const outflow = ['stripe.refund', 'qbo.payBill', 'shopify.refundOrder'].includes(actionType);
  if (outflow && !ctx.charter?.demoMode) {
    const amount = Number(params.amount);
    const state = await treasury.getState(companyId);
    const currency = String(params.currency || ctx.charter?.rules?.currency || '').toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(ctx.cap) || amount > ctx.cap
      || currency !== state.currency || state.balance - amount < (ctx.charter?.rules?.reserveFloor || 0)) {
      return { ok: false, error: 'Payment needs an explicit amount within this role’s cap, matching treasury currency and reserve floor.' };
    }
    if (actionType === 'qbo.payBill' && Number(params.payload?.TotalAmt) !== amount) return { ok: false, error: 'QuickBooks payment amount must match the amount approved for this task.' };
  }
  const financeLocal = ["finance.reconcilePayouts", "finance.listEvidence", "finance.readEvidence"].includes(actionType);
  const operational = Object.hasOwn(OPERATIONAL_ACTIONS, actionType);
  const operationalExternal = OPERATIONAL_ACTIONS[actionType]?.external === true;
  const localAction = (operational && !operationalExternal) || actionType.startsWith("team.") || financeLocal || actionType.startsWith("gmao.") || actionType.startsWith("field.");
  let result = operationalExternal && ctx.charter?.demoMode ? {status:'simulated',summary:'Simulation only. No supplier message or invoice was submitted.'} : operational ? await executeOperationalAction(companyId, actionType, params) : actionType.startsWith("team.") ? await executeTeamAction(companyId, actionType, params, ctx) : financeLocal ? await executeFinanceLocal(companyId, actionType, params, ctx) : localAction
    ? await executeLocalAction(companyId, actionType, params, ctx)
    : ctx.charter?.demoMode
      ? await _mockExecute(manifest, actionType, params)
      : await executeConnectorAction(companyId, actionType, params, ctx.idempotencyKey || `${companyId}:${actionType}:${ctx.issueId || Date.now()}`);

  if (!result || result.ok === false) return result || { ok: false, error: 'No result returned.' };
  if (supplierSearch) result = await saveSupplierSearchEvidence(companyId, result, ctx);
  const simulated = ctx.charter?.demoMode === true && !localAction;
  // Connector acknowledgements are not settled cash. Keep provider receipts for
  // reconciliation; never mutate the cash ledger from unverified amounts.
  const reconciliationRequired = !simulated && (outflow || actionType === 'stripe.chargeOnFile');
  const outcome = reconciliationRequired ? { ...result, reconciliationRequired: true, status: 'requires_input',
    message: 'The provider receipt is saved. Verify the financial outcome and reconcile the company ledger before confirming completion. Do not repeat the payment.' } : result;

  await append(companyId, {
    kind: "action",
    role: ctx.role,
    action: actionType,
    status: simulated ? "simulated" : outcome.status || "executed",
    note: outcome.message || outcome.summary || _summarize(actionType, params),
    txOrLink: result.shareLink || null,
  });

  return { ok: true, ...outcome, ...(simulated ? { simulated: true, status: 'simulated' } : {}) };
}

async function _mockExecute(manifest, actionType, params) {
  // Tiny, deterministic stub responses that look like real return shapes.
  // Real per-skill wiring would replace this dispatch table.
  switch (actionType) {
    case "twilio.sendSMS":
      return { id: `SM_${Date.now()}`, summary: `SMS to ${params.to}`, shareLink: null };
    case "twilio.placeCall":
      return { id: `CA_${Date.now()}`, summary: `Call to ${params.to}` };
    case "qbo.createInvoice":
      return { id: `INV_${Date.now()}`, summary: `Invoice for customer ${params.customerId}`, total: _sumLines(params.lines) };
    case "qbo.sendInvoice":
      return { summary: `Sent invoice ${params.invoiceId}`, shareLink: `https://qbo.example/inv/${params.invoiceId}` };
    case "stripe.createCheckout":
      return { sessionId: `cs_${Date.now()}`, shareLink: `https://checkout.stripe.com/c/cs_${Date.now()}` };
    case "shopify.createProduct":
      return { id: `prod_${Date.now()}`, shareLink: `https://shop.example/products/prod_${Date.now()}` };
    case "shopify.fulfillOrder":
      return { summary: `Order ${params.orderId} fulfilled (${params.carrier} ${params.trackingNumber})` };
    case "printful.submitOrder":
      return { id: `PFO_${Date.now()}`, summary: `Submitted ${params.items?.length || 0} items to Printful` };
    case "gcal.createEvent":
      return { id: `evt_${Date.now()}`, summary: `${params.title} @ ${params.start}` };
    case "gbp.respondReview":
      return { summary: `Reply posted to review ${params.reviewId}` };
    case "doc.generateProposal":
      return { id: `prop_${Date.now()}`, shareLink: `https://files.local/proposals/prop_${Date.now()}.pdf` };
    case "field.prepareWorkOrder":
      return { jobId: params.jobId, summary: `Brief sent to human ${params.humanId}` };
    case "field.completeJob":
      return { jobId: params.jobId, summary: `Job ${params.jobId} marked complete with ${params.photoUrls?.length || 0} photos` };
    case "clio.createMatter":
      return { id: `MAT_${Date.now()}`, summary: `Matter opened for client ${params.clientId} (${params.practiceArea})` };
    case "clio.runConflictCheck":
      return { id: `CC_${Date.now()}`, summary: `Conflict check on "${params.partyName}" — no conflicts found`, clear: true };
    case "clio.draftEngagementLetter":
      return { id: `ENG_${Date.now()}`, summary: `Engagement letter drafted for matter ${params.matterId}`, shareLink: `https://files.local/engagement/ENG_${Date.now()}.pdf` };
    case "clio.logTime":
      return { summary: `Logged ${params.minutes}min on matter ${params.matterId}: ${params.narrative?.slice(0, 60) || ""}` };
    case "clio.recordTrustDeposit":
      return { summary: `IOLTA deposit ${params.amount} on ${params.matterId}` };
    case "clio.scheduleCourtDate":
      return { id: `CRT_${Date.now()}`, summary: `Court date ${params.date} on ${params.matterId}` };
    case "meta.createCampaign":
      return { id: `META_${Date.now()}`, summary: `Meta campaign ${params.objective} @ $${params.dailyBudget}/day` };
    case "meta.uploadCreative":
      return { id: `CRV_${Date.now()}`, summary: `Uploaded ${params.mediaUrls?.length || 0} creative(s) to ${params.campaignId}` };
    case "meta.reportPerformance":
      return { summary: `Meta perf for ${params.campaignId}: $X spend, Y impressions (mock)` };
    case "gads.createCampaign":
      return { id: `GAD_${Date.now()}`, summary: `Google Ads ${params.type} @ $${params.dailyBudget}/day` };
    case "gads.adjustBids":
      return { summary: `${params.campaignId} → ${params.strategy} target ${params.target}` };
    case "gads.reportPerformance":
      return { summary: `Google Ads perf for ${params.campaignId} (mock)` };
    case "notion.createPage":
      return { id: `NTN_${Date.now()}`, summary: `Notion page "${params.title}"`, shareLink: `https://notion.so/p/NTN_${Date.now()}` };
    case "notion.appendBlock":
      return { summary: `Appended to ${params.pageId}` };
    case "notion.queryDB":
      return { summary: `Queried ${params.databaseId} (mock — 0 rows)` };
    case "newsletter.publish":
      return { id: `BCAST_${Date.now()}`, summary: `Published "${params.subject}" to ${params.segmentId || "all"}`, shareLink: `https://newsletter.example/issues/BCAST_${Date.now()}` };
    case "newsletter.scheduleSequence":
      return { summary: `Subscriber ${params.subscriberId} added to sequence ${params.sequenceId}` };
    case "newsletter.reportPerformance":
      return { summary: `Newsletter ${params.broadcastId}: 42% open, 8% click (mock)` };
    case "course.createLesson":
      return { id: `LSN_${Date.now()}`, summary: `Lesson "${params.title}" added to ${params.courseId}` };
    case "course.enrollStudent":
      return { summary: `Enrolled ${params.email} in ${params.courseId}` };
    case "course.scheduleDrip":
      return { summary: `Drip scheduled: lesson ${params.lessonId} releases ${params.releaseAt}` };
    case "course.issueCertificate":
      return { id: `CERT_${Date.now()}`, summary: `Certificate issued to student ${params.studentId}`, shareLink: `https://files.local/certs/CERT_${Date.now()}.pdf` };
    case "calendly.shareLink":
      return { summary: `Booking link shared with ${params.to}`, shareLink: `https://calendly.com/demo/${params.eventTypeId}` };
    case "calendly.cancelEvent":
      return { summary: `Cancelled ${params.eventId}: ${params.reason || ""}` };
    case "calendly.reportNoShows":
      return { summary: `0 no-shows in window (mock)` };
    case "slack.postMessage":
      return { summary: `Posted to #${params.channel}: ${params.text?.slice(0, 80) || ""}` };
    case "slack.dmUser":
      return { summary: `DM'd ${params.userId}` };
    case "slack.updateStatus":
      return { summary: `Workspace status: ${params.emoji || ""} ${params.text || ""}` };
    case "linear.createIssue":
      return { id: `LIN-${Date.now() % 10000}`, summary: `Filed: "${params.title}" [${params.priority || "normal"}]`, shareLink: `https://linear.app/demo/LIN-${Date.now() % 10000}` };
    case "linear.assignIssue":
      return { summary: `Assigned ${params.issueId} → ${params.assigneeId}` };
    case "linear.moveToCycle":
      return { summary: `Moved ${params.issueId} to active cycle` };
    default:
      return { summary: `[mock] executed ${actionType}` };
  }
}

function _sumLines(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
}

function _summarize(actionType, params) {
  const k = Object.keys(params || {})[0];
  return `${actionType}${k ? ` (${k}=${String(params[k]).slice(0, 60)})` : ""}`;
}
