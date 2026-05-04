/**
 * Drizzle schema — audit_entries.
 *
 * The single highest-write-volume table in BonzAI. Every CEO tick,
 * role tick, action dispatch, veto, treasury entry, and LLM thought
 * lands here. Indexed for the live feed's hot queries (per-company
 * recent, per-kind filter, per-issue trail) and the dashboard's KPI
 * aggregations (24h summary).
 *
 * Schema parity with the legacy `companies/<id>/audit` JSON shape so
 * the migration script is a 1:1 row write. Domain-specific extras
 * (LLM trace, treasury direction/amount/currency, approval pendingId,
 * skill connectorId) live in their own columns when commonly queried,
 * else in `extra` (free-form JSON).
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const auditEntries = sqliteTable(
  "audit_entries",
  {
    id: text("id").primaryKey(),                                // uuid
    companyId: text("company_id").notNull(),
    ts: integer("ts").notNull(),                                // ms since epoch

    kind: text("kind").notNull(),                               // system | issue | action | veto | approval | treasury | llm | production
    role: text("role"),                                          // role key — CEO, CFO, Producer:text, …
    action: text("action"),                                      // action type — produce, broadcastChannel, twilio.sendSMS, …
    status: text("status"),                                      // executed | vetoed | error | queued | parse_error | proposed | approved | rejected
    note: text("note"),
    txOrLink: text("tx_or_link"),

    // LLM thought entries — captured raw response + duration. Lives in
    // its own JSON column rather than separate columns because the
    // shape is loose (response can be 2KB, parseError is short, etc.)
    llm: text("llm", { mode: "json" }),                          // { response, durationMs, parseOk, parseError, truncated }

    // Treasury entries — direction lets us aggregate spend vs. revenue.
    direction: text("direction"),                                // in | out (treasury entries only)
    amount: integer("amount"),                                   // cents (int, no float math)
    currency: text("currency"),

    // Cross-references to other tables that this entry relates to.
    // Indexed so the trail-view ("show me every entry that touched
    // issue X") is a single seek.
    pendingId: text("pending_id"),
    goalId: text("goal_id"),
    issueId: text("issue_id"),
    connectorId: text("connector_id"),
    contentId: text("content_id"),

    // Free-form bag for fields that don't (yet) deserve their own column
    extra: text("extra", { mode: "json" }),
  },
  (t) => ({
    byCompanyTs: index("idx_audit_company_ts").on(t.companyId, t.ts),
    byKind: index("idx_audit_kind").on(t.companyId, t.kind),
    byRole: index("idx_audit_role").on(t.companyId, t.role),
    byGoal: index("idx_audit_goal").on(t.goalId),
    byIssue: index("idx_audit_issue").on(t.issueId),
    byConnector: index("idx_audit_connector").on(t.connectorId),
  }),
);
