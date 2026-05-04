/**
 * Web3 mirror repos — off-chain caches of mint records, x402 payments,
 * and MintPool epoch state. The chain is the source of truth; these
 * tables exist so the dashboard renders instantly without network I/O
 * on every paint.
 *
 * Refresh strategy: a background poller (Phase 8b — out of scope here)
 * walks recent chain events every N minutes + upserts here. The
 * renderer reads ONLY from these caches.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import {
  mintRecords, x402Payments, mintpoolEpochs, mintpoolClaims,
} from "../schema/web3.js";

// ─── Mint records ────────────────────────────────────────────────────

export function mintUpsert(mint) {
  const { db, orm } = get();
  const id = mint.id
    || `${mint.chainId}-${mint.contractAddress}-${mint.tokenId}`;
  const existing = db.prepare("SELECT id FROM mint_records WHERE id = ?").get(id);
  const row = {
    id,
    chainId: mint.chainId,
    contractAddress: mint.contractAddress,
    tokenId: mint.tokenId,
    contentType: mint.contentType ?? null,
    ownerWallet: mint.ownerWallet ?? null,
    generationId: mint.generationId ?? null,
    ipfsCid: mint.ipfsCid ?? null,
    txHash: mint.txHash ?? null,
    mintFeeCents: mint.mintFeeCents ?? null,
    royaltyBps: mint.royaltyBps ?? null,
    mintedAt: mint.mintedAt || Date.now(),
  };
  if (existing) orm.update(mintRecords).set(row).where(eq(mintRecords.id, id)).run();
  else orm.insert(mintRecords).values(row).run();
  return row;
}

export function mintsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.ownerWallet) where.push(eq(mintRecords.ownerWallet, filter.ownerWallet));
  if (filter.contentType) where.push(eq(mintRecords.contentType, filter.contentType));
  if (filter.chainId) where.push(eq(mintRecords.chainId, filter.chainId));
  let q = orm.select().from(mintRecords);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(mintRecords.mintedAt)).limit(filter.limit ?? 200).all();
}

// ─── x402 payments ──────────────────────────────────────────────────

export function paymentRecord(p) {
  const { orm } = get();
  const row = {
    id: p.id || uuid(),
    chainId: p.chainId,
    payerWallet: p.payerWallet,
    payeeWallet: p.payeeWallet,
    amountWei: String(p.amountWei),
    pipeline: p.pipeline ?? null,
    sessionId: p.sessionId ?? null,
    sigHash: p.sigHash ?? null,
    txHash: p.txHash ?? null,
    status: p.status || "pending",
    paidAt: p.paidAt ?? null,
    settledAt: p.settledAt ?? null,
  };
  orm.insert(x402Payments).values(row).run();
  return row;
}

export function paymentSettle(id, txHash) {
  const { orm } = get();
  orm.update(x402Payments)
    .set({ status: "settled", txHash, settledAt: Date.now() })
    .where(eq(x402Payments.id, id)).run();
}

export function paymentsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.payerWallet) where.push(eq(x402Payments.payerWallet, filter.payerWallet));
  if (filter.payeeWallet) where.push(eq(x402Payments.payeeWallet, filter.payeeWallet));
  if (filter.status) where.push(eq(x402Payments.status, filter.status));
  if (filter.sessionId) where.push(eq(x402Payments.sessionId, filter.sessionId));
  let q = orm.select().from(x402Payments);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(x402Payments.paidAt)).limit(filter.limit ?? 200).all();
}

// ─── MintPool epochs + claims ───────────────────────────────────────

export function epochUpsert(epoch) {
  const { db, orm } = get();
  const id = epoch.id || `${epoch.chainId}-${epoch.poolIndex}-${epoch.epochNumber}`;
  const existing = db.prepare("SELECT id FROM mintpool_epochs WHERE id = ?").get(id);
  const row = {
    id,
    chainId: epoch.chainId,
    poolIndex: epoch.poolIndex,
    epochNumber: epoch.epochNumber,
    startBlock: epoch.startBlock ?? null,
    endBlock: epoch.endBlock ?? null,
    holderShareWei: epoch.holderShareWei != null ? String(epoch.holderShareWei) : null,
    providerShareWei: epoch.providerShareWei != null ? String(epoch.providerShareWei) : null,
    finalized: epoch.finalized ? 1 : 0,
    sweptAt: epoch.sweptAt ?? null,
    fetchedAt: epoch.fetchedAt || Date.now(),
  };
  if (existing) orm.update(mintpoolEpochs).set(row).where(eq(mintpoolEpochs.id, id)).run();
  else orm.insert(mintpoolEpochs).values(row).run();
  return row;
}

export function epochsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.poolIndex !== undefined) where.push(eq(mintpoolEpochs.poolIndex, filter.poolIndex));
  if (filter.chainId) where.push(eq(mintpoolEpochs.chainId, filter.chainId));
  let q = orm.select().from(mintpoolEpochs);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(mintpoolEpochs.epochNumber)).limit(filter.limit ?? 100).all();
}

export function claimRecord(claim) {
  const { orm } = get();
  const row = {
    id: claim.id || uuid(),
    chainId: claim.chainId,
    poolIndex: claim.poolIndex,
    epochNumber: claim.epochNumber,
    holderWallet: claim.holderWallet,
    weight: claim.weight != null ? String(claim.weight) : null,
    payoutWei: claim.payoutWei != null ? String(claim.payoutWei) : null,
    txHash: claim.txHash ?? null,
    claimedAt: claim.claimedAt || Date.now(),
  };
  orm.insert(mintpoolClaims).values(row).run();
  return row;
}

export function claimsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.holderWallet) where.push(eq(mintpoolClaims.holderWallet, filter.holderWallet));
  if (filter.poolIndex !== undefined) where.push(eq(mintpoolClaims.poolIndex, filter.poolIndex));
  let q = orm.select().from(mintpoolClaims);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(mintpoolClaims.claimedAt)).limit(filter.limit ?? 100).all();
}
