/** Explicit wallet-secret IPC. Never fall back to general preferences. */
function bridge() {
  const api = globalThis.window?.electronAPI?.walletCredentials;
  if (!api?.ensureAvailable || !api?.getOWS || !api?.setOWS) {
    throw new Error('Secure wallet storage requires BonzAI Desktop.');
  }
  return api;
}

export const walletCredentials = {
  ensureAvailable: () => bridge().ensureAvailable(),
  getAttestationKey: () => bridge().getAttestationKey(),
  setAttestationKey: secret => bridge().setAttestationKey(secret),
  getOWS: (companionId, kind = 'passphrase') => bridge().getOWS(companionId, kind),
  setOWS: (companionId, kind, secret) => bridge().setOWS(companionId, kind, secret),
  getLegacyWallet: companionId => bridge().getLegacyWallet(companionId),
  setLegacyWallet: (companionId, wallet) => bridge().setLegacyWallet(companionId, wallet),
  deleteLegacyWallet: companionId => bridge().deleteLegacyWallet(companionId),
  getMasterSecret: (create = false) => bridge().getMasterSecret(create),
};

export async function ensureOWSPassphrase(companionId) {
  const api = bridge();
  if (!api.ensureOWSPassphrase) throw new Error('Secure wallet storage requires an updated BonzAI Desktop.');
  return api.ensureOWSPassphrase(companionId);
}
