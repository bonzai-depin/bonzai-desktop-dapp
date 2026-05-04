/**
 * One-shot first-boot importer: copy data from electron-store into the
 * new SQLite tables. Per-domain idempotency flags (stored in
 * electron-store under `db.migrated.<table>`) ensure each migration
 * runs at most once per user.
 *
 * Subsequent boots skip already-migrated domains. Legacy electron-store
 * keys are NOT deleted in this pass — kept as a fallback for one
 * release. A later cleanup pass removes them.
 *
 * Each domain has its own importer registered below; the runner walks
 * the registry in dependency order.
 */

import * as auditRepo from "./repos/audit.js";
import * as generationsRepo from "./repos/generations.js";
import * as companiesRepo from "./repos/companies.js";
import * as goalsRepo from "./repos/goals.js";
import * as issuesRepo from "./repos/issues.js";
import * as treasuryRepo from "./repos/treasury.js";
import * as approvalsRepo from "./repos/approvals.js";
import * as distributionRepo from "./repos/distribution.js";
import * as connectorsRepo from "./repos/connectors.js";
import * as companionsRepo from "./repos/companions.js";
import * as roleplayRepo from "./repos/roleplay.js";
import * as skillsRepo from "./repos/skills.js";
import * as embedBackfill from "./embed-backfill.js";
import * as blobStore from "./blobs.js";

const FLAG_PREFIX = "db.migrated.";

/**
 * Domain importers, run in order. Each one returns `{ name, migrated, skipped }`.
 * Throwing aborts subsequent imports — better to stop on first failure
 * than land in a half-migrated state.
 */
const IMPORTERS = [
  { name: "audit", run: importAudit },
  { name: "generations", run: importGenerations },
  { name: "zhc", run: importZhc },
  { name: "companions", run: importCompanions },
  { name: "roleplay", run: importRoleplay },
  { name: "skills", run: importSkills },
  // Moltbook + OpenClaw + web3 mirrors don't have a stable legacy
  // store key set worth migrating — they pre-existed in volatile
  // memory only. New writes land in SQL directly.
  // Phase 5c: enqueue every existing embeddable row for the future
  // worker drain. Cheap (~ms per source table) + idempotent.
  {
    name: "embed_backfill",
    run: () => {
      const counts = embedBackfill.backfillAll();
      const total = Object.values(counts).reduce((acc, n) => acc + (n || 0), 0);
      return { imported: total, perSource: counts };
    },
  },
];

/**
 * Run every unfinished importer. Reads `db.migrated.<name>` flags from
 * the passed-in `store` (electron-store instance) — passed in to avoid
 * importing electron-store from this module (renderer-safe split).
 */
export async function runFirstBootImport(store) {
  const summary = [];
  for (const { name, run } of IMPORTERS) {
    const flag = FLAG_PREFIX + name;
    if (store.get(flag, false)) {
      summary.push({ name, status: "already-migrated" });
      continue;
    }
    try {
      const t0 = Date.now();
      const result = run(store);
      const ms = Date.now() - t0;
      store.set(flag, { migratedAt: Date.now(), ...result });
      summary.push({ name, status: "migrated", ms, ...result });
      console.log(`[db:migrate] ${name}: ${result.imported} rows in ${ms}ms`);
    } catch (err) {
      summary.push({ name, status: "error", error: err.message });
      console.error(`[db:migrate] ${name} failed:`, err);
      // Don't break — try the next domain. The flag stays unset so
      // a future boot retries.
    }
  }
  return summary;
}

/**
 * Audit log: every `companies/<id>/audit` array → SQLite rows.
 *
 * Preserves original `id` + `ts` so the renderer's deduped key + the
 * audit trail's chronology match the legacy state exactly.
 */
function importAudit(store) {
  const allKeys = Object.keys(store.store || {});
  const auditKeys = allKeys.filter((k) => /^companies\/[^/]+\/audit$/.test(k));
  let totalImported = 0;
  let companies = 0;
  for (const key of auditKeys) {
    const arr = store.get(key, []);
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const companyId = key.split("/")[1];
    const rows = arr.map((e) => ({ ...e, companyId }));
    auditRepo.bulkInsert(rows);
    totalImported += rows.length;
    companies += 1;
  }
  return { imported: totalImported, companies };
}

// ─── Generations ─────────────────────────────────────────────────────
//
// Walks every legacy `*Inferences` key (text/image/audio/video/object/
// game + their `unified*` variants + `inferences_backup`) and copies
// each entry into the `generations` table. Output media (base64 image
// /audio/video) gets written through the blob store first; the
// generations row references the resulting sha256.
//
// Idempotent — generations.bulkInsert uses INSERT OR IGNORE so re-runs
// are safe. The first-boot flag still prevents repeat runs.

const PIPELINE_KEY_MAP = {
  textInferences: { pipeline: "text" },
  imageInferences: { pipeline: "image" },
  audioInferences: { pipeline: "audio" },
  videoInferences: { pipeline: "video" },
  objectInferences: { pipeline: "3d" },                  // Three.js generated code
  gameInferences: { pipeline: "skill", mode: "game" },
  unifiedTextInferences: { pipeline: "text", mode: "unified" },
  unifiedImageInferences: { pipeline: "image", mode: "unified" },
  unifiedAudioInferences: { pipeline: "audio", mode: "unified" },
  unifiedVideoInferences: { pipeline: "video", mode: "unified" },
  unifiedObjectInferences: { pipeline: "3d", mode: "unified" },
};

function importGenerations(store) {
  let totalRows = 0;
  let totalBlobs = 0;
  const perKey = {};

  for (const [key, hint] of Object.entries(PIPELINE_KEY_MAP)) {
    const arr = store.get(key, []);
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const stats = importGenerationArray(arr, hint);
    totalRows += stats.rows;
    totalBlobs += stats.blobs;
    perKey[key] = stats;
  }

  // inferences_backup is a legacy flat backup — entries may carry their
  // own `pipeline` field; otherwise we infer from any present payload.
  const backup = store.get("inferences_backup", null);
  if (Array.isArray(backup) && backup.length) {
    const stats = importGenerationArray(backup, { pipeline: null });
    totalRows += stats.rows;
    totalBlobs += stats.blobs;
    perKey["inferences_backup"] = stats;
  }

  return { imported: totalRows, blobsWritten: totalBlobs, perKey };
}

/**
 * Convert a legacy inference array into rows + blobs. Tolerant of the
 * many ad-hoc shapes inferenceStore has used over time.
 */
function importGenerationArray(arr, hint) {
  let rows = 0;
  let blobs = 0;
  const toInsert = [];

  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const pipeline = entry.pipeline || hint.pipeline || _inferPipeline(entry);
    if (!pipeline) continue;

    const ts = Number(entry.ts || entry.timestamp || entry.createdAt || entry.time || Date.now());
    const id = entry.id || `legacy_${ts}_${Math.random().toString(36).slice(2, 8)}`;

    const params = entry.params || entry.options || _extractKnownParams(entry);

    // Pull text-shaped output (text gen, vision, 3D code, skill responses).
    let outputText = entry.text || entry.response || entry.output_text
      || entry.result?.text || entry.result?.response || entry.code || null;
    if (typeof outputText !== "string" && outputText != null) {
      try { outputText = JSON.stringify(outputText); } catch { outputText = null; }
    }

    // Pull blob-shaped outputs (image/audio/video).
    const blobInputs = _extractBlobInputs(entry, pipeline);
    const outputBlobs = [];
    for (const bi of blobInputs) {
      try {
        const ref = blobStore.writeBase64(bi.base64, bi.ext, {
          mimeType: bi.mime,
          source: "generation",
          sourceId: id,
        });
        outputBlobs.push({ blobId: ref.id, ext: bi.ext, role: bi.role });
        if (!ref.dedup) blobs++;
      } catch (err) {
        // Skip a corrupt blob but keep the row — better than losing the prompt
        console.warn(`[migrate:generations] blob write failed for ${id}: ${err?.message}`);
      }
    }

    toInsert.push({
      id,
      pipeline,
      mode: entry.mode || hint.mode || null,
      prompt: entry.prompt || entry.input || entry.userPrompt || null,
      negativePrompt: entry.negativePrompt || entry.negative_prompt || null,
      systemPrompt: entry.systemPrompt || entry.system || null,
      modelKey: entry.modelKey || entry.model || entry.modelname || null,
      modelFilename: entry.modelFilename || entry.filename || null,
      params,
      outputText,
      outputBlobs: outputBlobs.length ? outputBlobs : null,
      durationMs: Number(entry.durationMs || entry.elapsedMs || entry.elapsed) || null,
      tokensIn: Number(entry.tokensIn || entry.promptTokens) || null,
      tokensOut: Number(entry.tokensOut || entry.completionTokens || entry.tokens) || null,
      triggeredBy: entry.triggeredBy || (entry.companion ? `companion:${entry.companion}` : "user"),
      companyId: entry.companyId || null,
      skillId: entry.skillId || null,
      companionId: entry.companionId || entry.companion || null,
      sessionId: entry.sessionId || null,
      status: entry.status === "error" ? "error" : "done",
      error: entry.error || null,
      createdAt: ts,
      finishedAt: ts,
    });
    rows++;
  }

  if (toInsert.length) generationsRepo.bulkInsert(toInsert);
  return { rows, blobs };
}

const _BASE64_RE = /^([A-Za-z0-9+/=\s]+)$/;

/**
 * Pull every base64-shaped media payload from a legacy entry. Handles
 * the menagerie of historical field names: `imageBase64`, `image`,
 * `result.image_base64`, `payload`, `output.audio_base64`, etc.
 */
function _extractBlobInputs(entry, pipeline) {
  const out = [];

  const tryAddImage = (b64) => {
    if (!_isBase64ish(b64)) return;
    const { base64, ext, mime } = _parseDataish(b64, "png", "image/png");
    out.push({ base64, ext, mime, role: "image" });
  };
  const tryAddAudio = (b64) => {
    if (!_isBase64ish(b64)) return;
    const { base64, ext, mime } = _parseDataish(b64, "mp3", "audio/mpeg");
    out.push({ base64, ext, mime, role: "audio" });
  };
  const tryAddVideo = (b64) => {
    if (!_isBase64ish(b64)) return;
    const { base64, ext, mime } = _parseDataish(b64, "mp4", "video/mp4");
    out.push({ base64, ext, mime, role: "video" });
  };

  if (pipeline === "image") {
    tryAddImage(entry.imageBase64 ?? entry.image ?? entry.result?.image_base64
      ?? entry.result?.imageBase64 ?? entry.output?.image_base64 ?? entry.payload);
  } else if (pipeline === "audio" || pipeline === "music") {
    tryAddAudio(entry.audioBase64 ?? entry.audio ?? entry.result?.audio_base64
      ?? entry.result?.audioBase64 ?? entry.output?.audio_base64 ?? entry.payload);
  } else if (pipeline === "video") {
    tryAddVideo(entry.videoBase64 ?? entry.video ?? entry.result?.video_base64
      ?? entry.result?.videoBase64 ?? entry.output?.video_base64 ?? entry.payload);
  }

  // Many video records also carry an audio track + thumbnail. Capture them.
  if (pipeline === "video") {
    if (_isBase64ish(entry.audioBase64 ?? entry.audio)) {
      const { base64, ext, mime } = _parseDataish(entry.audioBase64 ?? entry.audio, "mp3", "audio/mpeg");
      out.push({ base64, ext, mime, role: "audio" });
    }
    if (_isBase64ish(entry.thumbnailBase64 ?? entry.thumbnail)) {
      const { base64, ext, mime } = _parseDataish(entry.thumbnailBase64 ?? entry.thumbnail, "png", "image/png");
      out.push({ base64, ext, mime, role: "thumbnail" });
    }
  }

  return out;
}

function _isBase64ish(v) {
  if (typeof v !== "string" || v.length < 200) return false;
  if (v.startsWith("data:")) return true;
  // Heuristic: long-enough alphanumeric+/=+whitespace string is probably base64
  return _BASE64_RE.test(v.slice(0, 5000));
}

/** Strip `data:<mime>;base64,` if present; sniff mime for PNG/JPG/WEBP/MP3/MP4. */
function _parseDataish(input, defaultExt, defaultMime) {
  let raw = input;
  let mime = defaultMime;
  let ext = defaultExt;
  if (input.startsWith("data:")) {
    const m = input.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      mime = m[1];
      raw = m[2];
      ext = _mimeToExt(mime, defaultExt);
    }
  } else {
    // Sniff first ~12 bytes for a known magic number.
    const head = Buffer.from(raw.slice(0, 16), "base64");
    if (head.slice(0, 8).toString("hex") === "89504e470d0a1a0a") { ext = "png"; mime = "image/png"; }
    else if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) { ext = "jpg"; mime = "image/jpeg"; }
    else if (head.slice(0, 4).toString("ascii") === "RIFF" && head.slice(8, 12).toString("ascii") === "WEBP") { ext = "webp"; mime = "image/webp"; }
    else if (head.slice(0, 4).toString("ascii") === "ftyp" || head.slice(4, 8).toString("ascii") === "ftyp") { ext = "mp4"; mime = "video/mp4"; }
    else if (head.slice(0, 3).toString("hex") === "494433") { ext = "mp3"; mime = "audio/mpeg"; }
    else if (head.slice(0, 4).toString("ascii") === "OggS") { ext = "ogg"; mime = "audio/ogg"; }
  }
  return { base64: raw.replace(/\s+/g, ""), ext, mime };
}

function _mimeToExt(m, fallback) {
  return ({
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/wave": "wav",
    "video/mp4": "mp4", "video/webm": "webm",
    "model/gltf+json": "gltf", "model/gltf-binary": "glb",
  })[m] || fallback;
}

function _inferPipeline(entry) {
  if (entry.imageBase64 || entry.result?.image_base64) return "image";
  if (entry.audioBase64 || entry.result?.audio_base64) return "audio";
  if (entry.videoBase64 || entry.result?.video_base64) return "video";
  if (entry.text || entry.response) return "text";
  return null;
}

function _extractKnownParams(entry) {
  const params = {};
  for (const k of [
    "steps", "guidance", "guidance_scale", "cfg", "seed", "width", "height",
    "num_frames", "fps", "num_inference_steps", "temperature", "max_tokens",
    "top_p", "top_k", "voice", "speaker", "lang", "language",
  ]) {
    if (entry[k] !== undefined) params[k] = entry[k];
  }
  return Object.keys(params).length ? params : null;
}

// ─── ZHC core (companies + everything per-company) ───────────────────
//
// One pass over every `companies/<id>/<thing>` key. Schema parity with
// the renderer-side `services/company/*.js` modules' shapes — they all
// stored arrays/objects under stable key prefixes that are easy to
// walk:
//   companies/index                   string[] of company ids
//   companies/<id>/charter            full charter
//   companies/<id>/goals              [...goals]
//   companies/<id>/issues             [...issues] each may carry .attempts
//   companies/<id>/treasury-state     state record
//   companies/<id>/treasury           ledger array
//   companies/<id>/approvals          pending queue
//   companies/<id>/catalog            published content array
//   companies/<id>/connectors         connector list
function importZhc(store) {
  const all = store.store || {};
  const allKeys = Object.keys(all);
  const companyIds = (store.get("companies/index", []) || []).filter(Boolean);
  // Defensive: also include any company id that has data even if the
  // index doesn't list it.
  const idsFromKeys = new Set();
  for (const k of allKeys) {
    const m = k.match(/^companies\/([^/]+)\//);
    if (m) idsFromKeys.add(m[1]);
  }
  const ids = Array.from(new Set([...companyIds, ...idsFromKeys])).filter((id) => id !== "index");

  const charters = [];
  const goalRows = [];
  const issueRows = [];
  const treasuryStateRows = [];
  const treasuryEntryRows = [];
  const approvalRows = [];
  const distributionRows = [];
  const connectorRows = [];
  let blobsWritten = 0;

  for (const cid of ids) {
    const charter = store.get(`companies/${cid}/charter`, null);
    if (!charter) continue;
    charters.push(charter);

    const goals = store.get(`companies/${cid}/goals`, []);
    if (Array.isArray(goals)) {
      for (const g of goals) goalRows.push({ ...g, companyId: cid });
    }

    const issues = store.get(`companies/${cid}/issues`, []);
    if (Array.isArray(issues)) {
      for (const i of issues) issueRows.push({ ...i, companyId: cid });
    }

    const tState = store.get(`companies/${cid}/treasury-state`, null);
    if (tState) treasuryStateRows.push({ ...tState, companyId: cid });

    const tLedger = store.get(`companies/${cid}/treasury`, []);
    if (Array.isArray(tLedger)) {
      for (const e of tLedger) {
        treasuryEntryRows.push({
          ...e,
          companyId: cid,
          ts: e.ts || e.timestamp || Date.now(),
        });
      }
    }

    const approvals = store.get(`companies/${cid}/approvals`, []);
    if (Array.isArray(approvals)) {
      for (const a of approvals) approvalRows.push({ ...a, companyId: cid });
    }

    // Catalog can either be a flat array under .../catalog OR per-item
    // entries at .../content/<id>. Cover both.
    const catalog = store.get(`companies/${cid}/catalog`, []);
    if (Array.isArray(catalog)) {
      for (const c of catalog) {
        const row = _toDistributionRow(c, cid);
        if (row.blobInput) {
          try {
            const ref = blobStore.writeBase64(row.blobInput.base64, row.blobInput.ext, {
              source: "publish-import",
              sourceId: row.id,
            });
            row.blobId = ref.id;
            row.blobExt = row.blobInput.ext;
            if (!ref.dedup) blobsWritten++;
          } catch {}
          delete row.blobInput;
        }
        distributionRows.push(row);
      }
    }
    for (const k of allKeys) {
      const m = k.match(new RegExp(`^companies/${cid}/content/(.+)$`));
      if (!m) continue;
      const c = store.get(k, null);
      if (!c) continue;
      const row = _toDistributionRow({ ...c, id: c.id || m[1] }, cid);
      if (row.blobInput) {
        try {
          const ref = blobStore.writeBase64(row.blobInput.base64, row.blobInput.ext, {
            source: "publish-import",
            sourceId: row.id,
          });
          row.blobId = ref.id;
          row.blobExt = row.blobInput.ext;
          if (!ref.dedup) blobsWritten++;
        } catch {}
        delete row.blobInput;
      }
      distributionRows.push(row);
    }

    const conns = store.get(`companies/${cid}/connectors`, []);
    if (Array.isArray(conns)) {
      for (const c of conns) connectorRows.push({ ...c, companyId: cid });
    }
  }

  // Bulk-insert each domain. Each repo uses INSERT OR IGNORE so re-
  // runs are safe.
  if (charters.length) companiesRepo.bulkInsert(charters);
  if (goalRows.length) goalsRepo.bulkInsert(goalRows);
  if (issueRows.length) issuesRepo.bulkInsert(issueRows);
  if (treasuryStateRows.length) treasuryRepo.bulkInsertState(treasuryStateRows);
  if (treasuryEntryRows.length) treasuryRepo.bulkInsertEntries(treasuryEntryRows);
  if (approvalRows.length) approvalsRepo.bulkInsert(approvalRows);
  if (distributionRows.length) distributionRepo.bulkInsert(distributionRows);
  if (connectorRows.length) connectorsRepo.bulkInsert(connectorRows);

  return {
    imported:
      charters.length + goalRows.length + issueRows.length +
      treasuryStateRows.length + treasuryEntryRows.length +
      approvalRows.length + distributionRows.length + connectorRows.length,
    companies: charters.length,
    goals: goalRows.length,
    issues: issueRows.length,
    treasuryStates: treasuryStateRows.length,
    treasuryEntries: treasuryEntryRows.length,
    approvals: approvalRows.length,
    catalog: distributionRows.length,
    connectors: connectorRows.length,
    blobsWritten,
  };
}

// ─── Companions (defaults + custom) ─────────────────────────────────
//
// Both `roleplayCompanions` (working list of all 14 — defaults + custom)
// and `roleplayCustomCompanions` (legacy mirror of the user's custom
// companions). The working list wins on conflict — same id collapses
// to one row, so Scarlett ends up with her age=27 + restored profile
// image she set in earlier turns.
function importCompanions(store) {
  const working = store.get("roleplayCompanions", []);
  const customs = store.get("roleplayCustomCompanions", []);
  const list = (Array.isArray(working) ? working : Object.values(working || {}))
    .concat(Array.isArray(customs) ? customs : Object.values(customs || {}));

  const seen = new Map();
  for (const c of list) {
    if (!c?.id) continue;
    if (!seen.has(c.id)) seen.set(c.id, c);
  }
  const rows = [...seen.values()].map((c) => ({
    id: c.id,
    name: c.name || c.id,
    firstName: c.firstName ?? null,
    familyName: c.familyName ?? null,
    avatar: c.avatar ?? null,
    archetype: c.archetype ?? (c.gender === "android" ? "android" : "human"),
    age: c.age,
    gender: c.gender ?? null,
    image: c.image ?? null,
    imagePromptBase: c.imagePromptBase ?? null,
    contentLevelDefault: c.contentLevelDefault ?? null,
    isDefault: !c.isCustom,
    isCustom: !!c.isCustom,
    description: c.description ?? null,
    shortBio: c.shortBio ?? null,
    personality: c.personality ?? null,
    appearance: c.appearance ?? null,
    background: c.background ?? null,
    voiceStyle: c.voiceStyle ?? null,
    voicePersona: c.voicePersona ?? null,
    traits: c.traits ?? null,
    compatibleScenarios: c.compatibleScenarios ?? null,
    big5: c.big5 ?? null,
    spendingHabits: c.spendingHabits ?? null,
    chainId: c.chainId ?? null,
    contractAddress: c.contractAddress ?? null,
    tokenId: c.tokenId ?? null,
    agentWallet: c.agentWallet ?? null,
    createdAt: c.createdAt || Date.now(),
    updatedAt: c.updatedAt || Date.now(),
  }));

  if (rows.length) companionsRepo.bulkInsert(rows);
  return { imported: rows.length, companions: rows.length };
}

// ─── Roleplay (sessions + messages with media → blobs) ──────────────
//
// Sessions live in `roleplaySessions` keyed by composite strings like
// `<companionId>__<scenario>__<contentLevel>__<modes>`. Each session
// has a `messages` array; messages with base64 media (audio/image/video)
// get those payloads written to the blob store and replaced with
// references on the row.
function importRoleplay(store) {
  return importRoleplayFromSessions(store.get("roleplaySessions", null));
}

/**
 * Import roleplay sessions from a raw sessions object (not wrapped in
 * an electron-store). Used by the recovery flow when re-importing from
 * a `config.json.*.bak` backup file: the caller reads the JSON, plucks
 * the `roleplaySessions` key, and hands it directly here.
 *
 * Same logic as the live-store importer — extracted so both paths share
 * the blob-write + row-build code.
 */
export function importRoleplayFromSessions(sessions) {
  if (!sessions || typeof sessions !== "object") {
    return { imported: 0, sessions: 0, messages: 0, blobsWritten: 0 };
  }

  const sessionRows = [];
  const messageRows = [];
  let blobsWritten = 0;

  for (const [key, sess] of Object.entries(sessions)) {
    if (!sess) continue;
    const parts = key.split("__");
    const companionId = sess.companionId || parts[0] || "unknown";
    const scenarioKey = sess.scenarioKey || parts[1] || null;
    // Prefer the key's contentLevel over saved contentLevel — saved
    // values can drift if a previous load defaulted "adult" → "pg13"
    // and persisted that back. The key is immutable.
    const contentLevel = parts[2]
      || sess.settings?.contentLevel
      || sess.contentLevel
      || null;
    const modes = (parts[3] ? parts[3].split("+") : null)
      || sess.modes
      || null;
    const startedAt = sess.startedAt || sess.createdAt || _firstMessageTs(sess) || Date.now();
    const lastActiveAt = sess.lastActiveAt || _lastMessageTs(sess) || startedAt;

    sessionRows.push({
      id: key,
      companionId,
      scenarioKey,
      contentLevel,
      modes,
      summary: sess.summary ?? null,
      startedAt,
      lastActiveAt,
      archived: !!sess.archived,
    });

    const msgs = sess.messages || sess.history || [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!m) continue;
      const row = {
        id: m.id || `legacy_${key}_${i}`,
        sessionId: key,
        role: m.role || "system",
        text: m.text ?? m.content ?? null,
        meta: _captureMessageMeta(m),
        createdAt: m.ts || m.timestamp || (startedAt + i),
      };
      // Audio: base64 OR local file path (Flask audio_path)
      if (typeof m.audio === "string") {
        const written = _writeMediaField(m.audio, "mp3", "audio/mpeg", row.id);
        if (written) {
          row.audioBlobId = written.id; row.audioExt = written.ext;
          if (written.fresh) blobsWritten++;
        }
      }
      // Image: base64 OR local file path
      const imgPayload = m.image || m.imageBase64 || m.imageUrl;
      if (typeof imgPayload === "string") {
        const written = _writeMediaField(imgPayload, "png", "image/png", row.id);
        if (written) {
          row.imageBlobId = written.id; row.imageExt = written.ext;
          if (written.fresh) blobsWritten++;
        }
      }
      // Video: base64 OR local file path (Flask video_path)
      const vidPayload = m.video || m.videoBase64;
      if (typeof vidPayload === "string") {
        const written = _writeMediaField(vidPayload, "mp4", "video/mp4", row.id);
        if (written) {
          row.videoBlobId = written.id; row.videoExt = written.ext;
          if (written.fresh) blobsWritten++;
        }
      }
      messageRows.push(row);
    }
  }

  if (sessionRows.length) roleplayRepo.bulkInsertSessions(sessionRows);
  if (messageRows.length) roleplayRepo.bulkInsertMessages(messageRows);

  return {
    imported: sessionRows.length + messageRows.length,
    sessions: sessionRows.length,
    messages: messageRows.length,
    blobsWritten,
  };
}

/**
 * Write a single media field (image/audio/video) to the blob store,
 * regardless of whether it's a base64 payload or a local file path.
 * Returns `{ id, ext, fresh }` (fresh=false on dedup) or null when
 * neither shape matches / the source is gone.
 */
function _writeMediaField(value, defaultExt, defaultMime, sourceId) {
  if (typeof value !== "string" || !value) return null;
  // Already a stored blob ref — extract id + ext, no rewrite needed.
  const blobMatch = value.match(/^bonzai-blob:\/\/([a-f0-9]{64})\.([a-z0-9]{1,8})$/i);
  if (blobMatch) {
    return { id: blobMatch[1].toLowerCase(), ext: blobMatch[2].toLowerCase(), fresh: false };
  }
  // Base64 payload (data: URL or raw alphanumeric)
  if (_isBase64ish(value)) {
    try {
      const { base64, ext, mime } = _parseDataish(value, defaultExt, defaultMime);
      const ref = blobStore.writeBase64(base64, ext, { mimeType: mime, source: "roleplay-msg", sourceId });
      return { id: ref.id, ext, fresh: !ref.dedup };
    } catch { return null; }
  }
  // Local file path (Flask returns these for TTS / video). Skip URLs.
  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      const ext = (value.split(".").pop() || defaultExt).toLowerCase();
      const ref = blobStore.writeFromPath(value, ext, { mimeType: defaultMime, source: "roleplay-msg", sourceId });
      return { id: ref.id, ext, fresh: !ref.dedup };
    } catch (err) {
      console.warn(`[migrate:roleplay] writeFromPath failed for ${value}: ${err?.message}`);
      return null;
    }
  }
  return null;
}

function _firstMessageTs(sess) {
  const msgs = sess?.messages || sess?.history || [];
  for (const m of msgs) if (m?.ts || m?.timestamp) return m.ts || m.timestamp;
  return null;
}
function _lastMessageTs(sess) {
  const msgs = sess?.messages || sess?.history || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.ts || m?.timestamp) return m.ts || m.timestamp;
  }
  return null;
}
function _captureMessageMeta(m) {
  const meta = {};
  for (const k of ["model", "tokens", "tokensIn", "tokensOut", "elapsedMs", "usage", "ttsVoice", "imageModel", "videoModel", "contentLevel", "thinking"]) {
    if (m[k] !== undefined) meta[k] = m[k];
  }
  return Object.keys(meta).length ? meta : null;
}

// ─── Skills ───────────────────────────────────────────────────────────
//
// Two legacy keys carry meaningful data:
//   - purchasedSkills: array of skill metadata that the user paid for
//   - skillExecutionHistory: array of past skill runs
function importSkills(store) {
  const purchased = store.get("purchasedSkills", []);
  const history = store.get("skillExecutionHistory", []);

  const skillRows = [];
  if (Array.isArray(purchased)) {
    for (const s of purchased) {
      if (!s?.id) continue;
      skillRows.push({
        id: s.id,
        name: s.name || s.id,
        category: s.category ?? null,
        version: s.version ?? null,
        manifest: s.manifest ?? null,
        installedAt: s.installedAt || s.purchasedAt || Date.now(),
        source: s.source || "marketplace",
        purchasedAt: s.purchasedAt ?? null,
        purchasePrice: s.purchasePrice ?? s.price ?? null,
        purchaseCurrency: s.purchaseCurrency ?? s.currency ?? null,
      });
    }
  }
  if (skillRows.length) skillsRepo.bulkInsertSkills(skillRows);

  const runRows = [];
  if (Array.isArray(history)) {
    for (const r of history) {
      if (!r?.skillId) continue;
      runRows.push({
        id: r.id,
        skillId: r.skillId,
        actionType: r.actionType || r.action || "unknown",
        triggeredBy: r.triggeredBy ?? "user",
        companyId: r.companyId ?? null,
        companionId: r.companionId ?? null,
        params: r.params ?? null,
        result: r.result ?? null,
        status: r.status || "executed",
        durationMs: r.durationMs ?? null,
        costEstimateCents: r.costEstimateCents ?? null,
        txHash: r.txHash ?? null,
        shareLink: r.shareLink ?? null,
        createdAt: r.createdAt || r.ts || Date.now(),
      });
    }
  }
  if (runRows.length) skillsRepo.bulkInsertRuns(runRows);

  return { imported: skillRows.length + runRows.length, skills: skillRows.length, runs: runRows.length };
}

/**
 * Lift a legacy catalog/content entry into the published_content row
 * shape. Detects payload base64 and signals `blobInput` for the caller
 * to push to the blob store.
 */
function _toDistributionRow(entry, companyId) {
  const pipeline = entry.pipeline || "text";
  const out = {
    id: entry.id,
    companyId,
    pipeline,
    prompt: entry.prompt ?? null,
    payload: null,
    blobId: null,
    blobExt: null,
    role: entry.role ?? null,
    companion: entry.companion ?? null,
    price: entry.price ?? 0,
    currency: entry.currency ?? "USD",
    sales: entry.sales ?? 0,
    revenue: entry.revenue ?? 0,
    shareLink: entry.shareLink ?? null,
    meta: entry.meta ?? null,
    createdAt: entry.createdAt || entry.ts || Date.now(),
  };
  // Identify payload kind
  if (entry.payload && typeof entry.payload === "string" && _isBase64ish(entry.payload)) {
    if (pipeline === "text" || pipeline === "vision") {
      // Wasn't actually base64 — use as-is
      out.payload = entry.payload;
    } else {
      const ext = ({ image: "png", audio: "mp3", music: "mp3", video: "mp4", "3d": "gltf" })[pipeline] || "bin";
      out.blobInput = { base64: entry.payload, ext };
    }
  } else if (entry.payload != null) {
    out.payload = String(entry.payload);
  }
  return out;
}
