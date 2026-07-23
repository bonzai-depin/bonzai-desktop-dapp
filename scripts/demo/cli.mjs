#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureDesktop } from "./capture-electron.mjs";
import { loadManifest } from "./manifest.mjs";
import { composeProductFilm, probeVideo, sha256 } from "./media.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = { command: "" };
  const values = new Set(["feature", "manifest", "output", "format", "reel"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--") && !args.command) args.command = token;
    else if (token === "--skip-capture") args[token.slice(2).replaceAll("-", "_")] = true;
    else if (token.startsWith("--") && values.has(token.slice(2))) args[token.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!args.command) args.command = args.format === "cinematic" ? "compose" : args.format === "product" ? "capture" : "validate";
  return args;
}

function runId() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function gitCommit() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(); }
  catch { return null; }
}

async function findLatestRun(feature) {
  const root = path.join(repoRoot, "output/demos", feature);
  const entries = await import("node:fs/promises").then(({ readdir }) => readdir(root, { withFileTypes: true }));
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().at(-1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const feature = args.feature || "company-agentic-team";
  const manifestPath = path.resolve(repoRoot, args.manifest || `demos/features/${feature}.json`);
  const loaded = await loadManifest(manifestPath);
  const { manifest } = loaded;
  console.log(`Validated ${manifest.id} (${loaded.hash.slice(0, 12)})`);
  if (args.command === "validate") return;

  let selectedRunId = runId();
  if (args.command === "compose" && args.skip_capture && !args.output) selectedRunId = await findLatestRun(feature);
  const runDir = path.resolve(args.output || path.join(repoRoot, "output/demos", feature, selectedRunId));
  await mkdir(runDir, { recursive: true });

  if (!args.skip_capture) {
    await access(path.join(repoRoot, ".vite/build/main.js"));
    await access(path.join(repoRoot, ".vite/renderer/main_window/index.html"));
    console.log("Capturing isolated Electron states...");
    await captureDesktop({ repoRoot, manifest, runDir });
  }
  if (args.command === "capture") {
    console.log(`Capture complete: ${path.join(runDir, "capture")}`);
    return;
  }

  if (args.command !== "compose") throw new Error(`Unknown command: ${args.command}`);
  if (!args.reel) throw new Error("--reel is required and must point to an approved PixVerse film or plate reel");
  const reel = path.resolve(args.reel);
  await access(reel);
  const master = path.join(runDir, "master", `${manifest.id}-product-film-1080p60.mp4`);
  console.log("Composing exact product captures with approved cinematic plates...");
  await composeProductFilm({
    reel,
    captureDir: path.join(runDir, "capture"),
    segments: manifest.film.segments,
    transition: manifest.film.transition || 0.4,
    output: master,
  });
  const ledger = {
    schemaVersion: 1,
    feature: manifest.id,
    manifest: { file: loaded.file, sha256: loaded.hash },
    gitCommit: process.env.GIT_COMMIT || gitCommit(),
    createdAt: new Date().toISOString(),
    mode: "exact-product-composite",
    sourceReel: { file: reel, sha256: await sha256(reel) },
    segments: manifest.film.segments,
  };
  ledger.master = { file: path.relative(runDir, master), sha256: await sha256(master), probe: await probeVideo(master) };
  ledger.completedAt = new Date().toISOString();
  await writeFile(path.join(runDir, "provenance.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`Master complete: ${master}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
