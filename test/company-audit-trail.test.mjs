import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { needsWorkspaceLicense } from "../src/main/workspace/license.js";
const require = createRequire(import.meta.url);

test("activity history is chained, verifiable, restorable and removed only with its team", async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), ".company-tests-audit-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-audit-trail-"));
  try {
    const outfile = path.join(folder, "audit-trail.mjs");
    await build({
      entryPoints: ["test/fixtures/company/audit-trail.js"],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      logLevel: "silent",
      plugins: [
        {
          name: "isolated-audit-trail",
          setup(builder) {
            builder.onResolve({ filter: /connection\.js$/ }, (args) =>
              args.importer.includes("/src/main/")
                ? { path: path.resolve("test/fixtures/company/connection.js") }
                : null,
            );
            builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "stub" }));
            builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
              contents: `export const app={getPath:()=>${JSON.stringify(data)}}`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const result = spawnSync(require("electron"), [outfile], {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    console.log(result.stdout.trim());
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("the renderer can read, verify and export the trail but never rewrite it", () => {
  const preload = fs.readFileSync("src/preload.js", "utf8");
  const ipc = fs.readFileSync("src/main/ipc/db.js", "utf8");
  const channels = (source) => [...new Set(source.match(/db:audit:[A-Za-z]+/g) || [])].sort();
  const allowed = ["db:audit:all", "db:audit:append", "db:audit:changed", "db:audit:export", "db:audit:filter", "db:audit:recent", "db:audit:summarize", "db:audit:verify"];
  assert.deepEqual(channels(preload), allowed, "preload exposes no channel that edits or deletes history");
  assert.deepEqual(channels(ipc), allowed, "main handles no channel that edits or deletes history");
  for (const source of [preload, ipc, fs.readFileSync("src/services/company/auditLog.js", "utf8")])
    assert.doesNotMatch(source, /audit(Repo)?\.(clear|remove|bulkInsert|seal)\b|db:audit:(clear|remove|bulkInsert|seal|update)/);
  assert.match(preload, /db:companies:dissolve/);
  assert.match(ipc, /db:companies:dissolve/);
});

test("audit history needs no workspace license to verify, export, append or dissolve", () => {
  // Local workflows are free since 4.1.0; no channel is gated by a workspace license.
  for (const channel of ["db:audit:verify", "db:audit:export", "db:audit:recent", "db:companies:dissolve", "db:audit:append"])
    assert.equal(needsWorkspaceLicense(channel), false, channel);
});
