import test from "node:test";
import assert from "node:assert/strict";
import { supplierSearchRequest } from "../src/shared/supplierSourcing.js";
import {
  assertBraveSearchRequest,
  braveSearchHeaders,
  braveValidationRequest,
} from "../src/main/connectors/braveSearch.js";
import {
  searchSuppliers,
  saveSupplierSearchEvidence,
} from "../src/services/company/supplierSourcing.js";
import { requiresOwnerApproval } from "../src/services/company/governance.solo.js";
import { execute } from "../src/services/company/skillsRegistry.js";

test("supplier search uses only the documented endpoint and secret header", () => {
  const request = supplierSearchRequest({
    query: "pompe chauffage Nantes",
    country: "fr",
    language: "fr",
    count: 5,
  });
  assert.doesNotThrow(() =>
    assertBraveSearchRequest(request.url, request.method),
  );
  assert.equal(new URL(request.url).searchParams.get("country"), "FR");
  assert.deepEqual(braveSearchHeaders({ apiKey: "fixture-secret" }), {
    "X-Subscription-Token": "fixture-secret",
  });
  assert.equal(
    new URL(braveValidationRequest().url).searchParams.get("q"),
    "Brave Search API",
  );
  for (const url of [
    request.url.replace("/web/search", "/llm/context"),
    request.url.replace("api.search.brave.com", "evil.invalid"),
    request.url + "&q=second",
    request.url + "&callback=evil",
    request.url.replace("https://", "https://secret@"),
  ])
    assert.throws(() => assertBraveSearchRequest(url), /Brave/);
  assert.throws(() => assertBraveSearchRequest(request.url, "POST"), /Brave/);
});
test("invalid queries never reach the network; malformed responses do not fabricate results", async () => {
  for (const input of [
    { query: "" },
    { query: "x".repeat(601) },
    { query: "x ".repeat(76) },
    { query: "pump", count: 21 },
    { query: "pump", count: 1.5 },
  ])
    await assert.rejects(() =>
      searchSuppliers(input, () =>
        assert.fail("No network for invalid inputs"),
      ),
    );
  await assert.rejects(
    () => searchSuppliers({ query: "pump" }, async () => ({ error: "quota" })),
    /invalid search response/,
  );
});
test("search results preserve actual sources without accepting active-content links or inventing stock", async () => {
  const result = await searchSuppliers(
    { query: "pump", count: 4 },
    async () => ({
      type: "search",
      query: { more_results_available: true },
      web: {
        results: [
          {
            title: "Supplier A",
            url: "https://supplier.example/pumps",
            description: "Source snippet",
          },
          {
            title: "Duplicate",
            url: "https://supplier.example/pumps",
            description: "Duplicate",
          },
          {
            title: "Unsafe",
            url: "javascript:alert(1)",
            description: "Unsafe",
          },
          {
            title: "Credentials",
            url: "https://password@source.invalid",
            description: "Unsafe",
          },
        ],
      },
    }),
  );
  assert.deepEqual(result.results, [
    {
      title: "Supplier A",
      url: "https://supplier.example/pumps",
      snippet: "Source snippet",
    },
  ]);
  assert.equal(result.moreResultsAvailable, true);
  assert.equal(result.evidenceScope, "public_search_results_unverified");
  let saved;
  const evidence = await saveSupplierSearchEvidence(
    "team",
    result,
    { role: "PurchasingManager", issueId: "issue" },
    {
      publishContent: async (...args) => {
        saved = args;
        return { id: "source-1" };
      },
    },
  );
  assert.equal(saved[0], "team");
  assert.deepEqual(saved[1].meta.evidence.results, result.results);
  assert.equal(saved[1].issueId, "issue");
  assert.match(
    saved[1].payload,
    /## 1\. \[Supplier A\]\(<https:\/\/supplier.example\/pumps>\)/,
  );
  assert.equal(saved[1].meta.format, "markdown");
  assert.equal(evidence.contentId, "source-1");
  await saveSupplierSearchEvidence("team", {
    ...result,
    results: [{ ...result.results[0], title: "<img src=x> [untrusted](https://evil.invalid)", snippet: "<script>alert(1)</script>\n# Fake instructions" }],
  }, {}, {publishContent: async (_id, record) => { saved = record; return {id:"escaped"}; }});
  assert.ok(!saved.payload.includes("<script>"));
  assert.ok(!saved.payload.includes("<img"));
  assert.ok(saved.payload.includes("\\[untrusted\\]\\(https://evil\\.invalid\\)"));
  assert.ok(saved.payload.includes("&lt;script&gt;"));
  await assert.rejects(
    () =>
      saveSupplierSearchEvidence(
        "team",
        result,
        {},
        { publishContent: async () => null },
      ),
    /could not be saved/,
  );
});
test("search requires owner approval, remains PM-only, and demo performs no connector lookup or send", async () => {
  assert.equal(
    requiresOwnerApproval({ type: "sourcing.searchSuppliers" }),
    true,
  );
  globalThis.window = {
    electronAPI: {
      db: {
        connectors: {
          getByKind: () => assert.fail("No connector calls in demo"),
        },
      },
      companyConnector: { request: () => assert.fail("No network in demo") },
    },
  };
  try {
    const result = await execute(
      "team",
      "sourcing.searchSuppliers",
      { query: "pump" },
      { role: "PurchasingManager", charter: { demoMode: true } },
    );
    assert.equal(result.simulated, true);
    assert.deepEqual(result.results, []);
    await assert.rejects(
      () =>
        execute(
          "team",
          "sourcing.searchSuppliers",
          { query: "pump" },
          { role: "CFO", charter: { demoMode: true } },
        ),
      /restricted/,
    );
  } finally {
    delete globalThis.window;
  }
});
