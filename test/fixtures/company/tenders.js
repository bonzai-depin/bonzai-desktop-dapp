import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as tendersRepo from "../../../src/main/db/repos/companyTenders.js";
import * as audit from "../../../src/main/db/repos/audit.js";
import * as issues from "../../../src/main/db/repos/issues.js";
import * as blobs from "../../../src/main/db/blobs.js";
import { createTenderWorkspace } from "../../../src/main/connectors/publicTenders.js";
import { createBoampClient } from "../../../src/main/connectors/boamp.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import { boampResponse } from "./boamp.mjs";

for (const id of ["bids", "other"]) companies.save({ ...makeCharter({ name: id, mission: "Tenders" }), id, status: "paused" });
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-tender-files-"));
const file = (name, content) => { const target = path.join(folder, name); fs.writeFileSync(target, content); return target; };
const requests = [];
let picked = [];
const workspace = createTenderWorkspace({
  repo: tendersRepo, blobs, audit,
  dialog: { showOpenDialog: async () => ({ canceled: !picked.length, filePaths: picked }) },
  client: createBoampClient({ fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => boampResponse }; } }),
});
const actions = () => audit.all("bids").map((row) => row.action);

// Search: public notices only, malformed records dropped, the search journalled.
const found = await workspace.searchNotices("bids", { keywords: "climatisation", departments: "75" });
assert.equal(found.notices.length, 2);
assert.equal(requests.length, 1);
assert.equal(tendersRepo.snapshot("bids").notices.length, 0, "a search stores no notice until the user keeps one");
assert.ok(actions().includes("tenders.searchNotices"));

const notice = workspace.saveNotice("bids", { notice: found.notices[0] });
assert.equal(workspace.saveNotice("bids", { notice: found.notices[0] }).id, notice.id, "the same notice is kept once");
assert.throws(() => workspace.saveNotice("bids", { notice: { ...found.notices[0], source: "elsewhere" } }), /source/);
assert.throws(() => workspace.startResponse("other", { noticeId: notice.id }), /not found/, "teams never read each other's notices");

// Response dossier and the drafting task for the team.
let response = workspace.startResponse("bids", { noticeId: notice.id });
assert.equal(workspace.startResponse("bids", { noticeId: notice.id }).id, response.id);
assert.equal(response.platformUrl, "https://www.marches-publics.gouv.fr/");
assert.ok(issues.list("bids").some((task) => task.id === response.preparationTaskId && task.assigneeRole === "BidManager"));

const technical = workspace.draftDocument("bids", { responseId: response.id, pieceType: "technical", title: "Mémoire technique", content: "Méthode [to confirm]" });
picked = [file("dc1.pdf", "%PDF-candidature")];
await workspace.attachDocument("bids", { responseId: response.id, pieceType: "candidature" });
picked = [file("dpgf.xlsx", "prices")];
await workspace.attachDocument("bids", { responseId: response.id, pieceType: "financial" });
response = tendersRepo.recordById("bids", "response", response.id);
assert.equal(response.documentIds.length, 3);

// An unreviewed draft blocks the hand-over; a named reviewer unblocks it.
assert.throws(() => workspace.requestReview("bids", { id: response.id, revision: response.revision }), /human review/);
assert.throws(() => workspace.reviewDocument("bids", { id: technical.id, confirmed: true }), /Name the person/);
workspace.reviewDocument("bids", { id: technical.id, reviewedBy: "Owner", confirmed: true });
response = workspace.requestReview("bids", { id: response.id, revision: response.revision });
assert.equal(response.stage, "review");

// No export and no deposit record before the owner approves this exact package.
await assert.rejects(() => workspace.exportPackage("bids", { id: response.id }), /Approve/);
assert.throws(() => workspace.recordDeposit("bids", { id: response.id, revision: response.revision, confirmed: true, recordedBy: "Owner", reference: "R-1" }), /approved package/);
const preview = workspace.approvalPreview("bids", { id: response.id });
assert.equal(preview.manifest.recipient.buyer, "Sénat");
assert.equal(preview.manifest.documents.length, 3);
assert.throws(() => workspace.approveResponse("bids", { id: response.id, revision: response.revision, approvedBy: "Owner", confirmed: true, manifest: { ...preview.manifest, documents: preview.manifest.documents.slice(1) } }), /changed since/);
assert.throws(() => workspace.approveResponse("bids", { id: response.id, revision: response.revision, approvedBy: "Owner", manifest: preview.manifest }), /Confirm/);
response = workspace.approveResponse("bids", { id: response.id, revision: response.revision, approvedBy: "Owner", confirmed: true, manifest: preview.manifest });
assert.equal(response.stage, "approved");
assert.ok(actions().includes("tenders.approveResponse"));

// Export copies the approved files locally and nothing else touches the network.
picked = [folder];
const exported = await workspace.exportPackage("bids", { id: response.id });
assert.equal(exported.files.length, 3);
assert.ok(exported.files.every((name) => fs.existsSync(path.join(exported.folder, name))));
assert.equal(requests.length, 1, "drafting, approval and export make no network request");

// Editing after approval cancels it: the owner approved one package, not the next.
const edited = workspace.saveResponse("bids", { ...response, lots: "Lot 2" });
assert.equal(edited.stage, "preparing");
assert.equal(edited.approval, null);
await assert.rejects(() => workspace.exportPackage("bids", { id: edited.id }), /Approve/);
response = workspace.requestReview("bids", { id: edited.id, revision: edited.revision });
const again = workspace.approvalPreview("bids", { id: response.id });
response = workspace.approveResponse("bids", { id: response.id, revision: response.revision, approvedBy: "Owner", confirmed: true, manifest: again.manifest });

// The deposit is recorded only with the platform's receipt.
assert.throws(() => workspace.recordDeposit("bids", { id: response.id, revision: response.revision, confirmed: true, recordedBy: "Owner", reference: "R-1" }), /receipt/);
picked = [file("accuse.pdf", "%PDF-receipt")];
const receipt = await workspace.attachDocument("bids", { responseId: response.id, pieceType: "receipt" });
response = tendersRepo.recordById("bids", "response", response.id);
assert.equal(response.stage, "approved", "evidence does not alter the approved package");
response = workspace.recordDeposit("bids", { id: response.id, revision: response.revision, confirmed: true, recordedBy: "Owner", reference: "R-1", receiptDocumentId: receipt.id });
assert.equal(response.stage, "deposited");
assert.ok(actions().includes("tenders.recordDeposit"));
assert.throws(() => workspace.saveResponse("bids", { ...response, lots: "Lot 3" }), /locked/);
assert.equal(audit.verify("bids").ok, true, "external actions sit in the tamper-evident trail");
assert.equal(tendersRepo.snapshot("other").responses.length, 0);
fs.rmSync(folder, { recursive: true, force: true });
console.log("tender response: search, draft, review, approval, export and receipt");
