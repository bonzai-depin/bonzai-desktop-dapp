/**
 * Drizzle schema — generations.
 *
 * Every text/image/audio/video/3D/music/vision/fineTune/skill run
 * gets a row here. Today these vanish on app close (inferenceStore is
 * Pinia in-memory only); migrating them to SQLite is the biggest
 * data-loss bug fix in the BonzAI roadmap.
 *
 * Multi-modal outputs (an image gen produces a PNG; a video gen
 * produces an MP4 + a thumbnail PNG) reference `blobs.id` via the
 * `outputBlobs` JSON array — each entry { blobId, ext, role }. Text-
 * only outputs (LLM, vision, code) live in `outputText`.
 *
 * `triggeredBy` lets us answer "what did Aurore generate this week?"
 * or "what did the HVAC company's CMO produce?" without ad-hoc joins:
 *   user                 — direct user click
 *   companion:<id>       — companion-driven (RoleplayChat, autonomous)
 *   role:<key>:<companyId> — ZHC dispatch
 *   skill:<id>           — agentic skill execution
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    pipeline: text("pipeline").notNull(),                  // text | image | audio | video | 3d | music | vision | fineTune | skill
    mode: text("mode"),                                     // image: turbo | standard | advanced | quality | …
    prompt: text("prompt"),
    negativePrompt: text("negative_prompt"),
    systemPrompt: text("system_prompt"),

    // Model attribution
    modelKey: text("model_key"),                            // llm_qwen3_5_4b, FLUX-Klein, etc.
    modelFilename: text("model_filename"),

    // Pipeline-specific params (JSON: steps, guidance, fps, frames, seed, etc.)
    params: text("params", { mode: "json" }),

    // Outputs
    outputText: text("output_text"),                        // text/vision/3D code/skill output
    outputBlobs: text("output_blobs", { mode: "json" }),    // [{ blobId, ext, role: "image"|"audio"|"video"|"thumbnail" }]

    // Performance
    durationMs: integer("duration_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),

    // Source attribution — the answers to "who triggered this"
    triggeredBy: text("triggered_by"),                      // user | companion:<id> | role:<roleKey>:<companyId> | skill:<skillId>
    companyId: text("company_id"),
    skillId: text("skill_id"),
    companionId: text("companion_id"),
    sessionId: text("session_id"),                          // FK to roleplay_sessions when applicable

    // Lifecycle
    status: text("status").notNull(),                       // running | done | error | cancelled
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => ({
    byPipeline: index("idx_gen_pipeline").on(t.pipeline, t.createdAt),
    byTriggered: index("idx_gen_trigger").on(t.triggeredBy, t.createdAt),
    byCompany: index("idx_gen_company").on(t.companyId, t.createdAt),
    bySkill: index("idx_gen_skill").on(t.skillId, t.createdAt),
    byCompanion: index("idx_gen_companion").on(t.companionId, t.createdAt),
    bySession: index("idx_gen_session").on(t.sessionId, t.createdAt),
    byStatus: index("idx_gen_status").on(t.status, t.createdAt),
  }),
);
