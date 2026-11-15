import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
test("team work is never stranded, replayed or silently dropped by cancellations, crashes and lost replies", async () => {
  const folder = fs.mkdtempSync(
    path.join(process.cwd(), ".company-tests-reliability-"),
  );
  const data = fs.mkdtempSync(
    path.join(os.tmpdir(), "bonzai-reliability-"),
  );
  try {
    const outfile = path.join(folder, "recovery.mjs");
    await build({
      entryPoints: ["test/fixtures/company/reliability.js"],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      logLevel: "silent",
      plugins: [
        {
          name: "isolated-reliability",
          setup(builder) {
            builder.onResolve({ filter: /connection\.js$/ }, (args) =>
              args.importer.includes("/src/main/")
                ? { path: path.resolve("test/fixtures/company/connection.js") }
                : null,
            );
            builder.onResolve({ filter: /^electron$/ }, () => ({
              path: "electron",
              namespace: "stub",
            }));
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
