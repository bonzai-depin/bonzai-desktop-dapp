/**
 * BonzAI Company — Charter schema, defaults, validator
 *
 * The charter is a JSON document the company reads on every CEO heartbeat.
 * It is the single source of truth for "what does this company do, how
 * does it spend, who fills which role, and which actions need owner
 * approval." Lives in Electron Store (Solo Mode); IPFS-pinned (DAO Mode,
 * separate adapter).
 *
 * This file is mode-agnostic. The DAO governance block is optional.
 */

import { v4 as uuid } from "uuid";

/** Allowed currencies for Solo Mode treasury bookkeeping. */
export const CURRENCIES = ["USD", "EUR", "GBP", "JPY"];

/**
 * Execution modes for grouped task classes.
 *  - sequential: dispatch one at a time (await each call) — minimal RAM, slowest
 *  - parallel:   dispatch concurrently up to maxConcurrent — more RAM, fastest
 *  - swap:       (LLM-only) keep one llama-server, swap models per role
 */
export const EXECUTION_MODES = {
  SEQUENTIAL: "sequential",
  PARALLEL: "parallel",
  SWAP: "swap",
};

/**
 * Pipeline classes the dispatcher tracks for execution-mode purposes.
 * - "llm"        : text + reasoning calls (CEO, CFO, Counsel, Producer:text, etc.)
 * - "diffusion"  : image / audio / video / 3D / music / vision (Flask pipelines)
 *                  Diffusion calls go via electronAPI.inferenceRequest which
 *                  posts to the local Flask server; Flask threads concurrent
 *                  requests but the GPU usually serializes them — parallelism
 *                  here mostly hides JS-side blocking.
 */
export const TASK_CLASSES = ["llm", "diffusion"];

/**
 * LLM gateways a role can be routed through. Different gateways apply
 * different prompt harnesses (system role tags, stop sequences, JSON
 * mode, function-calling spec) tuned for the chosen model family.
 *
 *  - openclaw : default — OpenAI-compatible HTTP API at port 3002.
 *               Best for general-purpose and reasoning models.
 *  - hermes   : Hermes-family harness with native function calling +
 *               structured-output mode. Better for Hermes / NousResearch
 *               models and any model that's been instruction-tuned with
 *               <|im_start|> ChatML markers + tool-call JSON.
 */
export const LLM_GATEWAYS = ["openclaw", "hermes"];

/** Veto modes available per action class in Solo Mode. */
export const VETO_MODES = {
  AUTO: "auto-execute",         // run without owner intervention; logged
  NOTIFY: "notify-and-execute", // run + emit a desktop notification
  APPROVE: "pause-for-approval",// queue and wait for owner click in dapp
};

/** Action classes the veto-mode map can address. */
export const ACTION_CLASSES = [
  "produce.text",
  "produce.image",
  "produce.audio",
  "produce.video",
  "produce.3d",
  "produce.music",
  "produce.vision",
  "produce.fineTune",
  "produce.skill",
  "publishContent",
  "broadcastChannel",
  "replyToInbox",
  "business.development",
  "invoice.create",
  "invoice.send",
  "payment.collect",
  "payment.reconcile",
  "accounting.sync",
  "accounting.closeBooks",
  "process.map",
  "process.improve",
  "spend.under.10",       // pay/transfer < 10 units of charter currency
  "spend.under.50",
  "spend.under.250",
  "spend.over.250",
  "hire",
  "fire",
  "amendCharter",
];

/**
 * The full role library (mode-agnostic). Each role declares an
 * allowed-action mask, a default budget percentage of the per-heartbeat
 * spend cap, and a parent role for reporting.
 */
export const ROLE_LIBRARY = {
  CEO: {
    description:
      "Strategy. Decomposes mission into goals. Files proposals. Cannot execute production.",
    allowedActions: [
      "setGoals",
      "proposeHire",
      "proposeFire",
      "proposeBuyback",
      "proposeCharterAmendment",
      "replyToInbox",
    ],
    budgetPct: 0,
    reportsTo: null,
    teamMax: 1,
    inheritable: false, // CEO never inherits — it's the entry point
  },
  CFO: {
    description: "Treasury. Payments. Financial reports.",
    allowedActions: [
      "paySupplier",
      "executeBuyback",
      "publishFinancialReport",
      "setReserveFloor",
    ],
    budgetPct: 1.0,
    reportsTo: "CEO",
    teamMax: 1,
    inheritable: true,
  },
  CPO: {
    description: "Product. Decides what to ship; reviews quality.",
    allowedActions: [
      "enqueueProduction",
      "reviewOutput",
      "retireOutput",
      "publishProductReport",
    ],
    budgetPct: 1.0,
    reportsTo: "CEO",
    teamMax: 1,
    inheritable: true,
  },
  "Producer:text": {
    description: "Text producer. Articles, copy, code, replies.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "text",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 5,
    inheritable: true,
  },
  "Producer:image": {
    description: "Image producer. Marketing visuals, NFTs, illustrations.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "image",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 5,
    inheritable: true,
  },
  "Producer:audio": {
    description: "Audio producer. TTS, ads, podcast cuts.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "audio",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 3,
    inheritable: true,
  },
  "Producer:video": {
    description: "Video producer. Ads, demo clips, social posts.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "video",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 3,
    inheritable: true,
  },
  "Producer:3d": {
    description: "3D producer. Three.js scenes, AR experiences.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "3d",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 2,
    inheritable: true,
  },
  "Producer:music": {
    description: "Music producer. Songs with vocals + instrumentation.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "music",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 2,
    inheritable: true,
  },
  "Producer:vision": {
    description: "Vision analyst. Reads images / docs and emits text.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "vision",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 2,
    inheritable: true,
  },
  "Producer:fineTune": {
    description: "Fine-tune trainer. Improves the company's models.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "fineTune",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 1,
    inheritable: true,
  },
  "Producer:skill": {
    description: "Skill author. Packages workflows for resale.",
    allowedActions: ["produce", "publishContent"],
    pipeline: "skill",
    budgetPct: 0.5,
    reportsTo: "CPO",
    teamMax: 2,
    inheritable: true,
  },
  CMO: {
    description: "Channels + brand voice + posting cadence.",
    allowedActions: [
      "broadcastChannel",
      "scheduleBroadcast",
      "runCampaign",
      "setBrandVoice",
    ],
    budgetPct: 0.3,
    reportsTo: "CEO",
    teamMax: 5,
    inheritable: true,
  },
  CSO: {
    description: "Sales / customer success. Inbox + retention.",
    allowedActions: [
      "replyToInbox",
      "sendCustomerOffer",
      "recordCustomerSentiment",
      "escalateToCEO",
    ],
    budgetPct: 0.1,
    reportsTo: "CMO",
    teamMax: 5,
    inheritable: true,
  },
  BusinessDevelopment: {
    description:
      "Business development. Finds prospects, drafts outreach, follows up, updates CRM, and routes human handoffs.",
    allowedActions: [
      "replyToInbox",
      "sendCustomerOffer",
      "recordCustomerSentiment",
      "hubspot.upsertContact",
      "hubspot.createDeal",
      "hubspot.advanceDeal",
      "sendgrid.sendEmail",
      "gcal.createEvent",
      "business.development",
    ],
    budgetPct: 0.15,
    reportsTo: "CSO",
    teamMax: 8,
    inheritable: true,
    kind: "business_ops",
  },
  ClientSuccess: {
    description:
      "Client success. Monitors inboxes, renewals, meeting follow-ups, and customer commitments.",
    allowedActions: [
      "replyToInbox",
      "recordCustomerSentiment",
      "hubspot.upsertContact",
      "hubspot.advanceDeal",
      "sendgrid.sendEmail",
      "gcal.createEvent",
    ],
    budgetPct: 0.1,
    reportsTo: "CSO",
    teamMax: 8,
    inheritable: true,
    kind: "business_ops",
  },
  InvoicingSpecialist: {
    description:
      "Invoicing. Prepares invoices, validates line items against the existing process, sends drafts, and tracks due dates.",
    allowedActions: [
      "qbo.createInvoice",
      "qbo.sendInvoice",
      "qbo.reportAR",
      "stripe.createCheckout",
      "invoice.create",
      "invoice.send",
    ],
    budgetPct: 0.2,
    reportsTo: "CFO",
    teamMax: 4,
    inheritable: true,
    kind: "business_ops",
  },
  PaymentsSpecialist: {
    description:
      "Payments. Collects payment links, reconciles received payments, flags disputes, and escalates refunds.",
    allowedActions: [
      "qbo.recordPayment",
      "qbo.reportAR",
      "stripe.createCheckout",
      "stripe.chargeOnFile",
      "stripe.refund",
      "payment.collect",
      "payment.reconcile",
    ],
    budgetPct: 0.2,
    reportsTo: "CFO",
    teamMax: 4,
    inheritable: true,
    kind: "business_ops",
  },
  AccountingSpecialist: {
    description:
      "Accounting. Syncs bookkeeping records, prepares close checklists, flags anomalies, and keeps humans in control.",
    allowedActions: [
      "qbo.reportAR",
      "qbo.recordPayment",
      "publishFinancialReport",
      "accounting.sync",
      "accounting.closeBooks",
    ],
    budgetPct: 0.25,
    reportsTo: "CFO",
    teamMax: 4,
    inheritable: true,
    kind: "business_ops",
  },
  ProcessAnalyst: {
    description:
      "Process analyst. Maps how work already happens, writes SOPs, detects gaps, and suggests automation with approvals.",
    allowedActions: [
      "proposeCharterAmendment",
      "recordPerformance",
      "assignWorkload",
      "rebalanceTeam",
      "process.map",
      "process.improve",
    ],
    budgetPct: 0,
    reportsTo: "COO",
    teamMax: 3,
    inheritable: true,
    kind: "business_ops",
  },
  COO: {
    description: "Workforce. Performance tracking. Hire/fire proposals.",
    allowedActions: [
      "proposeHire",
      "proposeFire",
      "recordPerformance",
      "assignWorkload",
      "rebalanceTeam",
    ],
    budgetPct: 0,
    reportsTo: "CEO",
    teamMax: 1,
    inheritable: true,
  },
  GeneralCounsel: {
    description: "Compliance. Pre-veto pass on every action.",
    allowedActions: [
      "vetoAction",
      "proposeCharterAmendment",
      "publishComplianceReport",
      "updateClassifierRules",
    ],
    budgetPct: 0,
    reportsTo: "CEO",
    teamMax: 1,
    inheritable: true,
    special: "veto", // counsel runs synchronously in the dispatcher
  },
  RnDLead: {
    description: "Improves product. Runs fine-tunes + prompt experiments.",
    allowedActions: [
      "runFineTune",
      "runPromptExperiment",
      "publishExperimentReport",
      "enqueueExperimentalProduction",
    ],
    budgetPct: 0.5,
    reportsTo: "CEO",
    teamMax: 1,
    inheritable: true,
  },

  // ─── Hybrid roles — companion coordinates a named human ────────────
  // The companion never claims to do the physical work; it briefs +
  // tracks + invoices around a real person. See `humanResources` on
  // the role assignment for the people in the loop.
  FieldTech: {
    description:
      "Field-service coordination for a human technician. The companion briefs, "
      + "dispatches, tracks, and invoices around a 1099 / W2 human in the field.",
    allowedActions: [
      "field.prepareWorkOrder",
      "field.trackJob",
      "field.completeJob",
      "field.followUp",
      "twilio.sendSMS",
      "gcal.createEvent",
      "qbo.createInvoice",
      "qbo.payContractor",
    ],
    budgetPct: 0.4,
    reportsTo: "COO",
    teamMax: 25, // up to 25 humans coordinated under one companion
    inheritable: false,
    kind: "human_supported",
  },
  Packer: {
    description:
      "Pack-and-ship coordination for a human packer. The companion routes orders, "
      + "logs shipment data, and reconciles fulfillment outcomes.",
    allowedActions: [
      "fulfillment.assignToHuman",
      "fulfillment.recordShipment",
      "shopify.fulfillOrder",
      "twilio.sendSMS",
    ],
    budgetPct: 0.2,
    reportsTo: "COO",
    teamMax: 10,
    inheritable: false,
    kind: "human_supported",
  },
};

/** Roles that coordinate a real human rather than acting fully autonomous. */
export const HYBRID_ROLE_KEYS = Object.entries(ROLE_LIBRARY)
  .filter(([, def]) => def.kind === "human_supported")
  .map(([k]) => k);

export function isHybridRole(roleKey) {
  return ROLE_LIBRARY[roleKey]?.kind === "human_supported";
}

/**
 * Goal-verb → role routing table. The CEO emits goals using verbs from
 * this table; the dispatcher routes each goal to the owning role's
 * queue. Verbs are case-insensitive and matched as the FIRST WORD of
 * the directive.
 */
export const GOAL_VERB_TO_ROLE = {
  // Production (CPO orchestrates; falls through to Producer:<pipeline>)
  ship: "CPO",
  produce: "CPO",
  mint: "CPO",
  publish: "CPO",
  write: "Producer:text",
  draw: "Producer:image",
  illustrate: "Producer:image",
  render: "Producer:3d",
  compose: "Producer:music",
  speak: "Producer:audio",
  film: "Producer:video",
  // Marketing
  broadcast: "CMO",
  post: "CMO",
  announce: "CMO",
  promote: "CMO",
  schedule: "CMO",
  // Sales / customer
  reply: "CSO",
  engage: "CSO",
  support: "CSO",
  retain: "CSO",
  prospect: "BusinessDevelopment",
  qualify: "BusinessDevelopment",
  followup: "BusinessDevelopment",
  invoice: "InvoicingSpecialist",
  collect: "PaymentsSpecialist",
  reconcile: "PaymentsSpecialist",
  close: "AccountingSpecialist",
  bookkeep: "AccountingSpecialist",
  map: "ProcessAnalyst",
  document: "ProcessAnalyst",
  // Treasury
  pay: "CFO",
  transfer: "CFO",
  topup: "CFO",
  settle: "CFO",
  buyback: "CFO",
  reserve: "CFO",
  burn: "CFO",
  // Operations
  hire: "COO",
  fire: "COO",
  reassign: "COO",
  // R&D
  improve: "RnDLead",
  experiment: "RnDLead",
  finetune: "RnDLead",
  analyze: "RnDLead",
  // Compliance
  audit: "GeneralCounsel",
  comply: "GeneralCounsel",
  // CEO-bound
  propose: "CEO",
  amend: "CEO",
};

// ─────────────────────────────────────────────────────────────────────────
// Defaults & factory
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a fresh charter from a minimal config. Fills sensible defaults
 * for everything the user didn't override. The `mode` field is "solo"
 * by default; passing mode="dao" enables the optional governance block.
 */
export function makeCharter(cfg = {}) {
  const id = cfg.id || uuid();
  const mode = cfg.mode || "solo";

  const charter = {
    id,
    mode,
    name: cfg.name || "Untitled Company",
    mission: cfg.mission || "Operate autonomously and ship daily.",
    operatingMode: cfg.operatingMode || "assist_existing_business",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "active", // active | paused | dissolved
    heartbeat: {
      ceoMin: cfg.heartbeat?.ceoMin ?? 60,
      roleMin: cfg.heartbeat?.roleMin ?? 30,
      cfoMin: cfg.heartbeat?.cfoMin ?? 5,
    },
    rules: {
      currency: cfg.currency || "USD",
      perHeartbeatSpendCap: cfg.perHeartbeatSpendCap ?? 5,
      reserveFloor: cfg.reserveFloor ?? 0,
      forbiddenContent: cfg.forbiddenContent || ["nsfw", "violence"],
      allowedPipelines: cfg.allowedPipelines || ["text"],
      vetoMode: cfg.vetoMode || _defaultVetoModeMap(),
    },
    businessContext: cfg.businessContext || {
      existingProcessSummary: "",
      systemsOfRecord: [],
      humanOwners: [],
      nonReplacementPolicy:
        "Agents support the existing team, follow the current way of working, and escalate anything ambiguous or sensitive.",
      approvalPolicy:
        "Customer-facing, financial, legal, and irreversible actions require explicit approval unless the charter says otherwise.",
    },
    teamMemory: cfg.teamMemory || {
      enabled: true,
      mode: "team-and-role",
      purpose: "Retain business context, decisions, SOPs, outcomes, and feedback so each companion improves in this team.",
      reinforcementSignals: ["approved", "rejected", "corrected", "completed", "reopened"],
    },
    provisioning: cfg.provisioning || {
      allowOnDemandCompanions: true,
      defaultCompanionSource: "existing-roster",
      roleFitPolicy:
        "Provision the smallest useful role, bind it to the team memory, grant only required skills, and keep humans approving sensitive work.",
    },
    /**
     * execution: per-task-class concurrency policy.
     *
     *   llm.mode = "sequential" | "parallel" | "swap"
     *     sequential: one LLM call at a time (await each)
     *     parallel:   spawn / reuse a per-role llama-server instance and dispatch
     *                 concurrently up to maxConcurrent. Bounded by memoryBudgetGB.
     *     swap:       single llama-server, swap models on demand (~30s latency
     *                 between roles using different models)
     *
     *   diffusion.mode = "sequential" | "parallel"
     *     parallel = Promise.all the inferenceRequest calls; the local Flask
     *     server handles concurrent HTTP, GPU usually serializes anyway.
     */
    execution: cfg.execution || {
      llm: {
        mode: EXECUTION_MODES.SWAP,
        maxConcurrent: 2,
        memoryBudgetGB: 22,
      },
      diffusion: {
        mode: EXECUTION_MODES.SEQUENTIAL,
        maxConcurrent: 1,
      },
    },
    roles: cfg.roles || {},
    treasury: cfg.treasury || {
      adapter: "solo-local",
      currency: cfg.currency || "USD",
    },
    distribution: cfg.distribution || {
      publishContent: { adapter: "solo-local", outputDir: null },
      publishOnSocial: { channels: [] },
    },
    identity: {
      brandName: cfg.brandName || cfg.name || "Untitled Company",
      legalWrapper: cfg.legalWrapper ?? null,
      publicProfileURL: cfg.publicProfileURL ?? null,
    },

    /**
     * Template this company was formed from (if any). The wizard sets
     * this; it's also useful for showing a vertical badge in the UI.
     */
    template: cfg.template || null,
    initialGoals: Array.isArray(cfg.initialGoals) ? [...cfg.initialGoals] : [],

    /**
     * Top-level installed skill list — the union of all granted skills
     * across roles, plus anything the user added via the marketplace.
     * Roles can only be granted skills that appear here.
     */
    grantedSkills: Array.isArray(cfg.grantedSkills) ? [...cfg.grantedSkills] : [],

    /**
     * Pending connector setup list — kinds the wizard determined the
     * company needs but the user hasn't auth'd yet. Connectors live in
     * a separate store (companies/<id>/connectors); this field is purely
     * a checklist for the dashboard to surface "Connect Twilio" prompts.
     */
    pendingConnectors: Array.isArray(cfg.pendingConnectors) ? [...cfg.pendingConnectors] : [],

    /**
     * Skill packs applied. Lets us show "this company runs the HVAC
     * Operator pack v1.2" in the dashboard and detect upgrades.
     */
    skillPacks: Array.isArray(cfg.skillPacks) ? [...cfg.skillPacks] : [],

    /**
     * Roster of named humans the company supports / employs / 1099-pays.
     * Hybrid roles reference these via `role.humanResources` (an array
     * of roster ids).
     */
    humanRoster: Array.isArray(cfg.humanRoster) ? [...cfg.humanRoster] : [],

    /**
     * Demo mode — when true, every LLM call is replaced by a scripted
     * planner (see `demoMode.js`). Heartbeat timers run faster than
     * real mode but leave enough time to inspect each handoff. Use for pitch demos,
     * onboarding, and the Live "watch me work" feed without requiring
     * a loaded model. Toggle on/off at runtime — restart-safe.
     */
    demoMode: cfg.demoMode === true,
  };

  if (mode === "dao") {
    charter.governance = cfg.governance || {
      token: null,
      governor: null,
      timelock: null,
      autoBuybackThreshold: null,
    };
  }

  return charter;
}

function _defaultVetoModeMap() {
  /* All production + comms auto-execute. Spending escalates by amount. */
  return {
    "produce.text": VETO_MODES.AUTO,
    "produce.image": VETO_MODES.NOTIFY,
    "produce.audio": VETO_MODES.NOTIFY,
    "produce.video": VETO_MODES.NOTIFY,
    "produce.3d": VETO_MODES.NOTIFY,
    "produce.music": VETO_MODES.NOTIFY,
    "produce.vision": VETO_MODES.AUTO,
    "produce.fineTune": VETO_MODES.APPROVE,
    "produce.skill": VETO_MODES.NOTIFY,
    publishContent: VETO_MODES.NOTIFY,
    broadcastChannel: VETO_MODES.NOTIFY,
    replyToInbox: VETO_MODES.AUTO,
    "business.development": VETO_MODES.NOTIFY,
    "invoice.create": VETO_MODES.APPROVE,
    "invoice.send": VETO_MODES.APPROVE,
    "payment.collect": VETO_MODES.APPROVE,
    "payment.reconcile": VETO_MODES.NOTIFY,
    "accounting.sync": VETO_MODES.NOTIFY,
    "accounting.closeBooks": VETO_MODES.APPROVE,
    "process.map": VETO_MODES.AUTO,
    "process.improve": VETO_MODES.NOTIFY,
    "spend.under.10": VETO_MODES.AUTO,
    "spend.under.50": VETO_MODES.NOTIFY,
    "spend.under.250": VETO_MODES.APPROVE,
    "spend.over.250": VETO_MODES.APPROVE,
    hire: VETO_MODES.APPROVE,
    fire: VETO_MODES.APPROVE,
    amendCharter: VETO_MODES.APPROVE,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate a charter. Returns { ok: true } on success or
 * { ok: false, errors: [...] } on failure. Pure function.
 */
export function validateCharter(charter) {
  const errors = [];
  if (!charter || typeof charter !== "object") {
    return { ok: false, errors: ["charter must be an object"] };
  }
  if (!charter.id) errors.push("charter.id missing");
  if (!charter.name || charter.name.length < 2) errors.push("name too short");
  if (!["solo", "dao"].includes(charter.mode)) errors.push("mode must be solo|dao");
  if (!charter.mission || charter.mission.length < 10) {
    errors.push("mission too short (10 chars min)");
  }

  const hb = charter.heartbeat || {};
  if (!Number.isFinite(hb.ceoMin) || hb.ceoMin < 1) errors.push("heartbeat.ceoMin must be >= 1");
  if (!Number.isFinite(hb.roleMin) || hb.roleMin < 1) errors.push("heartbeat.roleMin must be >= 1");

  const rules = charter.rules || {};
  if (!CURRENCIES.includes(rules.currency)) errors.push(`currency must be one of ${CURRENCIES.join(",")}`);
  if (!Number.isFinite(rules.perHeartbeatSpendCap) || rules.perHeartbeatSpendCap < 0) {
    errors.push("perHeartbeatSpendCap must be a non-negative number");
  }

  const roles = charter.roles || {};
  if (!roles.CEO || !roles.CEO.companion) {
    errors.push("a CEO companion is required");
  }
  const grantedTopLevel = new Set(charter.grantedSkills || []);
  for (const [roleKey, assignment] of Object.entries(roles)) {
    if (!ROLE_LIBRARY[roleKey]) errors.push(`unknown role: ${roleKey}`);
    if (!assignment.companion) errors.push(`role ${roleKey} must declare a companion`);
    // Hybrid roles must reference at least one named human OR be flagged
    // as awaiting roster setup. Empty roster = role can't act.
    if (assignment.kind === "human_supported"
        && !Array.isArray(assignment.humanResources)) {
      errors.push(`hybrid role ${roleKey} must declare humanResources (can be empty array)`);
    }
    // Gateway, if specified, must be in the allowed set.
    if (assignment.gateway && !LLM_GATEWAYS.includes(assignment.gateway)) {
      errors.push(`role ${roleKey} gateway must be one of ${LLM_GATEWAYS.join("|")}`);
    }
    // Granted skills must be a subset of top-level grantedSkills.
    if (Array.isArray(assignment.grantedSkills)) {
      for (const sid of assignment.grantedSkills) {
        if (grantedTopLevel.size && !grantedTopLevel.has(sid)) {
          errors.push(`role ${roleKey} grants skill "${sid}" not installed at company level`);
        }
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Resolve the effective role assignment, walking the inheritance chain
 * if the requested role is unfilled. Returns the companion id that
 * actually gets the work, or null if no candidate found.
 *
 * Inheritance walks `reportsTo` upward. CEO is the terminal fallback
 * and inherits any role marked `inheritable: true`.
 */
export function resolveRoleCompanion(charter, roleKey) {
  let cur = roleKey;
  while (cur) {
    const assignment = charter.roles?.[cur];
    if (assignment?.companion) return { roleKey: cur, companion: assignment.companion };
    const def = ROLE_LIBRARY[cur];
    if (!def) return null;
    if (!def.inheritable && def.reportsTo == null) return null;
    cur = def.reportsTo;
  }
  return null;
}

/**
 * Look up which role owns a goal. Reads the first word of `directive`,
 * lowercases it, strips trailing punctuation, and matches against
 * GOAL_VERB_TO_ROLE.
 */
export function routeGoalToRole(goal) {
  const verb = (goal?.directive || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
  if (!verb) return "CEO"; // fallback — CEO handles unparseable goals
  return GOAL_VERB_TO_ROLE[verb] || "CEO";
}

/**
 * Compute the effective per-role budget cap given the charter's
 * per-heartbeat cap and the role's default percentage. Returns a
 * number in the charter's currency unit.
 */
export function effectiveRoleBudget(charter, roleKey) {
  const def = ROLE_LIBRARY[roleKey];
  if (!def) return 0;
  const explicit = charter.roles?.[roleKey]?.budgetPerHeartbeat;
  if (Number.isFinite(explicit)) return explicit;
  return (charter.rules?.perHeartbeatSpendCap || 0) * (def.budgetPct || 0);
}

/**
 * Resolve the veto mode for an action. Falls back to `auto-execute` if
 * the action class isn't listed.
 */
export function vetoModeFor(charter, actionClass) {
  return charter.rules?.vetoMode?.[actionClass] || VETO_MODES.AUTO;
}
