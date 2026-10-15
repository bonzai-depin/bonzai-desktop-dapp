import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
test("Independent teams exchange attributed requests and scoped results", async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), ".company-tests-"));
  const data = fs.mkdtempSync(
    path.join(os.tmpdir(), "bonzai-company-fixture-"),
  );
  try {
    const outfile = path.join(folder, "integration.mjs");
    await build({
      entryPoints: ["test/fixtures/company/team-communication.js"],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent",
      plugins: [
        {
          name: "isolated-company-database",
          setup(builder) {
            const stubs = {
              "memory.service.js":
                'export const memoryService = { buildRecallContext: async () => "" };',
              "smartAgentCatalog.js":
                'export async function loadSmartAgents() {} export const smartAgentCatalog = { agents: [{ id: "fixture-agent", assignedWorkflowIds: [] }] };',
              "agentWorkflows.js":
                "export async function getAvailableAgentWorkflows() { return []; } export function getAgentWorkflowIds() { return []; }",
              "createCapabilities.js":
                'export const CREATE_ACTION_GUIDE = "", CREATE_PIPELINES = ["text"]; export async function executeCreation() { throw new Error("No model generation in persistence fixture"); }',
              "workflowExecution.js":
                'export async function executeCompanyWorkflow() { throw new Error("Workflow runtime is covered separately"); }',
              "smartAgentJobs.service.js":
                'export async function actOnSmartAgentJob() { throw new Error("No network actions in fixture"); } export const withdrawAgentJobPayment = actOnSmartAgentJob;',
            };
            builder.onResolve({ filter: /\.js$/ }, (args) =>
              Object.hasOwn(stubs, path.basename(args.path))
                ? {
                    path: path.basename(args.path),
                    namespace: "dispatcher-runtime",
                  }
                : null,
            );
            builder.onLoad(
              { filter: /.*/, namespace: "dispatcher-runtime" },
              (args) => ({ contents: stubs[args.path], loader: "js" }),
            );
            builder.onResolve({ filter: /connection\.js$/ }, (args) =>
              args.importer.includes("/src/main/")
                ? { path: path.resolve("test/fixtures/company/connection.js") }
                : null,
            );
            builder.onResolve({ filter: /^electron$/ }, () => ({
              path: "electron",
              namespace: "test-runtime",
            }));
            builder.onLoad({ filter: /.*/, namespace: "test-runtime" }, () => ({
              contents: `export const app = { getPath: () => ${JSON.stringify(data)} };`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const result = spawnSync(require("electron"), [outfile], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Team isolation/);
    console.log(result.stdout.trim());
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});
