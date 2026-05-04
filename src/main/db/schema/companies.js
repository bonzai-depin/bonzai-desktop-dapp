/**
 * Drizzle schema — companies + treasury + approvals + distribution
 * + connectors. ZHC core in one file because every table is small,
 * sibling-shaped, and shares the same `company_id` join axis.
 *
 * Per-company record. The full charter JSON is preserved in `charter`
 * since the schema evolves quickly (template applications, hybrid
 * roles, vetoOverrides etc.) and stable column extraction would slow
 * iteration. Top-level fields used in lookups (name, mode, status,
 * demoMode, templateId) are denormalized for indexing.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    mode: text("mode").notNull(),               // solo | dao
    status: text("status").notNull(),           // active | paused | dissolved
    mission: text("mission"),
    templateId: text("template_id"),
    demoMode: integer("demo_mode", { mode: "boolean" }).default(0),
    charter: text("charter", { mode: "json" }),  // full charter blob
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    byStatus: index("idx_companies_status").on(t.status),
    byMode: index("idx_companies_mode").on(t.mode),
  }),
);

/** ─── Goals ──────────────────────────────────────────────────────── */
export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale"),
    missionAlignment: text("mission_alignment"),
    deadline: text("deadline"),
    status: text("status").notNull(),            // active | completed | cancelled
    createdBy: text("created_by").notNull(),     // ceo | user
    createdByRole: text("created_by_role"),
    cancelReason: text("cancel_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => ({
    byCompanyStatus: index("idx_goals_status").on(t.companyId, t.status),
  }),
);

/** ─── Issues + their attempts ────────────────────────────────────── */
export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    goalId: text("goal_id"),                     // FK to goals — soft (nullable)
    parentIssueId: text("parent_issue_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull(),            // open | in_progress | blocked | done | cancelled
    priority: text("priority").notNull(),        // urgent | high | normal | low
    assigneeRole: text("assignee_role"),
    assigneeCompanion: text("assignee_companion"),
    labels: text("labels", { mode: "json" }),
    createdBy: text("created_by"),               // ceo | user | …
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    byCompanyStatus: index("idx_issues_status").on(t.companyId, t.status),
    byGoal: index("idx_issues_goal").on(t.goalId),
    byRole: index("idx_issues_role").on(t.assigneeRole, t.status),
    byPriority: index("idx_issues_priority").on(t.companyId, t.status, t.priority),
  }),
);

export const issueAttempts = sqliteTable(
  "issue_attempts",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id").notNull(),
    role: text("role"),
    companion: text("companion"),
    status: text("status"),                      // running | done | error | vetoed | queued
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    txOrLink: text("tx_or_link"),
    error: text("error"),
  },
  (t) => ({
    byIssue: index("idx_attempts_issue").on(t.issueId, t.startedAt),
  }),
);

/** ─── Treasury (state + ledger) ──────────────────────────────────── */
export const treasuryState = sqliteTable("treasury_state", {
  companyId: text("company_id").primaryKey(),
  balance: integer("balance").notNull().default(0),       // cents
  totalIn: integer("total_in").notNull().default(0),
  totalOut: integer("total_out").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  updatedAt: integer("updated_at").notNull(),
});

export const treasuryEntries = sqliteTable(
  "treasury_entries",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    direction: text("direction").notNull(),       // in | out
    role: text("role"),
    action: text("action"),                       // recordRevenue | paySupplier | …
    amount: integer("amount").notNull(),          // cents
    currency: text("currency").notNull(),
    source: text("source"),                       // for revenue
    recipient: text("recipient"),                 // for spend
    note: text("note"),
    externalId: text("external_id"),              // Stripe charge id, QBO bill id, …
    balanceAfter: integer("balance_after"),
    ts: integer("ts").notNull(),
  },
  (t) => ({
    byCompany: index("idx_treasury_company").on(t.companyId, t.ts),
    byDirection: index("idx_treasury_direction").on(t.companyId, t.direction, t.ts),
  }),
);

/** ─── Approvals queue (Solo Mode governance) ─────────────────────── */
export const pendingApprovals = sqliteTable(
  "pending_approvals",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    cls: text("cls").notNull(),                   // action class: spend.over.250 | hire | broadcastChannel | …
    action: text("action", { mode: "json" }).notNull(),  // full action JSON
    role: text("role"),
    requestedBy: text("requested_by"),
    requestedAt: integer("requested_at").notNull(),
    decidedAt: integer("decided_at"),
    status: text("status").notNull(),             // pending | approved | rejected | expired
    rejectReason: text("reject_reason"),
  },
  (t) => ({
    byCompanyStatus: index("idx_approvals_status").on(t.companyId, t.status, t.requestedAt),
  }),
);

/** ─── Distribution / published content catalog ───────────────────── */
export const publishedContent = sqliteTable(
  "published_content",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    pipeline: text("pipeline").notNull(),         // text | image | audio | video | …
    prompt: text("prompt"),
    payload: text("payload"),                     // base64 / text — large items reference blob_id
    blobId: text("blob_id"),                      // FK to blobs.id when applicable
    blobExt: text("blob_ext"),
    role: text("role"),
    companion: text("companion"),
    price: integer("price").default(0),           // cents
    currency: text("currency").default("USD"),
    sales: integer("sales").default(0),
    revenue: integer("revenue").default(0),
    shareLink: text("share_link"),
    meta: text("meta", { mode: "json" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byCompany: index("idx_pub_company").on(t.companyId, t.createdAt),
    byPipeline: index("idx_pub_pipeline").on(t.companyId, t.pipeline),
  }),
);

/** ─── Connectors (third-party service bindings) ──────────────────── */
export const connectors = sqliteTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    kind: text("kind").notNull(),                 // twilio | quickbooks | stripe | …
    label: text("label"),
    authType: text("auth_type").notNull(),        // oauth2 | apiKey | basic | none
    scopes: text("scopes", { mode: "json" }),
    accountIdentifier: text("account_identifier"),
    status: text("status").notNull(),             // needs_auth | active | expired | revoked | broken
    error: text("error"),
    // Secret bytes do NOT live here — they're in OS keychain (or the
    // legacy electron-store secret slot in v0). This row only stores
    // metadata + a stable id the keychain entry can look up.
    secretRef: text("secret_ref"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastValidatedAt: integer("last_validated_at"),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => ({
    byCompany: index("idx_connectors_company").on(t.companyId, t.status),
    byKind: index("idx_connectors_kind").on(t.companyId, t.kind),
  }),
);

/** ─── Human roster (named workers for hybrid roles) ──────────────── */
export const humanRoster = sqliteTable(
  "human_roster",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    contractorStatus: text("contractor_status"),  // owner | W2 | 1099
    contact: text("contact", { mode: "json" }),
    skills: text("skills", { mode: "json" }),
    isPhysical: integer("is_physical", { mode: "boolean" }).default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byCompany: index("idx_humans_company").on(t.companyId),
  }),
);
