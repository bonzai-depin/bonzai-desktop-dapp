/**
 * Drizzle schema — off-chain mirrors of on-chain state.
 *
 * Today the dashboard re-queries the chain on every render to show
 * mint records, x402 payments, and MintPool epoch claims. These tables
 * cache the same state locally so the UI is instant and the chain
 * client is only hit when the user explicitly refreshes (or via a
 * background poller every N minutes).
 *
 * The chain is the source of truth — these rows are derived. A future
 * "rebuild from chain" command can wipe + re-fetch.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const mintRecords = sqliteTable(
  "mint_records",
  {
    id: text("id").primaryKey(),                        // chainId-contract-tokenId composite
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    tokenId: text("token_id").notNull(),
    contentType: text("content_type"),                  // text | audio | image | video | 3d | training | companion
    ownerWallet: text("owner_wallet"),
    generationId: text("generation_id"),                // optional FK to generations.id
    ipfsCid: text("ipfs_cid"),
    txHash: text("tx_hash"),
    mintFeeCents: integer("mint_fee_cents"),
    royaltyBps: integer("royalty_bps"),
    mintedAt: integer("minted_at").notNull(),
  },
  (t) => ({
    byOwner: index("idx_mint_owner").on(t.ownerWallet, t.mintedAt),
    byContent: index("idx_mint_content").on(t.contentType, t.mintedAt),
    byChain: index("idx_mint_chain").on(t.chainId, t.contractAddress),
  }),
);

export const x402Payments = sqliteTable(
  "x402_payments",
  {
    id: text("id").primaryKey(),                        // payment receipt id
    chainId: integer("chain_id").notNull(),
    payerWallet: text("payer_wallet").notNull(),
    payeeWallet: text("payee_wallet").notNull(),
    amountWei: text("amount_wei").notNull(),            // string to preserve big-int precision
    pipeline: text("pipeline"),                         // llm | image | audio | video | …
    sessionId: text("session_id"),
    sigHash: text("sig_hash"),
    txHash: text("tx_hash"),
    status: text("status").notNull(),                   // pending | settled | failed
    paidAt: integer("paid_at"),
    settledAt: integer("settled_at"),
  },
  (t) => ({
    byPayer: index("idx_x402_payer").on(t.payerWallet, t.paidAt),
    byPayee: index("idx_x402_payee").on(t.payeeWallet, t.paidAt),
    byStatus: index("idx_x402_status").on(t.status, t.paidAt),
  }),
);

export const mintpoolEpochs = sqliteTable(
  "mintpool_epochs",
  {
    id: text("id").primaryKey(),                        // chainId-poolIndex-epochNumber
    chainId: integer("chain_id").notNull(),
    poolIndex: integer("pool_index").notNull(),         // 0..5 (text/audio/image/video/3d/training)
    epochNumber: integer("epoch_number").notNull(),
    startBlock: integer("start_block"),
    endBlock: integer("end_block"),
    holderShareWei: text("holder_share_wei"),
    providerShareWei: text("provider_share_wei"),
    finalized: integer("finalized", { mode: "boolean" }).default(0),
    sweptAt: integer("swept_at"),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => ({
    byPool: index("idx_pool_epoch").on(t.poolIndex, t.epochNumber),
    byChain: index("idx_pool_chain").on(t.chainId, t.epochNumber),
  }),
);

export const mintpoolClaims = sqliteTable(
  "mintpool_claims",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    poolIndex: integer("pool_index").notNull(),
    epochNumber: integer("epoch_number").notNull(),
    holderWallet: text("holder_wallet").notNull(),
    weight: text("weight"),                             // bigint as string
    payoutWei: text("payout_wei"),
    txHash: text("tx_hash"),
    claimedAt: integer("claimed_at"),
  },
  (t) => ({
    byHolder: index("idx_claim_holder").on(t.holderWallet, t.claimedAt),
    byEpoch: index("idx_claim_epoch").on(t.poolIndex, t.epochNumber),
  }),
);
