/**
 * Drizzle schema — companions, companion_memory, roleplay_sessions,
 * roleplay_messages.
 *
 * Today's largest single user-data volume — RoleplayChat sessions
 * grow into 50MB JSON blobs that block startup. Moving to SQL
 * indexes + sqlite-vec semantic memory recall is the unlock.
 *
 * Companions table is the off-chain mirror of the on-chain ERC-721
 * NFT (when one exists) plus default + custom companions. The
 * `is_custom` + `is_default` flags mark which list a row came from
 * so the BrowseAgents / RoleplayChat UI can filter by source.
 *
 * companion_memory holds per-companion memory shards (long-term
 * facts, preferences, learned data). Indexed by `scope` so the
 * retrieval pass can pull the right slice into the prompt context.
 *
 * roleplay_sessions + roleplay_messages let the UI page through
 * conversation history without parsing the entire blob — the hot
 * path "load last 50 messages of session X" becomes a single
 * indexed range scan.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const companions = sqliteTable(
  "companions",
  {
    id: text("id").primaryKey(),                       // local or NFT-derived
    name: text("name").notNull(),
    firstName: text("first_name"),
    familyName: text("family_name"),
    avatar: text("avatar"),                             // material-symbols icon name or "woman" / "man" / "smart_toy"
    archetype: text("archetype"),                       // human | android
    age: integer("age"),
    gender: text("gender"),
    image: text("image"),                               // data: URL or blobs.id reference
    imagePromptBase: text("image_prompt_base"),
    contentLevelDefault: text("content_level_default"), // PG | PG-13 | Mature | Adult
    isDefault: integer("is_default", { mode: "boolean" }).default(0),
    isCustom: integer("is_custom", { mode: "boolean" }).default(0),

    // Personality + style
    description: text("description"),
    shortBio: text("short_bio"),
    personality: text("personality"),                   // free text or JSON
    appearance: text("appearance"),
    background: text("background"),
    voiceStyle: text("voice_style"),
    voicePersona: text("voice_persona"),
    traits: text("traits", { mode: "json" }),
    compatibleScenarios: text("compatible_scenarios", { mode: "json" }),

    // Big-5 (OCEAN) personality vector + spending profile
    big5: text("big5", { mode: "json" }),               // { openness, conscientiousness, … }
    spendingHabits: text("spending_habits", { mode: "json" }),

    // On-chain identity — populated when minted as an NFT
    chainId: integer("chain_id"),
    contractAddress: text("contract_address"),
    tokenId: text("token_id"),
    agentWallet: text("agent_wallet"),

    // Local presentation, social-token metadata and selected workflow IDs.
    extraJson: text("extra_json", { mode: "json" }),

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    byCustom: index("idx_companions_custom").on(t.isCustom, t.updatedAt),
    byDefault: index("idx_companions_default").on(t.isDefault),
    byName: index("idx_companions_name").on(t.name),
  }),
);

export const companionMemory = sqliteTable(
  "companion_memory",
  {
    id: text("id").primaryKey(),
    companionId: text("companion_id").notNull(),
    scope: text("scope").notNull(),                     // long_term_user | session | preference | learned_fact | appearance | tone
    content: text("content").notNull(),
    importance: integer("importance"),                   // 1..10 retrieval weight
    sessionId: text("session_id"),                       // optional FK
    createdAt: integer("created_at").notNull(),
    lastRecalledAt: integer("last_recalled_at"),
  },
  (t) => ({
    byCompanion: index("idx_mem_companion").on(t.companionId, t.scope),
    bySession: index("idx_mem_session").on(t.sessionId),
  }),
);

export const roleplaySessions = sqliteTable(
  "roleplay_sessions",
  {
    id: text("id").primaryKey(),                        // legacy session key string
    companionId: text("companion_id").notNull(),
    scenarioKey: text("scenario_key"),
    contentLevel: text("content_level"),                // PG | PG-13 | Mature | Adult
    modes: text("modes", { mode: "json" }),             // ["text", "image", "audio", "video", "vision"]
    summary: text("summary"),                           // periodically-regenerated for retrieval/search
    startedAt: integer("started_at").notNull(),
    lastActiveAt: integer("last_active_at"),
    archived: integer("archived", { mode: "boolean" }).default(0),
  },
  (t) => ({
    byCompanion: index("idx_rps_companion").on(t.companionId, t.lastActiveAt),
    byActive: index("idx_rps_active").on(t.archived, t.lastActiveAt),
  }),
);

export const roleplayMessages = sqliteTable(
  "roleplay_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    role: text("role").notNull(),                       // user | assistant | companion | system | generation
    text: text("text"),

    // Multi-modal attachments — references to blobs.id
    audioBlobId: text("audio_blob_id"),
    audioExt: text("audio_ext"),
    imageBlobId: text("image_blob_id"),
    imageExt: text("image_ext"),
    videoBlobId: text("video_blob_id"),
    videoExt: text("video_ext"),

    // For companion turns: the LLM call that produced this message
    generationId: text("generation_id"),                // FK to generations.id

    // Free-form metadata (token counts, model used, content_level, etc.)
    meta: text("meta", { mode: "json" }),

    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    bySession: index("idx_rpm_session").on(t.sessionId, t.createdAt),
    byRole: index("idx_rpm_role").on(t.sessionId, t.role),
  }),
);
