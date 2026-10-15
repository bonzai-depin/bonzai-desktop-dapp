/**
 * OWS Migration Service
 *
 * Migrates legacy deterministic wallets into the OWS vault.
 * Uses importWalletPrivateKey — same private key, same address,
 * no on-chain setAgentWallet() call needed.
 */

import { owsService } from './ows.service.js';
import { agentWalletService } from './agentWallet.service.js';
import { walletCredentials, ensureOWSPassphrase } from './walletCredentials.service.js';
import { CONFIG } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION STATUS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get migration status for all legacy wallets.
 *
 * @returns {Promise<{total: number, migrated: number, pending: number}>}
 */
export async function getMigrationStatus() {
  // List all agent-wallet-* keys in Electron Store
  const allKeys = [];
  try {
    // Check known companions by scanning store
    const owsWallets = await owsService.listWallets();
    const owsNames = new Set((owsWallets || []).map(w => w.name));

    // We can't enumerate all Electron Store keys from renderer,
    // so we return status based on what we know about OWS wallets
    // The caller should pass companion IDs for accurate tracking
    return {
      total: allKeys.length,
      migrated: owsWallets?.length || 0,
      pending: Math.max(0, allKeys.length - (owsWallets?.length || 0)),
    };
  } catch (err) {
    console.error('[OWSMigration] Failed to get migration status:', err);
    return { total: 0, migrated: 0, pending: 0 };
  }
}

/**
 * Migrate a single companion's legacy wallet to OWS.
 *
 * Strategy:
 * 1. Migrate/read the existing key through OS-protected credential storage
 * 2. Import into OWS vault with same key (same address)
 * 3. Generate passphrase, create API key
 * 4. Store OWS wallet mapping
 *
 * @param {string} companionId - Companion ID
 * @returns {Promise<{success: boolean, address?: string, walletName?: string, error?: string}>}
 */
export async function migrateCompanion(companionId) {
  try {
    // Protect existing OWS credentials even when a prior migration already completed.
    const existingMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
    if (existingMapping) {
      await walletCredentials.getOWS(companionId, 'passphrase');
      return { success: true, address: existingMapping.address, walletName: existingMapping.walletName };
    }
    const credentials = await agentWalletService.getAgentWalletCredentials(companionId);
    if (!credentials) {
      return { success: false, error: `No legacy wallet found for companion ${companionId}` };
    }

    // Step 3: Generate passphrase and wallet name
    const passphrase = await ensureOWSPassphrase(companionId);
    const walletName = `bonzai-companion-${companionId}`;

    // Recover a completed import if a previous metadata write was interrupted.
    const existingWallet = await owsService.getWallet(walletName);
    if (existingWallet?.address && existingWallet.address.toLowerCase() !== credentials.address.toLowerCase()) {
      throw new Error('Existing OWS wallet does not match the legacy wallet address');
    }
    const importResult = existingWallet?.address ? existingWallet : await owsService.importWalletPrivateKey(
      walletName, credentials.privateKey, passphrase,
    );
    if (importResult?.error || !importResult?.address) {
      throw new Error('The legacy wallet could not be imported into OWS');
    }

    // Passphrase is already protected; record the successful import before optional capabilities.
    const saved = await window.electronAPI?.store?.set(`ows-wallet-${companionId}`, {
      walletName, address: importResult.address, provider: 'ows', migratedAt: new Date().toISOString(),
    });
    if (saved !== true) throw new Error('The OWS wallet mapping could not be saved');

    // Receive-only companions do not need a spending API token.
    if (CONFIG.agentWallet.enabledOperations?.includes('pay')) {
      let apiKeyResult;
      try {
        apiKeyResult = await owsService.createApiKey(
          `${walletName}-agent`, [walletName], ['base-spending'], passphrase, '2027-12-31T23:59:59Z',
        );
        if (apiKeyResult?.token) await walletCredentials.setOWS(companionId, 'apiKey', apiKeyResult.token);
      } catch {
        if (apiKeyResult?.id) await owsService.revokeApiKey(apiKeyResult.id).catch(() => {});
        console.warn('[OWSMigration] Optional API token was not provisioned');
      }
    }

    console.log(`[OWSMigration] Migrated companion ${companionId}: ${importResult.address}`);
    return { success: true, address: importResult.address, walletName };
  } catch (err) {
    console.error(`[OWSMigration] Failed to migrate companion ${companionId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Migrate all legacy wallets to OWS.
 *
 * @param {string[]} companionIds - List of companion IDs to migrate
 * @param {Function} [onProgress] - Progress callback: (companionId, index, total, result)
 * @returns {Promise<{migrated: number, failed: Array<{companionId: string, error: string}>}>}
 */
export async function migrateAll(companionIds, onProgress) {
  const failed = [];
  let migrated = 0;

  for (let i = 0; i < companionIds.length; i++) {
    const companionId = companionIds[i];
    const result = await migrateCompanion(companionId);

    if (result.success) {
      migrated++;
    } else {
      failed.push({ companionId, error: result.error });
    }

    onProgress?.(companionId, i + 1, companionIds.length, result);
  }

  return { migrated, failed };
}

export const owsMigrationService = {
  getMigrationStatus,
  migrateCompanion,
  migrateAll,
};

export default owsMigrationService;
