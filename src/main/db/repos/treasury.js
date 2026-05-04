/**
 * Treasury repo. Mirrors `services/company/treasury.solo.js`. State is
 * a single row per company (or absent → derived defaults). Ledger is
 * append-only. Amounts stored in CENTS (integers) to avoid float math.
 */

import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { treasuryState, treasuryEntries } from "../schema/companies.js";

function _toCents(n) {
  return Math.round(Number(n) * 100);
}
function _fromCents(n) {
  return (Number(n) || 0) / 100;
}

export function getState(companyId) {
  const { orm } = get();
  const r = orm.select().from(treasuryState).where(eq(treasuryState.companyId, companyId)).get();
  if (!r) return { balance: 0, totalIn: 0, totalOut: 0, currency: "USD" };
  return {
    balance: _fromCents(r.balance),
    totalIn: _fromCents(r.totalIn),
    totalOut: _fromCents(r.totalOut),
    currency: r.currency,
  };
}

function _upsert(companyId, patch) {
  const { db, orm } = get();
  const existing = db.prepare("SELECT * FROM treasury_state WHERE company_id = ?").get(companyId);
  const now = Date.now();
  if (!existing) {
    orm.insert(treasuryState).values({
      companyId, balance: 0, totalIn: 0, totalOut: 0, currency: patch.currency || "USD",
      updatedAt: now, ...patch,
    }).run();
  } else {
    orm.update(treasuryState).set({ ...patch, updatedAt: now })
      .where(eq(treasuryState.companyId, companyId)).run();
  }
}

export function recordRevenue(companyId, opts) {
  const amt = Number(opts.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("amount must be > 0");
  const cur = getState(companyId);
  if (opts.currency && opts.currency !== cur.currency) {
    throw new Error(`currency mismatch: ${opts.currency} vs ${cur.currency}`);
  }
  const newBal = cur.balance + amt;
  _upsert(companyId, {
    balance: _toCents(newBal),
    totalIn: _toCents(cur.totalIn + amt),
    currency: cur.currency,
  });
  const { orm } = get();
  const entry = {
    id: uuid(),
    companyId,
    direction: "in",
    role: opts.role || "CFO",
    action: "recordRevenue",
    amount: _toCents(amt),
    currency: cur.currency,
    source: opts.source || "unknown",
    recipient: null,
    note: opts.memo || null,
    externalId: opts.externalId || null,
    balanceAfter: _toCents(newBal),
    ts: Date.now(),
  };
  orm.insert(treasuryEntries).values(entry).run();
  return { entry, state: { ...cur, balance: newBal, totalIn: cur.totalIn + amt } };
}

export function paySupplier(companyId, opts) {
  const amt = Number(opts.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("amount must be > 0");
  const cur = getState(companyId);
  if (opts.currency && opts.currency !== cur.currency) {
    throw new Error(`currency mismatch: ${opts.currency} vs ${cur.currency}`);
  }
  if (Number.isFinite(opts.cap) && amt > opts.cap) {
    throw new Error(`amount ${amt} exceeds role budget cap ${opts.cap}`);
  }
  if (Number.isFinite(opts.reserveFloor) && cur.balance - amt < opts.reserveFloor) {
    throw new Error(`payment would breach reserve floor (${cur.balance} - ${amt} < ${opts.reserveFloor})`);
  }
  const newBal = cur.balance - amt;
  _upsert(companyId, {
    balance: _toCents(newBal),
    totalOut: _toCents(cur.totalOut + amt),
    currency: cur.currency,
  });
  const { orm } = get();
  const entry = {
    id: uuid(),
    companyId,
    direction: "out",
    role: opts.role || "CFO",
    action: "paySupplier",
    amount: _toCents(amt),
    currency: cur.currency,
    source: null,
    recipient: opts.recipient || "unknown",
    note: opts.memo || null,
    externalId: opts.externalId || null,
    balanceAfter: _toCents(newBal),
    ts: Date.now(),
  };
  orm.insert(treasuryEntries).values(entry).run();
  return { entry, state: { ...cur, balance: newBal, totalOut: cur.totalOut + amt } };
}

export function listEntries(companyId, opts = {}) {
  const { orm } = get();
  return orm.select().from(treasuryEntries)
    .where(eq(treasuryEntries.companyId, companyId))
    .orderBy(desc(treasuryEntries.ts))
    .limit(opts.limit ?? 200).all();
}

export function reset(companyId) {
  const { db } = get();
  db.prepare("DELETE FROM treasury_state WHERE company_id = ?").run(companyId);
  db.prepare("DELETE FROM treasury_entries WHERE company_id = ?").run(companyId);
}

export function bulkInsertState(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO treasury_state (
      company_id, balance, total_in, total_out, currency, updated_at
    ) VALUES (@companyId, @balance, @totalIn, @totalOut, @currency, @updatedAt)
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      companyId: r.companyId,
      balance: _toCents(r.balance || 0),
      totalIn: _toCents(r.totalIn || 0),
      totalOut: _toCents(r.totalOut || 0),
      currency: r.currency || "USD",
      updatedAt: r.updatedAt || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}

export function bulkInsertEntries(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO treasury_entries (
      id, company_id, direction, role, action, amount, currency,
      source, recipient, note, external_id, balance_after, ts
    ) VALUES (
      @id, @companyId, @direction, @role, @action, @amount, @currency,
      @source, @recipient, @note, @externalId, @balanceAfter, @ts
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companyId: r.companyId,
      direction: r.direction,
      role: r.role ?? null,
      action: r.action ?? null,
      amount: _toCents(r.amount || 0),
      currency: r.currency || "USD",
      source: r.source ?? null,
      recipient: r.recipient ?? null,
      note: r.note ?? null,
      externalId: r.externalId ?? null,
      balanceAfter: r.balanceAfter != null ? _toCents(r.balanceAfter) : null,
      ts: r.ts || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}
