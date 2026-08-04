// src/main/externalCredentials.js
//
// R1 (branch-review fix 2) — keep OpenClaw/Hermes' on-disk external
// credential copy in sync with the P1 registry's current external
// credential (see src/main/credentialRegistry.js issueExternalCredential),
// both on in-process rotation (main.js's refreshExternalIntegrationCredentials,
// called from rekeySessionDependents) and at startup.
//
// Startup is the case rotation doesn't cover: a fresh launch's registry has
// NEVER minted an external credential yet (issueExternalCredential is only
// ever called by the openclaw-set-enabled/hermes-set-enabled IPC handlers or
// by a refresh), so an integration a user left enabled in a PRIOR launch is
// stuck holding that launch's token — which died the moment this process
// minted its own fresh registry — until the user notices 401s and manually
// re-toggles. mintStartupExternalCredentials mints a fresh external
// credential up front whenever a persisted "enabled" integration is found,
// so consumers (content-pipeline.js, openclaw.handler.js) never race a
// startup window with a dead credential on disk.
//
// Pulled out of main.js, like openclawServer.js/sessionBridge.js/
// fileAccess.js, so it can be exercised under `node --test` without an
// Electron process. All paths are passed in explicitly — this module has no
// opinion on where OpenClaw/Hermes keep their config.

import fs from "node:fs";

/**
 * True iff OpenClaw's models.json has a top-level `providers.bonzai` entry
 * — the same shape openclaw-set-enabled writes (main.js) and
 * refreshOpenClawCredential rewrites below. openclaw.json (the *other*
 * config OpenClaw reads) never gets a `models.providers.bonzai` key; the
 * enable handler only ever sets its `agents.defaults.model`, so that file
 * cannot be used to detect enablement. Fails closed (false) on any
 * read/parse error.
 */
export function isOpenClawIntegrationEnabled(modelsPath) {
  try {
    if (!fs.existsSync(modelsPath)) return false;
    const modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    return !!modelsConfig.providers?.bonzai;
  } catch {
    return false;
  }
}

/**
 * True iff the BonzAI skill manifest is installed into Hermes' skills
 * directory — the same check hermes-get-enabled makes in main.js.
 */
export function isHermesIntegrationEnabled(skillManifestPath) {
  try {
    return fs.existsSync(skillManifestPath);
  } catch {
    return false;
  }
}

/**
 * Rewrite OpenClaw's models.json `bonzai` provider apiKey in place with a
 * fresh token. A no-op (not an error) when OpenClaw was never enabled —
 * this only rewrites a credential slot that already exists, never creates
 * one. Returns true iff the file was actually updated.
 */
export function refreshOpenClawCredential(token, modelsPath) {
  try {
    if (!token || !fs.existsSync(modelsPath)) return false;
    let modelsConfig;
    try {
      modelsConfig = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
    } catch {
      return false;
    }
    if (!modelsConfig.providers?.bonzai) return false; // integration not enabled
    modelsConfig.providers.bonzai.apiKey = token;
    fs.writeFileSync(modelsPath, JSON.stringify(modelsConfig, null, 2));
    try { fs.chmodSync(modelsPath, 0o600); } catch {}
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrite Hermes' .env BONZAI_API_KEY line in place with a fresh token.
 * Same no-op-when-not-enabled contract as refreshOpenClawCredential above.
 */
export function refreshHermesCredential(token, envPath) {
  try {
    if (!token || !fs.existsSync(envPath)) return false;
    let envContent = fs.readFileSync(envPath, "utf8");
    if (!envContent.includes("BONZAI_API_KEY")) return false; // integration not enabled
    envContent = envContent
      .split("\n")
      .map((line) => (line.startsWith("BONZAI_API_KEY=") ? `BONZAI_API_KEY=${token}` : line))
      .join("\n");
    fs.writeFileSync(envPath, envContent);
    try { fs.chmodSync(envPath, 0o600); } catch {}
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint a fresh external credential and push it to whichever of
 * OpenClaw/Hermes' on-disk configs is currently enabled — but ONLY if at
 * least one of them is, so a launch where neither integration was ever
 * turned on mints nothing. Dependencies are injected so this is testable
 * without touching real files or an Electron `app`:
 *
 * @param {object} deps
 * @param {ReturnType<import("./credentialRegistry.js").createCredentialRegistry>} deps.registry
 * @param {string} deps.scope                     Scope to mint the external credential under.
 * @param {() => boolean} deps.isOpenClawEnabled
 * @param {() => boolean} deps.isHermesEnabled
 * @param {(token: string) => void} deps.refreshOpenClaw
 * @param {(token: string) => void} deps.refreshHermes
 * @returns {string | null} the minted token, or null if nothing was enabled.
 */
export function mintStartupExternalCredentials({
  registry,
  scope,
  isOpenClawEnabled,
  isHermesEnabled,
  refreshOpenClaw,
  refreshHermes,
}) {
  if (!isOpenClawEnabled() && !isHermesEnabled()) return null;
  const token = registry.issueExternalCredential(scope);
  refreshOpenClaw(token);
  refreshHermes(token);
  return token;
}
