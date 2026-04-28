/**
 * BonzAI Company — Demo Mode
 *
 * Scripted CEO + role planners that produce credible-looking JSON plans
 * WITHOUT calling the local LLM. Used for:
 *   1. Pitch demos (no GPU / model setup required)
 *   2. Onboarding (companies tick the moment they're formed)
 *   3. The Live "watch me work" feed (always has fresh content)
 *
 * The planners are template-aware: they read the active company's
 * template id, pull from `initialGoals`, and prefer skill actions
 * granted to the role over built-in actions so the demo showcases the
 * connector + skill primitives in action.
 *
 * Determinism: scripted output is light-randomized for variety but
 * idempotent within a single tick — no side effects beyond the return
 * value.
 */

import { getTemplate } from "./templates.js";
import { getManifest } from "./skillManifests.js";

// ─────────────────────────────────────────────────────────────────────────
// CEO planner
// ─────────────────────────────────────────────────────────────────────────

/**
 * Produce a scripted CEO plan for one heartbeat. Returns the same shape
 * the LLM would emit: `{ goals: [...] }`.
 *
 * @param {object} charter
 * @param {object} context — { activeGoalTitles?: string[] }
 */
export function scriptedCEOPlan(charter, context = {}) {
  const tpl = getTemplate(charter.template?.id);
  const seed = tpl?.initialGoals || [];
  const used = new Set((context.activeGoalTitles || []));

  // Phase 1: drain the template's initialGoals one per tick
  const next = seed.find((g) => !used.has(g));
  if (next) {
    return {
      goals: [
        {
          title: next,
          rationale: _missionRationale(charter, next),
          mission_alignment: _missionRationale(charter, next),
          tasks: _decomposeIntoTasks(next, charter),
        },
      ],
    };
  }

  // Phase 2: cyclic recurring goals from a small pool, pacing the company
  const cycle = _recurringGoals(charter, tpl);
  const idx = (context.tickCount || 0) % cycle.length;
  return {
    goals: [
      {
        title: cycle[idx].title,
        rationale: cycle[idx].rationale,
        mission_alignment: cycle[idx].rationale,
        tasks: cycle[idx].tasks,
      },
    ],
  };
}

function _missionRationale(charter, goalTitle) {
  const mission = (charter.mission || "").trim();
  return `Advances the mission ("${_truncate(mission, 90)}") via concrete daily output.`;
}

/**
 * Decompose a CEO directive into 1-3 child task strings. Heuristic:
 * - One task = the directive itself, routed by first verb
 * - For mission-heavy companies (newsletter, POD), add a CMO follow-up
 *   ("broadcast …") so the demo shows multiple roles cooperating
 * - For service companies (HVAC, law), add a CSO follow-up
 */
function _decomposeIntoTasks(goalTitle, charter) {
  const tasks = [{ title: goalTitle, description: "Auto-decomposed from CEO directive (demo mode)." }];

  const tplId = charter.template?.id;
  const lower = goalTitle.toLowerCase();

  // Production goals → add a marketing follow-up
  if (/^(ship|publish|launch|draw|write|compose|film|mint|list)/.test(lower) && _roleFilled(charter, "CMO")) {
    tasks.push({
      title: `broadcast the new output across active channels`,
      description: "Marketing follow-up to amplify production work.",
    });
  }

  // Service intake / outreach goals → add a CSO follow-up
  if (/(audit|review|reconcile|review)/i.test(goalTitle) && _roleFilled(charter, "CSO")
      && (tplId === "solo_law" || tplId === "hvac_residential")) {
    tasks.push({
      title: `reply to any pending customer messages flagged today`,
      description: "Customer-success follow-up after any audit-style task.",
    });
  }

  return tasks.slice(0, 3);
}

function _roleFilled(charter, roleKey) {
  return !!charter.roles?.[roleKey]?.companion;
}

/**
 * Recurring-goal pool tuned per template so the demo doesn't get stale
 * after the seeded initialGoals are consumed.
 */
function _recurringGoals(charter, tpl) {
  const tplId = tpl?.id;
  const generic = [
    {
      title: "Review yesterday's audit log and surface anomalies",
      rationale: "Operational hygiene — keeps the company self-aware about its own outputs.",
      tasks: [{ title: "audit yesterday's actions for anything outside expected ranges" }],
    },
    {
      title: "Reply to every customer message from the last 24 hours",
      rationale: "Same-day responsiveness is core to the brand promise.",
      tasks: [{ title: "reply to every open inbox thread in brand voice" }],
    },
  ];

  switch (tplId) {
    case "hvac_residential":
      return [
        ...generic,
        {
          title: "Generate this week's seasonal campaign brief",
          rationale: "Seasonal cadence drives PMA renewals and new bookings.",
          tasks: [{ title: "draft a seasonal AC tune-up email for the customer base" }],
        },
        {
          title: "Schedule today's tech routes by proximity",
          rationale: "Route density determines daily margin — every minute matters.",
          tasks: [{ title: "schedule today's stops across active technicians by proximity" }],
        },
      ];

    case "pod_shop":
      return [
        ...generic,
        {
          title: "Draw 3 design concepts aligned with current trend signals",
          rationale: "Daily new-design velocity is the primary driver of organic discovery.",
          tasks: [{ title: "draw 3 design concepts in the established niche" }],
        },
        {
          title: "List 2 new products to the storefront with hero images and copy",
          rationale: "Consistent product velocity drives store organic traffic.",
          tasks: [{ title: "publish 2 new products with hero images, alt text, and pricing" }],
        },
      ];

    case "solo_law":
      return [
        ...generic,
        {
          title: "Run conflict checks on any new intakes from the last 7 days",
          rationale: "Conflict-checking before engagement is bar-mandated.",
          tasks: [{ title: "audit new intakes for adverse-party conflicts" }],
        },
        {
          title: "Reconcile this week's IOLTA trust deposits",
          rationale: "IOLTA reconciliation is non-optional — discipline drives trust.",
          tasks: [{ title: "audit IOLTA deposits against open matters in QuickBooks" }],
        },
      ];

    case "marketing_agency":
      return [
        ...generic,
        {
          title: "Pull yesterday's spend + ROAS across every active client",
          rationale: "Daily performance reads are how clients judge agency value.",
          tasks: [{ title: "analyze yesterday's spend and surface campaigns below ROAS target" }],
        },
        {
          title: "Send weekly client reports for every retainer",
          rationale: "Consistent reporting cadence is a retention driver.",
          tasks: [{ title: "broadcast weekly performance briefs to every active client" }],
        },
      ];

    default:
      return generic;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Role planner
// ─────────────────────────────────────────────────────────────────────────

/**
 * Produce a scripted role plan: `{ actions: [...] }`.
 *
 * Strategy:
 *   1. Try a granted skill action whose verb matches the goal
 *   2. Else, role-default built-in action
 *   3. Else, single benign "publishContent" or "replyToInbox"
 */
export function scriptedRolePlan(charter, roleKey, goal) {
  const isProducer = roleKey.startsWith("Producer:");
  const grantedSkills = charter.roles?.[roleKey]?.grantedSkills || [];
  const goalText = goal?.directive || goal?.title || "";

  // 1) Skill actions take precedence — show off the connector layer
  const skillAction = _pickSkillAction(grantedSkills, goalText, charter);
  if (skillAction) {
    return { actions: [skillAction] };
  }

  // 2) Producer roles → one produce() call for their pipeline
  if (isProducer) {
    const pipeline = roleKey.split(":")[1] || "text";
    return {
      actions: [
        {
          type: "produce",
          pipeline,
          prompt: _producerPrompt(pipeline, goalText, charter),
          price: _defaultPriceFor(pipeline),
        },
      ],
    };
  }

  // 3) Per-role default fallback
  const defaults = _defaultActionsForRole(roleKey, goalText, charter);
  if (defaults.length) return { actions: defaults };

  // 4) Last resort: a benign reply
  return {
    actions: [
      { type: "replyToInbox", text: `Working on: ${_truncate(goalText, 80)}` },
    ],
  };
}

/**
 * Heuristic skill picker. Walks the role's grantedSkills, finds the
 * first manifest whose verb-affinity matches the goal text, returns a
 * shaped action with stub-friendly params.
 */
function _pickSkillAction(grantedSkills, goalText, charter) {
  const lower = goalText.toLowerCase();

  for (const sid of grantedSkills) {
    const m = getManifest(sid);
    if (!m || !m.actions?.length) continue;
    for (const a of m.actions) {
      if (_actionVerbMatch(a.type, lower)) {
        return _shapeSkillAction(a, goalText, charter);
      }
    }
  }

  // No verb match — pick the FIRST action of the FIRST granted skill so
  // the demo always shows skill activity rather than always falling back.
  for (const sid of grantedSkills) {
    const m = getManifest(sid);
    if (m?.actions?.length) {
      return _shapeSkillAction(m.actions[0], goalText, charter);
    }
  }

  return null;
}

const VERB_AFFINITY = {
  // skill action → preferred goal verbs
  "twilio.broadcastSMS":     ["broadcast", "post", "announce", "promote", "blast"],
  "twilio.sendSMS":          ["reply", "engage", "respond", "follow"],
  "twilio.placeCall":        ["call", "outreach"],
  "qbo.createInvoice":       ["invoice", "bill", "charge"],
  "qbo.recordPayment":       ["reconcile", "audit", "record"],
  "qbo.payContractor":       ["pay"],
  "stripe.createCheckout":   ["sell", "checkout", "monetize"],
  "stripe.chargeOnFile":     ["charge", "renew"],
  "gcal.createEvent":        ["schedule", "book", "set"],
  "gcal.findSlots":          ["find", "schedule"],
  "shopify.createProduct":   ["list", "publish", "ship"],
  "shopify.fulfillOrder":    ["fulfill", "ship", "send"],
  "printful.submitOrder":    ["fulfill", "send", "ship", "produce"],
  "meta.createCampaign":     ["broadcast", "promote", "launch", "advertise"],
  "meta.uploadCreative":     ["upload", "publish"],
  "meta.reportPerformance":  ["analyze", "review", "audit", "pull"],
  "gads.createCampaign":     ["broadcast", "promote", "advertise"],
  "gads.reportPerformance":  ["analyze", "review", "audit", "pull"],
  "gbp.respondReview":       ["reply", "respond"],
  "gbp.requestReview":       ["request", "ask"],
  "field.prepareWorkOrder":  ["dispatch", "assign", "schedule"],
  "field.followUp":          ["follow", "reply", "retain"],
  "fulfillment.assignToHuman": ["assign", "ship", "fulfill"],
  "clio.runConflictCheck":   ["audit", "check", "screen"],
  "clio.draftEngagementLetter": ["draft", "engage", "write"],
  "clio.scheduleCourtDate":  ["schedule", "set"],
  "clio.recordTrustDeposit": ["reconcile", "record"],
  "doc.generateProposal":    ["draft", "write", "propose"],
  "esign.sendEnvelope":      ["sign", "engage"],
  "notion.createPage":       ["log", "document", "publish"],
};

function _actionVerbMatch(actionType, lowerGoal) {
  const verbs = VERB_AFFINITY[actionType];
  if (!verbs) return false;
  for (const v of verbs) {
    if (lowerGoal.includes(v)) return true;
  }
  return false;
}

/**
 * Build a stub-friendly shaped action with credible-looking params.
 * Mock executor in skillsRegistry returns useful results from these.
 */
function _shapeSkillAction(actionDef, goalText, charter) {
  const t = actionDef.type;
  const truncate60 = _truncate(goalText, 60);

  // Hand-pick params per action type so the audit log reads naturally.
  switch (t) {
    case "twilio.sendSMS":
      return { type: t, to: "+15551234567", body: truncate60 };
    case "twilio.broadcastSMS":
      return { type: t, recipients: ["+15551234567", "+15559876543"], body: truncate60 };
    case "twilio.placeCall":
      return { type: t, to: "+15551234567", script: truncate60 };
    case "qbo.createInvoice":
      return { type: t, customerId: "demo-customer-1", lines: [{ desc: truncate60, amount: 250 }], dueDate: "+14d" };
    case "qbo.recordPayment":
      return { type: t, invoiceId: "demo-inv-1", amount: 250, method: "ach" };
    case "qbo.payContractor":
      return { type: t, contractorId: "demo-1099-1", amount: 180, memo: truncate60 };
    case "stripe.createCheckout":
      return { type: t, priceId: "price_demo_1", quantity: 1, successUrl: "/thanks", cancelUrl: "/" };
    case "stripe.chargeOnFile":
      return { type: t, customerId: "demo-customer-1", amount: 49, memo: truncate60 };
    case "gcal.createEvent":
      return { type: t, calendarId: "primary", title: truncate60, start: "+1d", end: "+1d+1h", attendees: [] };
    case "shopify.createProduct":
      return { type: t, title: truncate60, description: goalText, price: 29, imageUrl: "demo://img", variants: [] };
    case "shopify.fulfillOrder":
      return { type: t, orderId: "demo-order-1", trackingNumber: "1Z999AA10123456784", carrier: "UPS" };
    case "printful.submitOrder":
      return { type: t, items: [{ id: "demo-item-1", qty: 1 }], recipient: { name: "Demo Buyer" } };
    case "meta.createCampaign":
      return { type: t, objective: "conversions", dailyBudget: 50, audienceId: "demo-audience-1" };
    case "meta.uploadCreative":
      return { type: t, campaignId: "demo-camp-1", mediaUrls: ["demo://creative"], copy: truncate60 };
    case "meta.reportPerformance":
      return { type: t, campaignId: "demo-camp-1", from: "-7d", to: "now" };
    case "gads.createCampaign":
      return { type: t, type: "search", dailyBudget: 75, keywords: ["best service near me"] };
    case "gads.reportPerformance":
      return { type: t, campaignId: "demo-gads-1", from: "-7d", to: "now" };
    case "gbp.respondReview":
      return { type: t, reviewId: "demo-rev-1", body: `Thanks for the kind words!` };
    case "gbp.requestReview":
      return { type: t, customerContact: "demo-customer@example.com" };
    case "field.prepareWorkOrder":
      return { type: t, humanId: "tech-1", jobId: "job-demo-1", brief: truncate60 };
    case "field.followUp":
      return { type: t, jobId: "job-demo-1" };
    case "fulfillment.assignToHuman":
      return { type: t, humanId: "packer-1", orderId: "demo-order-1", instructions: truncate60 };
    case "clio.runConflictCheck":
      return { type: t, partyName: "Demo Adverse Party", relatedNames: [] };
    case "clio.draftEngagementLetter":
      return { type: t, matterId: "demo-matter-1", scope: truncate60, feeStructure: "flat" };
    case "clio.scheduleCourtDate":
      return { type: t, matterId: "demo-matter-1", court: "Demo County Superior Court", date: "+30d", type: "hearing" };
    case "clio.recordTrustDeposit":
      return { type: t, matterId: "demo-matter-1", amount: 5000, source: "client retainer" };
    case "doc.generateProposal":
      return { type: t, templateId: "default", customer: { name: "Demo Customer" }, lineItems: [{ desc: truncate60, amount: 1500 }] };
    case "esign.sendEnvelope":
      return { type: t, templateId: "engagement", signers: [{ email: "demo@example.com" }] };
    case "notion.createPage":
      return { type: t, databaseId: "demo-db", title: truncate60, body: goalText };
    default:
      return { type: t };
  }
}

function _producerPrompt(pipeline, goalText, charter) {
  const brand = charter.identity?.brandName || charter.name || "the company";
  return `${goalText} — for ${brand}. Match brand voice from the charter mission.`;
}

function _defaultPriceFor(pipeline) {
  return ({ text: 1, image: 3, audio: 2, video: 9, "3d": 5, music: 4, vision: 0, fineTune: 25, skill: 19 }[pipeline] ?? 1);
}

/**
 * Default built-in actions per role when no skill matches.
 */
function _defaultActionsForRole(roleKey, goalText, charter) {
  const truncate80 = _truncate(goalText, 80);
  switch (roleKey) {
    case "CEO":
      return [{ type: "proposeCharterAmendment", note: truncate80 }];
    case "CFO":
      return [{ type: "publishFinancialReport", title: "Weekly financials", text: truncate80 }];
    case "CMO":
      return [{ type: "broadcastChannel", channel: "email", copy: truncate80 }];
    case "CSO":
      return [{ type: "replyToInbox", to: "inbox", text: truncate80 }];
    case "COO":
      return [{ type: "assignWorkload", note: truncate80 }];
    case "GeneralCounsel":
      return [{ type: "publishComplianceReport", title: "Compliance check-in", text: truncate80 }];
    case "RnDLead":
      return [{ type: "runPromptExperiment", note: truncate80 }];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────

function _truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
