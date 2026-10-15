import test from "node:test";
import assert from "node:assert/strict";
import { applyTemplate } from "../src/services/company/templates.js";
import {
  makeCharter,
  validateCharter,
} from "../src/services/company/charter.js";
import {
  validateDossier,
  transitionDossier,
} from "../src/services/company/grantsDomain.js";
import { requiresOwnerApproval } from "../src/services/company/governance.solo.js";
import {
  resolveWorkspaceDestination,
  workspaceNavigation,
} from "../src/services/company/workspaceNavigation.js";
import { portalUrl, createCompanyBrowser } from "../src/main/companyBrowser.js";
import { EventEmitter } from "node:events";
const base = () =>
  validateDossier({
    id: "application",
    title: "Climatisation",
    beneficiary: "Client A",
    territory: "Martinique",
    scheme: "Local scheme",
    ruleSource: "https://example.org/rules",
    ruleVersion: "Reviewed 2026-10-05",
    checklist: "Reviewed chronology and documents",
    documentIds: ["proof", "bank"],
    portalUrl: "https://example.org",
    applicationReference: "EDF-1",
    awardedCents: 50000,
    receivedCents: 50000,
  });
test("grants team blueprint has real tools and its own workspace without a billing tab", () => {
  const { draft } = applyTemplate("government_grants", { businessName: "CFE" });
  assert.equal(validateCharter(makeCharter(draft)).ok, true);
  for (const role of ["CEO", "DocumentController"]) {
    assert.ok(draft.roles[role].grantedSkills.includes("skill.local_browser"));
    assert.ok(
      draft.roles[role].grantedSkills.includes("skill.team_communication"),
    );
  }
  assert.equal(draft.pendingConnectors.length, 0);
  assert.equal(
    resolveWorkspaceDestination(null, draft.workspace.channels).value,
    "overview",
  );
  assert.ok(
    !workspaceNavigation(draft.workspace.channels).some(
      (v) => v.value === "billing",
    ),
  );
});
test("dossier stages require current documents and actual submission/award/settlement evidence", () => {
  let d = base();
  const docs = [{ id: "proof", dossierId:"application", documentType:"notice", validUntil: "2099-01-01" },{id:"bank",dossierId:"application",documentType:"bank"}];
  assert.throws(
    () =>
      transitionDossier(d, { revision: d.revision, stage: "settled" }, docs),
    /next/,
  );
  for (const stage of [
    "documents",
    "review",
    "submitted",
    "instruction",
    "awarded",
    "settled",
  ]) {
    if (["submitted", "awarded", "settled"].includes(stage))
      assert.throws(
        () =>
          transitionDossier(
            d,
            { revision: d.revision, stage, evidence: "Portal says yes" },
            docs,
          ),
        /supporting/,
      );
    d = transitionDossier(
      d,
      {
        revision: d.revision,
        stage,
        evidence: "Owner reviewed source",
        evidenceDocumentId: stage === "settled" ? "bank" : "proof",
      },
      docs,
    );
  }
  assert.equal(d.history.length, 6);
  assert.equal(d.stage, "settled");
  assert.throws(
    () => validateDossier({ ...d, beneficiary: "Someone else" }, d),
    /locked/,
  );
  assert.throws(() => validateDossier({ ...d, revision: 0 }, d), /changed/);
});
test("expired evidence and an incomplete settlement cannot complete a dossier", () => {
  const d = { ...base(), stage: "documents" };
  assert.throws(
    () =>
      transitionDossier(d, { revision: d.revision, stage: "review" }, [
        { id: "proof", validUntil: "2000-01-01" },
      ]),
    /current/,
  );
  assert.throws(
    () =>
      transitionDossier(
        { ...d, stage: "awarded", receivedCents: 100 },
        {
          revision: d.revision,
          stage: "settled",
          evidence: "bank",
          evidenceDocumentId: "proof",
        },
        [{ id: "proof", dossierId:"application", documentType:"bank" }],
      ),
    /Full settlement/,
  );
});
test("browser writes and grant transitions cannot bypass owner approval", () => {
  for (const type of [
    "browser.navigate",
    "browser.interact",
    "browser.uploadDocument",
    "grants.advanceDossier",
  ])
    assert.equal(requiresOwnerApproval({ type }), true);
  assert.equal(requiresOwnerApproval({ type: "browser.inspect" }), false);
  for (const url of [
    "file:///etc/passwd",
    "http://example.com",
    "https://localhost/x",
    "https://127.0.0.1",
    "https://user:password@example.com",
  ])
    assert.throws(() => portalUrl(url));
  assert.equal(
    portalUrl("https://prime-energie-edf.fr").hostname,
    "prime-energie-edf.fr",
  );
});
test("browser cancellation performs no navigation and sessions isolate company cookies without a preload", async () => {
  const windows = [];
  class Win extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.session = new EventEmitter();
      Object.assign(this.webContents.session, {
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
      });
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    show() {}
    isDestroyed() {
      return false;
    }
    loadURL() {
      throw new Error("Should not navigate");
    }
  }
  const browser = createCompanyBrowser({
    BrowserWindow: Win,
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    assertCompany() {},
    record() {},
  });
  await assert.rejects(
    browser.navigate("one", { url: "https://example.com" }),
    /cancelled/,
  );
  await assert.rejects(
    browser.navigate("two", { url: "https://example.com" }),
    /cancelled/,
  );
  assert.notEqual(
    windows[0].options.webPreferences.partition,
    windows[1].options.webPreferences.partition,
  );
  assert.equal(windows[0].options.webPreferences.sandbox, true);
  assert.equal(windows[0].options.webPreferences.preload, undefined);
});

test("corrected eligibility facts reopen qualification and drafts cannot prove an award", () => {
  const d = { ...base(), stage: "review" };
  assert.equal(
    validateDossier({ ...d, territory: "Guyane" }, d).stage,
    "qualification",
  );
  assert.throws(
    () =>
      transitionDossier(
        { ...d, stage: "instruction" },
        {
          revision: d.revision,
          stage: "awarded",
          evidence: "Unverified draft",
          evidenceDocumentId: "proof",
        },
        [{ id: "proof", draft: true }],
      ),
    /supporting/,
  );
});
