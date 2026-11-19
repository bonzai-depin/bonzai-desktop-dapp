import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { boampQuery, normalizeBoampRecord, createBoampClient, BOAMP_HOST } from "../src/main/connectors/boamp.js";
import { createChorusClient } from "../src/main/connectors/chorus.js";
import { normalizeSearch, sanitizeNotice, validateResponse, prepareTender, submissionManifest, approveResponse, recordDeposit } from "../src/services/company/tendersDomain.js";
import { OPERATIONAL_ACTIONS } from "../src/services/company/operationalActions.js";
import { requiresOwnerApproval } from "../src/services/company/governance.solo.js";
import { applyTemplate } from "../src/services/company/templates.js";
import { makeCharter, validateCharter } from "../src/services/company/charter.js";
import { SKILL_PACKS } from "../src/services/company/skillPacks.js";
import { workspaceNavigation } from "../src/services/company/workspaceNavigation.js";
import { buildWorkspaceBlueprint as blueprintForWorkspace } from "../src/services/company/workspaceBlueprints.js";
import { classifyCompanyBrief } from "../src/services/company/conversationalWorkspace.js";
import { chorusStage } from "../src/shared/chorusStatus.js";
import { COMPANY_OPERATIONS, isOperationalTable } from "../src/shared/companyOperations.js";
import { boampResponse } from "./fixtures/company/boamp.mjs";
const require = createRequire(import.meta.url);
const NOW = Date.parse("2026-11-19T10:00:00Z");

test("a tender search sends the typed terms to the public service and nothing else", async () => {
  const calls = [];
  const client = createBoampClient({ fetchImpl: async (url, options) => { calls.push({ url: new URL(url), options }); return { ok: true, status: 200, json: async () => boampResponse }; } });
  const result = await client.search(normalizeSearch({ keywords: 'clim "x" \\', departments: "75, 2a", type: "travaux" }), NOW);
  const { url, options } = calls[0];
  assert.equal(url.host, BOAMP_HOST);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["limit", "offset", "order_by", "select", "where"]);
  assert.equal(url.searchParams.get("where"), 'nature = "APPEL_OFFRE" AND search(objet, "clim x") AND (code_departement = "75" OR code_departement = "2A") AND type_marche = "TRAVAUX" AND datelimitereponse >= date\'2026-11-19\'');
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "error", "a redirect could carry the query to another host");
  assert.equal(options.credentials, "omit");
  assert.deepEqual(Object.keys(options.headers), ["Accept"], "no credential, cookie or identity header");
  assert.equal(options.body, undefined);
  assert.equal(result.total, 3);
  assert.equal(result.notices.length, 2, "an unreadable public record is dropped, not shown");
});

test("search filters are validated before any request", () => {
  assert.throws(() => normalizeSearch({ keywords: "x", departments: "Paris" }), /department/);
  assert.throws(() => normalizeSearch({ keywords: "x", type: "anything" }), /contract type/);
  assert.equal(boampQuery(normalizeSearch({ keywords: "x", openOnly: false }), NOW).get("where").includes("datelimitereponse"), false);
});

test("public notices are read from both BOAMP layouts and sanitised before storage", () => {
  const [classic, eforms] = boampResponse.results.map(normalizeBoampRecord);
  assert.equal(classic.buyer, "Sénat");
  assert.equal(classic.buyerProfileUrl, "https://www.marches-publics.gouv.fr");
  assert.equal(eforms.buyerProfileUrl, "https://www.marches-publics.gouv.fr/");
  assert.deepEqual(eforms.descriptors, []);
  const stored = sanitizeNotice({ ...classic, url: "javascript:alert(1)", buyerProfileUrl: "http://plain.example", extra: "ignored" });
  assert.equal(stored.url, "");
  assert.equal(stored.buyerProfileUrl, "", "only HTTPS links are kept and later opened");
  assert.equal("extra" in stored, false);
});

const response = (extra = {}) => ({ ...validateResponse({ title: "Maintenance", buyer: "Sénat", deadline: "2026-12-07T11:00:00Z", platformUrl: "https://www.marches-publics.gouv.fr", requiredPieces: ["technical"], documentIds: ["memo"] }), id: "r1", ...extra });
const memo = (extra = {}) => ({ id: "memo", label: "Mémoire", pieceType: "technical", responseId: "r1", blob_id: "a".repeat(64), ext: "txt", ...extra });

test("no deposit is recorded without the owner's approval of the exact package", () => {
  const draft = response();
  assert.match(prepareTender(draft, [memo({ draft: true })], NOW).blockers.join(" "), /human review/);
  assert.match(prepareTender({ ...draft, deadline: "2026-11-01T00:00:00Z" }, [memo()], NOW).blockers.join(" "), /deadline has passed/);
  const review = { ...draft, stage: "review" };
  const manifest = submissionManifest(review, [memo()]);
  assert.deepEqual(manifest.recipient, { buyer: "Sénat", consultationReference: "", lots: "", platformUrl: "https://www.marches-publics.gouv.fr/" });
  assert.throws(() => recordDeposit(review, [memo()], { revision: review.revision, confirmed: true, recordedBy: "Owner", reference: "R" }, NOW), /approved package/);
  assert.throws(() => approveResponse(review, [memo()], { revision: review.revision, approvedBy: "Owner", confirmed: false, manifest }, NOW), /Confirm/);
  assert.throws(() => approveResponse(review, [memo()], { revision: review.revision, confirmed: true, manifest }, NOW), /Approver/);
  const approved = approveResponse(review, [memo()], { revision: review.revision, approvedBy: "Owner", confirmed: true, manifest }, NOW);
  // The file was replaced after approval: the receipt cannot be recorded against it.
  const receipt = { id: "rc", pieceType: "receipt", responseId: "r1", blob_id: "c".repeat(64), ext: "pdf" };
  assert.throws(() => recordDeposit(approved, [memo({ blob_id: "b".repeat(64) }), receipt], { revision: approved.revision, confirmed: true, recordedBy: "Owner", reference: "R", receiptDocumentId: "rc" }, NOW), /differs from the approved/);
  assert.equal(recordDeposit(approved, [memo(), receipt], { revision: approved.revision, confirmed: true, recordedBy: "Owner", reference: "R", receiptDocumentId: "rc" }, NOW).stage, "deposited");
});

test("the team can prepare a response but has no tool to approve or deposit it", () => {
  for (const method of ["approveResponse", "recordDeposit", "recordOutcome", "reviewDocument", "exportPackage"])
    assert.equal(Object.hasOwn(OPERATIONAL_ACTIONS, `tenders.${method}`), false, `${method} is owner-only`);
  assert.equal(OPERATIONAL_ACTIONS["tenders.searchNotices"].external, true);
  assert.equal(requiresOwnerApproval({ type: "tenders.searchNotices" }), true, "a network search by the team waits for the owner");
  for (const type of ["tenders.draftDocument", "tenders.saveNotice", "tenders.requestReview"]) assert.equal(requiresOwnerApproval({ type }), false);
  assert.equal(requiresOwnerApproval({ type: "tenders.snapshot" }), false);
  assert.equal(requiresOwnerApproval({ type: "billing.chorusAction" }), true, "every Chorus Pro deposit waits for the owner");
  assert.ok(COMPANY_OPERATIONS.companyTenders.writes.includes("approveResponse"));
  assert.ok(isOperationalTable("company_tenders_records"), "tender records are part of team backup and export");
});

test("the public-market team is a dedicated template with its own roles, skills and workspace", () => {
  const applied = applyTemplate("public_markets", { businessName: "Acme" }, { demoMode: false });
  assert.deepEqual(Object.keys(applied.draft.roles).sort(), ["BidManager", "CEO", "CFO", "DocumentController", "TenderAnalyst"]);
  assert.deepEqual(applied.requiredConnectors, [], "browsing and drafting need no account");
  assert.ok(applied.requiredSkills.includes("skill.local_tenders"));
  assert.equal(validateCharter(makeCharter({ name: "Acme", mission: "Tenders", ...applied.draft })).ok, true);
  assert.ok(SKILL_PACKS.public_markets.skills.includes("skill.local_tenders"));
  const blueprint = blueprintForWorkspace({ templateId: "public_markets" });
  assert.ok(workspaceNavigation(blueprint.channels).some((view) => view.value === "tenders"));
  assert.equal(classifyCompanyBrief("Répondre aux appels d’offres de la région"), "tenders");
  assert.equal(classifyCompanyBrief("Préparer les dossiers de primes CEE"), "grants");
});

test("Chorus Pro statuses map to what the supplier must do, and payment is never inferred", () => {
  assert.equal(chorusStage("DEPOSEE"), "deposited");
  assert.equal(chorusStage("MISE_A_DISPOSITION"), "processing");
  assert.equal(chorusStage("SERVICE-FAIT"), "processing");
  assert.equal(chorusStage("SUSPENDUE"), "actionRequired");
  assert.equal(chorusStage("A_RECYCLER"), "actionRequired");
  assert.equal(chorusStage("REJETEE"), "rejected");
  assert.equal(chorusStage("MISE_EN_PAIEMENT"), "paymentOrdered");
  assert.equal(chorusStage("A_VALIDER_1"), "unknown", "an unmapped code is shown as is, never as progress");
  assert.equal(chorusStage(undefined), "unknown");
});

test("qualification and production never share a host, and credentials stay in the main process", async () => {
  const credential = { clientId: "fixture-id", clientSecret: "fixture-secret", technicalLogin: "tech", technicalPassword: "fixture-password" };
  for (const [environment, hosts] of [["sandbox", ["sandbox-oauth.piste.gouv.fr", "sandbox-api.piste.gouv.fr"]], ["production", ["oauth.piste.gouv.fr", "api.piste.gouv.fr"]]]) {
    const seen = [];
    const client = createChorusClient({ credential, environment, fetchImpl: async (url) => { seen.push(new URL(url).host); return { ok: true, status: 200, json: async () => (url.includes("oauth") ? { access_token: "t" } : { codeRetour: 0, statutCourantCode: "DEPOSEE" }) }; } });
    await client.invoiceStatus({ invoiceId: 1 });
    assert.deepEqual(seen, hosts);
  }
  const preload = fs.readFileSync("src/preload.js", "utf8");
  const bridge = preload.slice(preload.indexOf("companyConnector: {"), preload.indexOf("\n  },", preload.indexOf("companyConnector: {")));
  assert.deepEqual([...bridge.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).filter((name) => name !== "companyConnector"), ["oauthStatus", "configureOAuth", "authorizeOAuth", "cancelOAuth", "authorizeMail", "cancelMail", "setSecret", "deleteSecret", "request", "validate"], "the renderer can write or delete a secret, never read one");
  const view = fs.readFileSync("src/components/company/CompanyTenders.vue", "utf8");
  assert.equal(/companyConnector|clientSecret|technicalPassword/.test(view), false, "tender browsing involves no credential");
});

test("production SQLite tender lifecycle", async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), ".company-tests-tenders-")), data = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-tenders-"));
  try {
    const outfile = path.join(folder, "tenders.mjs");
    await build({ entryPoints: ["test/fixtures/company/tenders.js"], outfile, bundle: true, format: "esm", platform: "node", packages: "external", logLevel: "silent",
      plugins: [{ name: "isolation", setup(b) {
        b.onResolve({ filter: /connection\.js$/ }, (a) => (a.importer.includes("/src/main/") ? { path: path.resolve("test/fixtures/company/connection.js") } : null));
        b.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const app={getPath:()=>${JSON.stringify(data)}}`, loader: "js" }));
      } }] });
    const result = spawnSync(require("electron"), [outfile], { encoding: "utf8", timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    assert.match(result.stdout, /approval, export and receipt/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});
