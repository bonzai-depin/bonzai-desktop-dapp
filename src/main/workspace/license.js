import { verify, sign, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const PRODUCT = 'bonzai-company-workspace-v1';
export const PRICE = Object.freeze({ currency: 'USDC', units: '1000000', decimals: 6, label: '1 USDC' });
export function signLicense(payload, privateKey) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { body, signature: sign(null, Buffer.from(body), privateKey).toString('base64url') };
}
export function verifyLicense(receipt, publicKey, workspaceId, allowTest = false) {
  try {
    if (!publicKey || !receipt?.body || receipt.body.length > 12000 || !verify(null, Buffer.from(receipt.body), publicKey, Buffer.from(receipt.signature, 'base64url'))) return null;
    const p = JSON.parse(Buffer.from(receipt.body, 'base64url').toString());
    if (p.product !== PRODUCT || p.workspaceId !== workspaceId || p.perpetual !== true || !p.purchaseId || !Number.isFinite(p.issuedAt) || p.issuedAt > Date.now() + 60000 || (!allowTest && p.test)) return null;
    return p;
  } catch { return null; }
}
export function createWorkspaceLicense({ directory, publicKey, allowTest = false, paymentRequired = true }) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'workspace-license.json');
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if(error.code !== 'ENOENT') throw new Error('Workspace license file is unreadable. Restore a backup before continuing.'); saved = { workspaceId: randomUUID() }; }
  if (!/^[a-f0-9-]{36}$/.test(saved.workspaceId || '')) throw new Error('Invalid workspace identity. Restore your license backup.');
  const persist = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(saved), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
  persist();
  const status = () => {
    const receipt = verifyLicense(saved.receipt, publicKey, saved.workspaceId, allowTest);
    return { workspaceId: saved.workspaceId, unlocked: true,
      licensed: Boolean(receipt), bypassed: false, price: PRICE, test: Boolean(receipt?.test) };
  };
  return { status, assert() { if (!status().unlocked) throw new Error('Unlock the company workspace to run business operations.'); },
    activate(receipt) { if (!verifyLicense(receipt, publicKey, saved.workspaceId, allowTest)) throw new Error('Invalid workspace activation receipt.'); saved.receipt = receipt; persist(); return status(); },
    backup() { return saved; },
    restore(backup) { if (!verifyLicense(backup?.receipt, publicKey, backup?.workspaceId, allowTest)) throw new Error('Invalid license backup.'); saved = backup; persist(); return status(); }
  };
}
// Local workflows are free; remote agent payments use their own escrow.
export function needsWorkspaceLicense() { return false; }
