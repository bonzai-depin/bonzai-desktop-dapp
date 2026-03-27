/**
 * OWS Migration Service
 *
 * Migrates legacy deterministic wallets into the OWS vault.
 * Uses importWalletPrivateKey — same private key, same address,
 * no on-chain setAgentWallet() call needed.
 */

import { owsService } from './ows.service.js';
import { agentWalletService } from './agentWallet.service.js';

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
 * 1. Read existing private key from Electron Store
 * 2. Import into OWS vault with same key (same address)
 * 3. Generate passphrase, create API key
 * 4. Store OWS wallet mapping
 *
 * @param {string} companionId - Companion ID
 * @returns {Promise<{success: boolean, address?: string, walletName?: string, error?: string}>}
 */
export async function migrateCompanion(companionId) {
  try {
    // Step 1: Get existing credentials
    const credentials = await agentWalletService.getAgentWalletCredentials(companionId);
    if (!credentials) {
      return { success: false, error: `No legacy wallet found for companion ${companionId}` };
    }

    // Step 2: Check if already migrated
    const existingMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
    if (existingMapping) {
      return { success: true, address: existingMapping.address, walletName: existingMapping.walletName };
    }

    // Step 3: Generate passphrase and wallet name
    const passphrase = generatePassphrase();
    const walletName = `bonzai-companion-${companionId}`;

    // Step 4: Import private key into OWS
    const importResult = await owsService.importWalletPrivateKey(
      walletName,
      credentials.privateKey,
      passphrase
    );
    if (importResult.error) {
      return { success: false, error: `OWS import failed: ${importResult.error}` };
    }

    // Step 5: Create API key for autonomous agent operations
    const apiKeyResult = await owsService.createApiKey(
      `${walletName}-agent`,
      [walletName],
      ['base-spending'],
      passphrase,
      '2027-12-31T23:59:59Z'
    );

    // Step 6: Store passphrase and mapping
    await window.electronAPI?.store?.set(`ows-passphrase-${companionId}`, passphrase);
    if (apiKeyResult && !apiKeyResult.error) {
      await window.electronAPI?.store?.set(`ows-api-key-${companionId}`, apiKeyResult.token);
    }
    await window.electronAPI?.store?.set(`ows-wallet-${companionId}`, {
      walletName,
      address: importResult.address,
      provider: 'ows',
      migratedAt: new Date().toISOString(),
    });

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

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a 32-character random passphrase.
 * @returns {string}
 */
function generatePassphrase() {
  // Use Web Crypto API (available in renderer)
  const bytes = new Uint8Array(24);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Convert to base64url (32 chars from 24 bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export const owsMigrationService = {
  getMigrationStatus,
  migrateCompanion,
  migrateAll,
};

export default owsMigrationService;
