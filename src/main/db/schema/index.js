/**
 * Drizzle schema barrel — every table re-exported here.
 *
 * The connection's `drizzle(db, { schema })` reads from this file. Each
 * phase of the migration plan adds one or more entries. Order doesn't
 * matter — Drizzle resolves references via the table object, not the
 * import order.
 *
 * Keep this file alphabetical so diffs read clean.
 */

export * from "./audit.js";
export * from "./blobs.js";
export * from "./companies.js";
export * from "./companions.js";
export * from "./embeddings.js";
export * from "./generations.js";
export * from "./skills.js";
export * from "./social.js";
export * from "./web3.js";
