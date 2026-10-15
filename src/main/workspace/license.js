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
    return { workspaceId: saved.workspaceId, unlocked: !paymentRequired || Boolean(receipt),
      licensed: Boolean(receipt), bypassed: !paymentRequired && !receipt, price: PRICE, test: Boolean(receipt?.test) };
  };
  return { status, assert() { if (!status().unlocked) throw new Error('Unlock the company workspace to run business operations.'); },
    activate(receipt) { if (!verifyLicense(receipt, publicKey, saved.workspaceId, allowTest)) throw new Error('Invalid workspace activation receipt.'); saved.receipt = receipt; persist(); return status(); },
    backup() { return saved; },
    restore(backup) { if (!verifyLicense(backup?.receipt, publicKey, backup?.workspaceId, allowTest)) throw new Error('Invalid license backup.'); saved = backup; persist(); return status(); }
  };
}
// Keep existing data readable/exportable while locked. Writes and execution are gated in main.
const namespaces = new Set(['companies','goals','issues','audit','automation','approvals','treasury','distribution','connectors','teams','gmao','gmaoMaintenance','purchasing','companyBilling','companySales','companyIntake','companyGrants','companyBrowser','recordOperations','companyPortability']);
const reads = new Set(['get','list','listIds','getById','snapshot','read','readDocument','recent','all','filter','summarize','state','counts','export','exportDossier','exportSubcontractorDossier','documentHtml','monographicSheet','partsForOrders','messageTarget','directory','getDossier','searchWorkOrders','inspect']);
export function needsWorkspaceLicense(channel) { const [, ns, method] = channel.split(':'); return namespaces.has(ns) && !reads.has(method) && !/^(get|list|read|search|export|count|healthSummary)/.test(method);  }
