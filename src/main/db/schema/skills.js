/**
 * Drizzle schema — skills marketplace + execution history + co-ownership.
 *
 * Skills today live as static manifests in `src/services/company/skillManifests.js`;
 * this table mirrors the user's INSTALLED + USED set so the dashboard
 * can show "skills you've run", "top-performing companion co-owners",
 * and per-skill revenue accruals without re-reading manifests on every
 * render.
 *
 * skill_runs powers the "watch your company work" analytics — every
 * skill action dispatched by ZHC's role tick (or by RoleplayChat) gets
 * a row here. Indexed by (skill_id, created_at) for the per-skill
 * usage chart.
 *
 * skill_ownership tracks which companions co-own which skills + how
 * much revenue they've accrued. The on-chain BonzaiSkillOwnership is
 * the source of truth; this table is the local cache for fast reads.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),                       // skill.twilio_sms, skill.meta_ads, …
    name: text("name").notNull(),
    category: text("category"),
    version: text("version"),
    manifest: text("manifest", { mode: "json" }),
    installedAt: integer("installed_at"),
    source: text("source"),                             // builtin | marketplace | dev
    purchasedAt: integer("purchased_at"),
    purchasePrice: integer("purchase_price"),           // cents
    purchaseCurrency: text("purchase_currency"),
  },
  (t) => ({
    byCategory: index("idx_skills_category").on(t.category),
    bySource: index("idx_skills_source").on(t.source),
  }),
);

export const skillRuns = sqliteTable(
  "skill_runs",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id").notNull(),
    actionType: text("action_type").notNull(),         // twilio.sendSMS, qbo.createInvoice, …
    triggeredBy: text("triggered_by"),                  // user | companion:<id> | role:<key>:<companyId>
    companyId: text("company_id"),
    companionId: text("companion_id"),
    params: text("params", { mode: "json" }),
    result: text("result", { mode: "json" }),
    status: text("status").notNull(),                   // executed | error | timeout | vetoed
    durationMs: integer("duration_ms"),
    costEstimateCents: integer("cost_estimate_cents"),
    txHash: text("tx_hash"),
    shareLink: text("share_link"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    bySkill: index("idx_runs_skill").on(t.skillId, t.createdAt),
    byCompany: index("idx_runs_company").on(t.companyId, t.createdAt),
    byStatus: index("idx_runs_status").on(t.status, t.createdAt),
    byCompanion: index("idx_runs_companion").on(t.companionId, t.createdAt),
  }),
);

export const skillOwnership = sqliteTable(
  "skill_ownership",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id").notNull(),
    companionId: text("companion_id").notNull(),
    weightSnapshot: integer("weight_snapshot"),        // BONZAI × profile_score at registration
    profileScore: integer("profile_score"),
    registeredAt: integer("registered_at"),
    lastClaimAt: integer("last_claim_at"),
    totalEarnedCents: integer("total_earned_cents").default(0),
    chainAttestation: text("chain_attestation"),        // EIP-191 sig hash
  },
  (t) => ({
    bySkill: index("idx_ownership_skill").on(t.skillId),
    byCompanion: index("idx_ownership_companion").on(t.companionId),
  }),
);
