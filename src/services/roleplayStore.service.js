/**
 * Renderer-side adapter over the SQLite-backed roleplay data layer.
 *
 * Provides the same legacy contract RoleplayChat / BrowseAgents have
 * always called (`{ get, set }` against electron-store) but routes to
 * `electronAPI.db.{companions,roleplay}.*` instead. Falls back to
 * electron-store when the data layer isn't reachable so the app stays
 * usable even with deps uninstalled.
 *
 * Phase 4b scope:
 *   - Companions: fully migrated to SQLite (read + write through this
 *     module). The underlying `roleplayCompanions` electron-store key
 *     is still kept in sync as a read-fallback for one release.
 *   - Sessions: still pass through to electron-store. The next phase
 *     migrates them properly using `bonzai-blob://<id>.<ext>` for
 *     media references so the per-message base64 inflation stops
 *     dominating startup cost.
 *
 * Companion image field:
 *   - Defaults / restored Scarlett: `image` is a `data:image/png;base64,…`
 *     URL the renderer binds directly to <img :src="…">. Already works.
 *   - New roleplay-generated images (Phase 5+): will be `bonzai-blob://`
 *     URLs once the renderer migrates session writes.
 */
import { localVideoPath } from '../utils/roleplayVideo.js';
import { memoryService } from './memory.service.js';
import { companionExtraMetadata } from '../shared/companionMetadata.js';

const COMPANIONS_KEY = "roleplayCompanions";
const COMPANION_LAUNCHES_KEY = "roleplayCompanionLaunches";
// Only migration state lives here. The roster stays in its existing key.
const PENDING_SQLITE_KEY = "roleplayCompanionsPendingSQLite";
const SESSIONS_KEY = "roleplaySessions";

const _api = () => typeof window !== 'undefined' ? window.electronAPI?.db || null : null;

/** Companion records cross IPC and persist as JSON. Reading their JSON
 * values also unwraps nested Vue proxies, which structuredClone cannot do.
 * Preserve integer token IDs exactly when a chain result supplies bigint.
 */
export function serializeCompanionData(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
}

async function _readLocal(key, fallback = null) {
  const store = typeof window !== 'undefined' ? window.electronAPI?.store : null;
  if (store?.get) return store.get(key, fallback);
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(key) : null;
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

async function _legacyCompanions() {
  const stored = await _readLocal(COMPANIONS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

async function _writeLocal(key, value) {
  const store = typeof window !== 'undefined' ? window.electronAPI?.store : null;
  if (store?.set) return store.set(key, value);
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  if (!storage?.setItem) throw new Error('Local companion storage is unavailable.');
  storage.setItem(key, JSON.stringify(value));
}

async function _launchJournal() {
  const rows = await _readLocal(COMPANION_LAUNCHES_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

function _missingRosterHandler(error) {
  return /No handler registered for ['"]db:companions:replaceRoster['"]/.test(String(error?.message || error));
}

async function _rosterFingerprint(rows) {
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function _pendingLocalRoster() {
  const state = await _readLocal(PENDING_SQLITE_KEY);
  if (state?.version !== 1 || !Array.isArray(state.fingerprints)) return null;
  // Missing/corrupt storage must never turn a stale marker into a deletion.
  const rows = await _readLocal(COMPANIONS_KEY);
  if (!Array.isArray(rows)) return null;
  const fingerprint = await _rosterFingerprint(rows);
  return state.fingerprints.includes(fingerprint) ? { rows, fingerprint } : null;
}

async function _savePendingRoster(rows, pending) {
  const fingerprint = await _rosterFingerprint(rows);
  // Write the small marker first. If the roster write fails, its previous
  // accepted local version remains readable; an uncommitted mirror never
  // overrides SQLite. No second roster or per-agent store is introduced.
  await _writeLocal(PENDING_SQLITE_KEY, {
    version: 1,
    fingerprints: [...new Set([pending?.fingerprint, fingerprint].filter(Boolean))],
  });
  await _writeLocal(COMPANIONS_KEY, rows);
}

async function _reconcilePendingRoster(api, pending) {
  const rows = await _restoreLaunches(pending.rows);
  await api.replaceRoster(rows.map(_normalizeCompanionForDB));
  // Clear only after the atomic replacement succeeds, including deletions.
  // A failed clear leaves the same accepted roster safe to retry. A later
  // save must finish this step before committing a different SQL roster.
  await _writeLocal(PENDING_SQLITE_KEY, null);
  return rows;
}

let _companionOperation = Promise.resolve();
function _withCompanionStorage(operation) {
  const result = _companionOperation.then(operation);
  _companionOperation = result.catch(() => {});
  return result;
}

const LAUNCH_FIELDS = ['tokenLaunchTx', 'tokenLaunchStatus', 'txHash', 'launchStatus', 'chainId', 'contractAddress', 'network', 'standard', 'tokenId', 'tokenAddress', 'poolId', 'tokenSymbol', 'agentWallet', 'agentWalletProvider'];
function _launchRecord(companion) {
  const row = { id: companion.id };
  for (const key of LAUNCH_FIELDS) {
    const value = companion[key];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) row[key] = value;
  }
  return row;
}

async function _restoreLaunches(companions) {
  let journal;
  try { journal = await _launchJournal(); } catch { return companions; }
  const byId = new Map(journal.filter(row => row?.id && (row.txHash || row.tokenLaunchTx)).map(row => [row.id, row]));
  return companions.map(companion => {
    const entry = byId.get(companion.id);
    if (!entry || (companion.txHash === entry.txHash && ['confirmed', 'reverted'].includes(companion.launchStatus) && companion.tokenLaunchTx === entry.tokenLaunchTx && companion.tokenLaunchStatus === entry.tokenLaunchStatus)) return companion;
    // A compact journal cannot introduce a companion or overwrite private
    // profile/workflow data. It only recovers its submitted transaction.
    return { ...companion, ..._launchRecord(entry) };
  });
}
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[roleplayStore] companion database unavailable. Error: " +
    (err?.message || err || "no IPC handler"),
  );
}

// ─────────────────────────────────────────────────────────────────────
// Companions
// ─────────────────────────────────────────────────────────────────────

/**
 * Load all companions (defaults + custom). Always returns a flat array,
 * matching the legacy `roleplayCompanions` shape.
 */
export function loadCompanions() {
  return _withCompanionStorage(async () => {
    const api = _api()?.companions;
    const pending = await _pendingLocalRoster();
    if (pending) {
      // A save accepted by an older main process remains authoritative on
      // reload. Once the new handler exists, move that exact roster to SQL.
      if (typeof api?.replaceRoster === 'function') {
        try { return await _reconcilePendingRoster(api, pending); }
        catch (err) { _warnOnce(err); }
      }
      return _restoreLaunches(pending.rows);
    }
    if (api) {
      try {
        const rows = await api.list();
        // Older SQLite imports omitted these metadata fields. Recover only
        // their allowlisted extras from the matching legacy companion; SQL
        // still owns the roster, identity and all dedicated columns.
        let legacy = [];
        try { legacy = await _legacyCompanions(); } catch {}
        const legacyById = new Map(legacy.filter(c => c?.id).map(c => [c.id, c]));
        return _restoreLaunches(Array.isArray(rows) ? rows.map(row => _normalizeCompanionFromDB(row, legacyById.get(row.id))) : []);
      } catch (err) { _warnOnce(err); }
    }
    return _restoreLaunches(await _legacyCompanions());
  });
}

/**
 * Save the full companion roster atomically to SQLite + also
 * mirror back to the legacy electron-store key so any code paths still
 * reading from there (during the migration window) stay in sync.
 */
export function saveCompanions(companions) {
  return _withCompanionStorage(() => _saveCompanions(companions));
}

async function _saveCompanions(companions) {
  if (!Array.isArray(companions)) throw new TypeError('Companion roster must be an array.');
  const list = serializeCompanionData(companions);
  const ids = new Set();
  for (const companion of list) {
    if (!companion || typeof companion.id !== 'string' || !companion.id.trim() || typeof companion.name !== 'string' || !companion.name.trim() || ids.has(companion.id)) {
      throw new TypeError('Every companion requires a unique ID and name.');
    }
    ids.add(companion.id);
  }
  // Store submitted transactions separately from potentially large images.
  // If the full browser roster exceeds its quota, the existing companion
  // still reloads with its pending tx and cannot invite a duplicate launch.
  const launches = list.filter(companion => (companion.txHash && companion.launchStatus) || (companion.tokenLaunchTx && companion.tokenLaunchStatus)).map(_launchRecord);
  if (launches.length) {
    try {
      const previous = await _launchJournal();
      const byId = new Map(previous.filter(row => row?.id).map(row => [row.id, _launchRecord(row)]));
      for (const launch of launches) byId.set(launch.id, launch);
      await _writeLocal(COMPANION_LAUNCHES_KEY, [...byId.values()]);
    } catch {}
  }
  const api = _api()?.companions;
  const pending = await _pendingLocalRoster();
  let databaseSaved = false;
  if (typeof api?.replaceRoster === 'function') {
    try {
      if (pending) await _reconcilePendingRoster(api, pending);
      await api.replaceRoster(list.map(_normalizeCompanionForDB));
      databaseSaved = true;
    } catch (err) {
      _warnOnce(err);
      // Only the old-main missing-handler case permits a durable local
      // save. A real SQL failure must not accept edits or a deletion.
      if (!_missingRosterHandler(err)) {
        throw new Error(`Companions could not be saved: ${err?.message || err}`, { cause: err });
      }
    }
  }
  if (databaseSaved) {
    // SQLite committed. Its optional mirror cannot invalidate that save.
    try { await _writeLocal(COMPANIONS_KEY, list); } catch {}
  } else {
    try { await _savePendingRoster(list, pending); }
    catch (err) {
      throw new Error(`Companions could not be saved: ${err?.message || 'local storage unavailable'}`, { cause: err });
    }
  }
  try { await _writeLocal(COMPANION_LAUNCHES_KEY, launches); } catch {}
  return { saved: true, storage: databaseSaved ? 'sqlite' : 'local' };
}

/**
 * Subscribe to companion-changed broadcasts. Returns unsubscribe.
 */
export function onCompanionsChanged(cb) {
  const api = _api()?.companions;
  if (!api?.onChanged) return () => {};
  return api.onChanged(cb);
}

// ─────────────────────────────────────────────────────────────────────
// Sessions — SQLite-backed, blob-aware
// ─────────────────────────────────────────────────────────────────────
//
// Legacy shape preserved for the renderer:
//   {
//     [sessionKey]: {
//       id, companionId, scenarioKey, contentLevel, modes,
//       startedAt, lastActiveAt,
//       messages: [
//         { id, role, text, image?, audio?, video?, ts, ... }
//       ]
//     }
//   }
//
// The image/audio/video fields used to be inline base64 (`data:` URLs).
// They are now `bonzai-blob://<sha256>.<ext>` URLs that the renderer's
// `<img :src>` / `<audio :src>` / `<video :src>` handle synchronously
// via the registered protocol scheme. Existing rendering code keeps
// working — just the URL format changes.
//
// On save, any inline base64 / data: URL is automatically pushed to
// the blob store and the message row stores blob refs instead.

export async function loadSessions() {
  const api = _api()?.roleplay;
  if (api) {
    try {
      // SQL is the source of truth for messages + structured fields.
      // The legacy electron-store still has the full session blob (Phase
      // 9 cleanup hasn't dropped it yet), and it carries data the SQL
      // import didn't capture: the embedded `scenario` object (used by
      // RoleplayChat to render the scenario name) and per-message
      // metadata fields like `emotion`, `action`, `images` (plural),
      // `isAutonomous`, `generatingText`, etc.
      //
      // We pull both, then merge: SQL provides the canonical message
      // list (with bonzai-blob:// refs for media); legacy fills the
      // gaps. Once Phase 5b regenerates everything cleanly + we drop
      // the legacy mirror, the merge step disappears.
      const [companionRows, scenariosBlob, legacySessions] = await Promise.all([
        loadCompanions(),
        window.electronAPI?.store?.get?.("roleplayScenarios", null),
        window.electronAPI?.store?.get?.(SESSIONS_KEY, null),
      ]);
      const companionsById = new Map(
        (Array.isArray(companionRows) ? companionRows : []).map((c) => [c.id, c]),
      );
      const scenariosArr = Array.isArray(scenariosBlob)
        ? scenariosBlob
        : (scenariosBlob ? Object.values(scenariosBlob) : []);
      const scenariosById = new Map(scenariosArr.map((s) => [s.id, s]));
      const legacyById = legacySessions && typeof legacySessions === "object"
        ? legacySessions : {};

      const sessions = await api.listSessions({});
      const out = {};
      for (const s of sessions) {
        // 5000 covers every observed historical session. If users push
        // past this we'll need to paginate the chat scrollback rather
        // than load the full history into memory upfront.
        const messages = await api.listMessages(s.id, { limit: 5000, oldestFirst: true });
        const legacy = legacyById[s.id] || null;

        // Scenario resolution — three sources, in priority order:
        //   1. Legacy session.scenario (the full embedded object — only
        //      place custom scenarios live)
        //   2. roleplayScenarios store keyed by id (for the 14 defaults)
        //   3. Fallback stub so the UI shows the key not "Unknown Scenario"
        let scenario = legacy?.scenario
          ?? scenariosById.get(s.scenarioKey)
          ?? null;
        if (!scenario && s.scenarioKey) {
          scenario = { id: s.scenarioKey, name: s.scenarioKey, isStub: true };
        }

        out[s.id] = _sessionRowToLegacyShape(s, messages, {
          companion: companionsById.get(s.companionId) || legacy?.companion || null,
          scenario,
          legacy,
        });
      }
      return out;
    } catch (err) { _warnOnce(err); }
  }
  // Legacy fallback — read electron-store
  const stored = await window.electronAPI?.store?.get?.(SESSIONS_KEY, {});
  return stored || {};
}

/**
 * Save the full sessions object. Every save UPSERTs every message —
 * the renderer mutates messages out-of-band (image generation lands
 * after the text save, video later still, regenerate edits content
 * etc.), so any "skip if seen" optimization silently drops media.
 *
 * For NEW messages with inline base64 / data: URL media, the payload
 * gets pushed to the blob store first; the persisted message row holds
 * the resulting blob ref. Already-stored `bonzai-blob://...` URLs are
 * parsed back to refs so re-saves are no-ops on disk.
 */
export async function saveSessions(plainSessions) {
  const api = _api()?.roleplay;
  const blobsApi = _api()?.blobs;
  if (!api || !blobsApi) {
    _warnOnce();
    // Legacy fallback — let it write to electron-store so we don't
    // lose data during a deps-missing window.
    try { await window.electronAPI?.store?.set?.(SESSIONS_KEY, plainSessions); } catch {}
    return;
  }

  for (const [key, sess] of Object.entries(plainSessions || {})) {
    if (!sess) continue;

    // The legacy in-memory shape carries `companion` (full object) +
    // `scenario` (full object). Pull the ids out for the SQL row, but
    // also tolerate flat `companionId` / `scenarioKey` if present.
    const companionId = sess.companion?.id || sess.companionId;
    const scenarioKey = sess.scenario?.id || sess.scenarioKey || null;

    // contentLevel + modes live under `settings` in the renderer's blob,
    // not at the top level. Tolerate both shapes so older serializations
    // still land correctly. The session key (parts[2] / parts[3]) is
    // the source of truth — it's immutable — so prefer it over saved
    // settings, which can drift if a load path defaults the wrong way.
    const keyParts = String(key).split("__");
    const contentLevel = keyParts[2]
      ?? sess.contentLevel
      ?? sess.settings?.contentLevel
      ?? null;
    const modes = (keyParts[3] ? keyParts[3].split("+").filter(Boolean) : null)
      ?? sess.modes
      ?? _modesFromSettings(sess.settings)
      ?? (typeof sess.settings?.responseMode === "string"
            ? sess.settings.responseMode.split("+").filter(Boolean)
            : null);

    // Always upsert session metadata — startedAt / lastActiveAt /
    // contentLevel can change on the user's side.
    try {
      await api.upsertSession({
        id: key,
        companionId,
        scenarioKey,
        contentLevel,
        modes,
        summary: sess.summary ?? null,
        startedAt: sess.startedAt || _firstMessageTs(sess) || Date.now(),
        lastActiveAt: sess.lastActiveAt || _lastMessageTs(sess) || Date.now(),
        archived: !!sess.archived,
      });
    } catch (err) { _warnOnce(err); }

    // Build message rows. The renderer uses `history` as the canonical
    // key (line 4423/4487 of RoleplayChat.vue); `messages` is a
    // fallback for any new code that's already migrated.
    const messages = sess.history || sess.messages || [];
    const toUpsert = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      // Stable id required so multi-step turns (text → image → video)
      // hit the same SQL row across saves. The renderer assigns ids on
      // push (see _msgId in RoleplayChat.vue); position-based fallback
      // is only for legacy in-flight messages predating that change.
      const messageId = m.id || `${key}_${i}`;

      // Resolve blob payloads
      const row = {
        id: messageId,
        sessionId: key,
        role: m.role || "system",
        text: m.text ?? m.content ?? null,
        meta: _captureMessageMeta(m),
        createdAt: m.ts || m.timestamp || (sess.startedAt + i),
      };
      try {
        Object.assign(row, await _resolveMediaRefs(m, blobsApi, messageId));
      } catch (err) {
        // Don't fail the whole save on a single bad blob — log + skip
        console.warn(`[roleplayStore] media resolution failed for ${messageId}:`, err?.message);
      }
      toUpsert.push(row);
    }

    if (toUpsert.length) {
      try {
        const res = await api.upsertMessages(toUpsert);
        if (res && typeof res.upserted === "number" && res.upserted !== toUpsert.length) {
          console.warn(
            `[roleplayStore] upsertMessages count mismatch for ${key}: ` +
            `sent ${toUpsert.length}, got ${res.upserted}`,
          );
        }
      } catch (err) {
        // Surface every save failure — _warnOnce hid silent recurring
        // failures during the corruption-era debugging.
        console.error(
          `[roleplayStore] upsertMessages failed for ${key} (${toUpsert.length} rows):`,
          err?.message || err,
        );
      }
    }

    try {
      await memoryService.ingestRoleplaySession(key, {
        ...sess,
        companionId,
        scenarioKey,
        history: messages,
        updatedAt: sess.updatedAt || Date.now(),
      });
    } catch (err) {
      console.warn(`[roleplayStore] memory enrichment failed for ${key}:`, err?.message || err);
    }
  }

  // Mirror to electron-store during the migration window so the
  // pre-migration code paths (if any are still around) see the same
  // data. Phase 9 cleanup removes this.
  try { await window.electronAPI?.store?.set?.(SESSIONS_KEY, plainSessions); } catch {}
}

/**
 * SQLite session + message rows → legacy in-memory shape.
 *
 * RoleplayChat's contract (line 6113 of RoleplayChat.vue):
 *   `if (session.companion && session.scenario && session.history) …`
 *
 * So the persisted shape MUST include the full `companion` + `scenario`
 * objects (not just ids) and the messages list MUST be named `history`.
 * Without that, sessions render as "Unknown Scenario" with 0 messages.
 *
 * Blob refs on messages become `bonzai-blob://<sha256>.<ext>` URLs the
 * renderer's `<img :src>` / `<audio :src>` / `<video :src>` can drop
 * in directly via the registered protocol scheme.
 */
function _sessionRowToLegacyShape(sess, messages, ctx = {}) {
  // Build a lookup of legacy messages by id so we can fill in fields
  // the SQL import didn't capture (emotion, action, images plural,
  // isAutonomous, generatingText, etc.). Falls back to position when
  // the SQL row's id is a legacy synthetic like
  // `legacy_<sessionKey>_<idx>` — strip the prefix to get the index.
  const legacyHistory = ctx.legacy?.history || ctx.legacy?.messages || [];
  const legacyById = new Map(legacyHistory.map((m, i) => [m.id || `__idx_${i}`, m]));

  const history = messages.map((m, i) => {
    // Prefer real legacy match, fall back to positional for our
    // synthetic legacy_<key>_<i> ids
    const legacy = legacyById.get(m.id)
      ?? legacyById.get(`__idx_${i}`)
      ?? legacyHistory[_legacyIndexFromSyntheticId(m.id)]
      ?? null;

    // SQL `text` column holds the original `m.content` (the importer
    // saved `m.text ?? m.content` into it). The renderer reads
    // `msg.content`, so map back.
    const content = m.text ?? legacy?.content ?? legacy?.text ?? "";

    // Media: prefer SQL blob refs (fast, content-addressed) over
    // legacy inline base64 — both render identically via <img :src>.
    const image = m.imageBlobId
      ? `bonzai-blob://${m.imageBlobId}.${m.imageExt || "png"}`
      : (legacy?.image || null);
    const audio = m.audioBlobId
      ? `bonzai-blob://${m.audioBlobId}.${m.audioExt || "mp3"}`
      : (legacy?.audio || null);
    const video = m.videoBlobId
      ? `bonzai-blob://${m.videoBlobId}.${m.videoExt || "mp4"}`
      : (legacy?.video || null);

    // Spread SQL meta + legacy extras so renderer-only fields survive.
    const meta = typeof m.meta === "string" ? _parseJSON(m.meta) : (m.meta || {});
    const out = {
      id: m.id,
      role: m.role,
      content,
      // Renderer-supported extras (preserved from legacy)
      emotion: legacy?.emotion ?? null,
      action: legacy?.action ?? null,
      mediaErrors: legacy?.mediaErrors ?? null,

      images: legacy?.images ?? null,                    // plural — multi-image messages
      isAutonomous: legacy?.isAutonomous ?? false,
      autonomousActivity: legacy?.autonomousActivity ?? null,
      generatingText: false,
      generatingImage: false,
      generatingAudio: false,
      generatingVideo: false,
      isGenerating: false,
      // Media bindings
      image,
      audio,
      video,
      generationId: m.generationId ?? null,
      ts: m.createdAt,
      timestamp: m.createdAt,
      // Spread any captured meta last (model, tokens, etc.)
      ...meta,
    };
    return out;
  });

  // Settings: merge legacy + SQL + session-key parts.
  //
  // The session key is `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`
  // (see RoleplayChat.getSessionKey). The key is IMMUTABLE — a contentLevel
  // change creates a new session — so parts[2]/parts[3] are the
  // source-of-truth original values. Saved settings.contentLevel can
  // drift (e.g., a load path defaulted "adult" → "pg13" then saved that
  // back), but the key never lies.
  //
  // Resolution order: key parts → SQL row → legacy electron-store. The
  // key wins because it can't be retroactively corrupted.
  const idParts = String(sess.id || "").split("__");
  const keyContentLevel = idParts[2] || null;
  const keyResponseMode = idParts[3] || null;

  const modesArr = Array.isArray(sess.modes)
    ? sess.modes
    : (typeof sess.modes === "string" ? _parseJSON(sess.modes) : null);
  const legacySettings = ctx.legacy?.settings || {};
  const settings = {
    ...legacySettings,
    contentLevel: keyContentLevel
      ?? sess.contentLevel
      ?? legacySettings.contentLevel
      ?? null,
    responseMode: keyResponseMode
      ?? legacySettings.responseMode
      ?? (Array.isArray(modesArr) ? modesArr.join("+") : null),
    enableImage: legacySettings.enableImage
      ?? (Array.isArray(modesArr) ? modesArr.includes("image") : false),
    enableAudio: legacySettings.enableAudio
      ?? (Array.isArray(modesArr) ? modesArr.includes("audio") : false),
    enableVideo: legacySettings.enableVideo
      ?? (Array.isArray(modesArr) ? modesArr.includes("video") : false),
    enableVision: legacySettings.enableVision
      ?? (Array.isArray(modesArr) ? modesArr.includes("vision") : false),
  };

  return {
    id: sess.id,
    // The fields RoleplayChat actually reads
    companion: ctx.companion ?? null,
    scenario: ctx.scenario ?? null,
    history,                                            // ← legacy contract
    settings,
    sceneState: ctx.legacy?.sceneState ?? null,
    backgroundImage: ctx.legacy?.backgroundImage ?? null,
    backgroundHistory: ctx.legacy?.backgroundHistory ?? null,
    updatedAt: ctx.legacy?.updatedAt ?? sess.lastActiveAt,
    // Plus auxiliary metadata for completeness / new UIs
    companionId: sess.companionId,
    scenarioKey: sess.scenarioKey,
    contentLevel: sess.contentLevel,
    modes: typeof sess.modes === "string" ? _parseJSON(sess.modes) : sess.modes,
    summary: sess.summary,
    startedAt: sess.startedAt,
    lastActiveAt: sess.lastActiveAt,
    archived: !!sess.archived,
  };
}

/**
 * Importer-generated ids look like
 *   `legacy_<sessionKey>_<index>`
 * — extract the trailing numeric index for positional fallback when
 * matching to legacy messages by id fails.
 */
function _legacyIndexFromSyntheticId(id) {
  const m = String(id || "").match(/_(\d+)$/);
  return m ? Number(m[1]) : -1;
}

/**
 * Walk a legacy message and resolve any inline media to blob refs.
 * Inputs:
 *   - "data:image/png;base64,…"             → write through, return ref
 *   - raw base64 "iVBOR…"                    → sniff format, write, return ref
 *   - "bonzai-blob://abc.png"                → already-stored, parse ref
 *   - undefined / null / non-string          → ignored
 */
async function _resolveMediaRefs(m, blobsApi, sourceId) {
  const out = {};
  const slots = [
    { src: m.image, kind: "image", defaultExt: "png", defaultMime: "image/png", outKey: "imageBlobId", extKey: "imageExt" },
    { src: m.audio, kind: "audio", defaultExt: "mp3", defaultMime: "audio/mpeg", outKey: "audioBlobId", extKey: "audioExt" },
    { src: m.video, kind: "video", defaultExt: "mp4", defaultMime: "video/mp4", outKey: "videoBlobId", extKey: "videoExt" },
  ];
  for (const s of slots) {
    if (typeof s.src !== "string" || !s.src) continue;

    // Already a stored blob ref — just parse out id + ext
    const blobMatch = s.src.match(/^bonzai-blob:\/\/([a-f0-9]{64})\.([a-z0-9]{1,8})$/i);
    if (blobMatch) {
      out[s.outKey] = blobMatch[1].toLowerCase();
      out[s.extKey] = blobMatch[2].toLowerCase();
      continue;
    }

    // Local file path (Flask returns these for TTS/video as audio_path /
    // video_path). Pull the file off disk into the content-addressed
    // blob store before the temp file gets cleaned up.
    const localPath = localVideoPath(s.src);
    if (localPath) {
      try {
        const ext = (localPath.split(".").pop() || s.defaultExt).toLowerCase();
        const ref = await blobsApi.writeFromPath(localPath, ext, {
          mimeType: s.defaultMime,
          source: "roleplay-msg",
          sourceId,
        });
        out[s.outKey] = ref.id;
        out[s.extKey] = ext;
      } catch (err) {
        // File may already be cleaned up — log and leave the field null
        console.warn(`[roleplayStore] writeFromPath failed for ${s.kind}:`, err?.message);
      }
      continue;
    }

    // Inline base64 (data: URL or raw) — push to blob store
    if (s.src.startsWith("data:") || /^[A-Za-z0-9+/=\s]+$/.test(s.src.slice(0, 200))) {
      const ref = await blobsApi.write(s.src, s.defaultExt, {
        mimeType: s.defaultMime,
        source: "roleplay-msg",
        sourceId,
      });
      out[s.outKey] = ref.id;
      out[s.extKey] = s.defaultExt;
    }
  }
  // generationId is its own field, not a blob ref
  if (m.generationId) out.generationId = m.generationId;
  return out;
}

function _firstMessageTs(sess) {
  const msgs = sess?.history || sess?.messages || [];
  for (const m of msgs) if (m?.ts || m?.timestamp) return m.ts || m.timestamp;
  return null;
}
function _lastMessageTs(sess) {
  const msgs = sess?.history || sess?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.ts || m?.timestamp) return m.ts || m.timestamp;
  }
  return null;
}
function _modesFromSettings(s) {
  if (!s) return null;
  const out = ["text"];
  if (s.enableImage)  out.push("image");
  if (s.enableAudio)  out.push("audio");
  if (s.enableVideo)  out.push("video");
  if (s.enableVision) out.push("vision");
  return out.length > 1 ? out : null;
}
function _captureMessageMeta(m) {
  const meta = {};
  for (const k of ["mediaErrors", "workflowResult", "model", "tokens", "tokensIn", "tokensOut", "elapsedMs", "usage", "ttsVoice", "imageModel", "videoModel", "contentLevel", "thinking"]) {
    if (m[k] !== undefined) meta[k] = m[k];
  }
  return Object.keys(meta).length ? meta : null;
}
function _parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

// ─────────────────────────────────────────────────────────────────────
// Companion shape adapters
// ─────────────────────────────────────────────────────────────────────

/**
 * SQLite stores some fields as serialized JSON columns; rehydrate them
 * to objects/arrays so the renderer doesn't have to know the storage
 * shape. Booleans come back as 0/1 (SQLite has no bool); coerce.
 */
function _normalizeCompanionFromDB(row, legacy) {
  const out = {
    ...(row.extraJson == null ? companionExtraMetadata(legacy) : {}),
    ...companionExtraMetadata(row.extraJson),
    ...row,
  };
  delete out.extraJson;
  // Coerce booleans
  out.isCustom = !!row.isCustom;
  out.isDefault = !!row.isDefault;
  // JSON columns may already be parsed (Drizzle's mode: "json") but in
  // case a bulk-imported row lands as a string, parse defensively.
  for (const k of ["traits", "compatibleScenarios", "big5", "spendingHabits"]) {
    if (typeof out[k] === "string") {
      try { out[k] = JSON.parse(out[k]); } catch {}
    }
  }
  return out;
}

/**
 * Renderer hands us the legacy shape; flatten JSON columns + coerce
 * booleans back to 0/1 for storage.
 */
function _normalizeCompanionForDB(c) {
  return {
    id: c.id,
    name: c.name,
    firstName: c.firstName ?? null,
    familyName: c.familyName ?? null,
    avatar: c.avatar ?? null,
    archetype: c.archetype ?? null,
    age: c.age,
    gender: c.gender ?? null,
    image: c.image ?? null,
    imagePromptBase: c.imagePromptBase ?? null,
    contentLevelDefault: c.contentLevelDefault ?? null,
    isDefault: c.isDefault ?? !c.isCustom,
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
    extraJson: companionExtraMetadata(c),
    createdAt: c.createdAt || Date.now(),
    updatedAt: c.updatedAt || Date.now(),
  };
}

/**
 * Resolve a blob reference to a renderable URL the renderer can drop
 * into <img :src> / <audio :src>. Returns the bonzai-blob:// URL when
 * available (Phase 4b protocol scheme), or a `data:` URL fetched via
 * IPC as a fallback.
 *
 * Inputs accepted:
 *   - { blobId, ext, mime? } object
 *   - falsy → null
 */
export function blobUrl(ref) {
  if (!ref?.blobId || !ref?.ext) return null;
  return `bonzai-blob://${ref.blobId}.${ref.ext}`;
}
