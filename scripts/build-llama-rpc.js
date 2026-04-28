#!/usr/bin/env node

/**
 * BonzAI — Build llama.cpp RPC binaries from upstream source
 *
 * Clones llama.cpp directly from the official GitHub repo and compiles
 * rpc-server and llama-server with GGML_RPC=ON + platform GPU backend.
 *
 * Why upstream instead of node-llama-cpp's bundled snapshot:
 * the bundle pins to whichever commit node-llama-cpp shipped (currently
 * b8179) which lags weeks behind. New model architectures (e.g. gemma4)
 * land on master before they reach a node-llama-cpp release.
 *
 * Usage:
 *   npm run build:rpc                              # latest master
 *   npm run build:rpc -- --clean                   # force rebuild
 *   npm run build:rpc -- --ref=master              # explicit ref
 *   LLAMA_CPP_REF=b8550 npm run build:rpc -- --clean
 *
 * Output:
 *   bin/{platform}-{arch}/rpc-server
 *   bin/{platform}-{arch}/llama-server
 *   bin/{platform}-{arch}/.llama-source.json   (records ref + commit for staleness detection)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ─────────────────────────────────────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM = process.platform; // darwin, win32, linux
const ARCH = process.arch;         // arm64, x64

const PLATFORM_KEY = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
}[PLATFORM] || PLATFORM;

const BIN_DIR = path.join(ROOT, "bin", `${PLATFORM_KEY}-${ARCH}`);
const SOURCE_MARKER = path.join(BIN_DIR, ".llama-source.json");
const BUILD_DIR = path.join(os.tmpdir(), "bonzai-llama-rpc-build");
const SRC_DIR = path.join(BUILD_DIR, "llama-src");
const CMAKE_BUILD_DIR = path.join(BUILD_DIR, "build");

// ─────────────────────────────────────────────────────────────────────────────
// Source resolution — clone upstream llama.cpp at the requested ref.
// Default: master (latest). Override with --ref=<branch|tag|sha> or env var.
// ─────────────────────────────────────────────────────────────────────────────

const LLAMA_CPP_REPO = process.env.LLAMA_CPP_REPO || "https://github.com/ggml-org/llama.cpp.git";

function resolveRef(cliArgs) {
  const cliRef = cliArgs.find((a) => a.startsWith("--ref="));
  if (cliRef) return cliRef.slice("--ref=".length);
  return process.env.LLAMA_CPP_REF || "master";
}

// ─────────────────────────────────────────────────────────────────────────────
// cmake flags per platform
// ─────────────────────────────────────────────────────────────────────────────

function getCmakeFlags() {
  const flags = [
    "-DGGML_RPC=ON",
    "-DCMAKE_BUILD_TYPE=Release",
    "-DLLAMA_BUILD_TESTS=OFF",
    "-DLLAMA_BUILD_EXAMPLES=OFF",
    "-DBUILD_SHARED_LIBS=OFF",  // Static linking — self-contained binaries
  ];

  if (PLATFORM === "darwin") {
    flags.push("-DGGML_METAL=ON");
    flags.push("-DGGML_BLAS=OFF");  // Accelerate BLAS conflicts with RPC — Metal handles everything
    // Apple Silicon: use native arch
    if (ARCH === "arm64") {
      flags.push("-DCMAKE_OSX_ARCHITECTURES=arm64");
    }
  } else if (PLATFORM === "linux" || PLATFORM === "win32") {
    // Check for CUDA toolkit
    const hasCuda = (() => {
      try {
        execSync("nvcc --version", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();

    if (hasCuda) {
      flags.push("-DGGML_CUDA=ON");
      console.log("  CUDA detected — enabling GPU acceleration");
    } else {
      console.log("  No CUDA detected — CPU-only build");
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build steps
// ─────────────────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function clean() {
  if (fs.existsSync(BUILD_DIR)) {
    console.log(`Cleaning ${BUILD_DIR}`);
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
}

function cloneSource(ref) {
  console.log(`Cloning llama.cpp from ${LLAMA_CPP_REPO} at ref '${ref}'...`);
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Shallow clone is much faster but git can't shallow-clone an arbitrary
  // commit SHA without the remote enabling uploadpack.allowReachableSHA1InWant.
  // For named refs (master, b8550, v1.2.3) --depth 1 works; for raw SHAs we
  // fall back to a full clone + checkout.
  const looksLikeSha = /^[0-9a-f]{7,40}$/i.test(ref);

  if (looksLikeSha) {
    run(`git clone "${LLAMA_CPP_REPO}" "${SRC_DIR}"`);
    run(`git -C "${SRC_DIR}" checkout ${ref}`);
  } else {
    run(`git clone --depth 1 --branch ${ref} "${LLAMA_CPP_REPO}" "${SRC_DIR}"`);
  }

  const headSha = execSync(`git -C "${SRC_DIR}" rev-parse HEAD`, { encoding: "utf8" }).trim();
  console.log(`  Checked out ${ref} → ${headSha.slice(0, 12)}`);

  // Verify the build targets exist in the checked-out tree.
  const rpcSrc = path.join(SRC_DIR, "tools", "rpc", "rpc-server.cpp");
  const serverSrc = path.join(SRC_DIR, "tools", "server", "server.cpp");
  if (!fs.existsSync(rpcSrc)) {
    console.error(`ERROR: rpc-server.cpp not found at ${rpcSrc}`);
    console.error("This llama.cpp ref may not include RPC support.");
    process.exit(1);
  }
  if (!fs.existsSync(serverSrc)) {
    console.error(`ERROR: server.cpp not found at ${serverSrc}`);
    process.exit(1);
  }

  return { ref, sha: headSha };
}

function readSourceMarker() {
  if (!fs.existsSync(SOURCE_MARKER)) return null;
  try {
    return JSON.parse(fs.readFileSync(SOURCE_MARKER, "utf8"));
  } catch {
    return null;
  }
}

function writeSourceMarker(info) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(
    SOURCE_MARKER,
    JSON.stringify({ ...info, builtAt: new Date().toISOString() }, null, 2)
  );
}

function configure() {
  console.log("Configuring cmake...");
  fs.mkdirSync(CMAKE_BUILD_DIR, { recursive: true });

  const flags = getCmakeFlags();
  const flagStr = flags.join(" ");
  console.log(`  cmake flags: ${flagStr}`);

  run(`cmake ${flagStr} -S "${SRC_DIR}" -B "${CMAKE_BUILD_DIR}"`);
}

function compile() {
  const cores = os.cpus().length;
  console.log(`Compiling rpc-server and llama-server (${cores} cores)...`);

  // Build only the targets we need
  run(`cmake --build "${CMAKE_BUILD_DIR}" --target rpc-server --config Release -j ${cores}`);
  run(`cmake --build "${CMAKE_BUILD_DIR}" --target llama-server --config Release -j ${cores}`);
}

function copyBinaries() {
  console.log(`Copying binaries to ${BIN_DIR}`);
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const ext = PLATFORM === "win32" ? ".exe" : "";
  // MSVC puts binaries in bin/Release/ (multi-config generator), GCC/Clang in bin/
  const binaries = [
    { name: `rpc-server${ext}`, searchDirs: ["bin/Release", "bin", "tools/rpc/Release", "tools/rpc", "."] },
    { name: `llama-server${ext}`, searchDirs: ["bin/Release", "bin", "tools/server/Release", "tools/server", "."] },
  ];

  for (const { name, searchDirs } of binaries) {
    let found = false;
    for (const dir of searchDirs) {
      const src = path.join(CMAKE_BUILD_DIR, dir, name);
      if (fs.existsSync(src)) {
        const dest = path.join(BIN_DIR, name);
        fs.copyFileSync(src, dest);
        if (PLATFORM !== "win32") {
          fs.chmodSync(dest, 0o755);
        }
        const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
        console.log(`  ${name} (${sizeMB} MB) → ${dest}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.error(`ERROR: Could not find compiled ${name} in build output`);
      console.error(`Searched in: ${searchDirs.map((d) => path.join(CMAKE_BUILD_DIR, d)).join(", ")}`);
      process.exit(1);
    }
  }
}

function verify() {
  console.log("Verifying binaries...");
  const ext = PLATFORM === "win32" ? ".exe" : "";

  for (const name of [`rpc-server${ext}`, `llama-server${ext}`]) {
    const binPath = path.join(BIN_DIR, name);
    if (!fs.existsSync(binPath)) {
      console.error(`ERROR: ${binPath} not found`);
      process.exit(1);
    }

    // Quick sanity check — run with --help (should exit 0 or 1 with usage text)
    try {
      execSync(`"${binPath}" --help`, { stdio: "pipe", timeout: 5000 });
    } catch (e) {
      // --help often exits with code 1, that's fine
      if (e.status > 1) {
        console.error(`WARNING: ${name} --help exited with code ${e.status}`);
      }
    }
    console.log(`  ✓ ${name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const shouldClean = args.includes("--clean");
const requestedRef = resolveRef(args);

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  BonzAI — Build llama.cpp RPC binaries                     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`Platform: ${PLATFORM_KEY}-${ARCH}`);
console.log(`Source:   ${LLAMA_CPP_REPO} @ ${requestedRef}`);
console.log(`Output:   ${BIN_DIR}`);
console.log();

if (shouldClean) clean();

// Skip if binaries already exist AND were built from the same ref. A ref
// change forces a rebuild even without --clean, so users get gemma4 (or
// whatever they bumped to) without manually remembering --clean.
const ext = PLATFORM === "win32" ? ".exe" : "";
const rpcBin = path.join(BIN_DIR, `rpc-server${ext}`);
const serverBin = path.join(BIN_DIR, `llama-server${ext}`);
const prevMarker = readSourceMarker();
const refMatches = prevMarker && prevMarker.ref === requestedRef;

if (fs.existsSync(rpcBin) && fs.existsSync(serverBin) && !shouldClean && refMatches) {
  console.log(`Binaries already built from ref '${requestedRef}' (${prevMarker.sha?.slice(0, 12)}).`);
  console.log("Use --clean to force a rebuild, or change --ref to bump the source.");
  console.log(`  ${rpcBin}`);
  console.log(`  ${serverBin}`);
  process.exit(0);
}

if (fs.existsSync(rpcBin) && fs.existsSync(serverBin) && !refMatches) {
  console.log(
    `Existing binaries were built from ref '${prevMarker?.ref ?? "unknown"}'; ` +
    `requested '${requestedRef}'. Rebuilding.`
  );
}

try {
  const sourceInfo = cloneSource(requestedRef);
  configure();
  compile();
  copyBinaries();
  writeSourceMarker(sourceInfo);
  verify();

  console.log();
  console.log("Build complete.");
  console.log(`  rpc-server:   ${path.join(BIN_DIR, `rpc-server${ext}`)}`);
  console.log(`  llama-server: ${path.join(BIN_DIR, `llama-server${ext}`)}`);
  console.log(`  source ref:   ${sourceInfo.ref} (${sourceInfo.sha.slice(0, 12)})`);
} finally {
  // Clean up temp build dir
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
}
