#!/usr/bin/env node

/**
 * BonzAI — Build llama.cpp RPC binaries from bundled source
 *
 * Extracts the llama.cpp git bundle shipped with node-llama-cpp,
 * compiles rpc-server and llama-server with GGML_RPC=ON + platform GPU backend.
 *
 * Usage:
 *   npm run build:rpc          # Build for current platform
 *   node scripts/build-llama-rpc.js --clean   # Clean and rebuild
 *
 * Output:
 *   bin/{platform}-{arch}/rpc-server
 *   bin/{platform}-{arch}/llama-server
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
const BUNDLE_PATH = path.join(ROOT, "node_modules", "node-llama-cpp", "llama", "gitRelease.bundle");
const BUILD_DIR = path.join(os.tmpdir(), "bonzai-llama-rpc-build");
const SRC_DIR = path.join(BUILD_DIR, "llama-src");
const CMAKE_BUILD_DIR = path.join(BUILD_DIR, "build");

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

function extractBundle() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error(`ERROR: llama.cpp git bundle not found at ${BUNDLE_PATH}`);
    console.error("Run 'npm install' first to ensure node-llama-cpp is installed.");
    process.exit(1);
  }

  console.log("Extracting llama.cpp source from git bundle...");
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  run(`git clone "${BUNDLE_PATH}" "${SRC_DIR}"`, { stdio: "pipe" });

  // Verify rpc-server source exists
  const rpcSrc = path.join(SRC_DIR, "tools", "rpc", "rpc-server.cpp");
  const serverSrc = path.join(SRC_DIR, "tools", "server", "server.cpp");
  if (!fs.existsSync(rpcSrc)) {
    console.error(`ERROR: rpc-server.cpp not found at ${rpcSrc}`);
    console.error("The bundled llama.cpp version may not include RPC support.");
    process.exit(1);
  }
  if (!fs.existsSync(serverSrc)) {
    console.error(`ERROR: server.cpp not found at ${serverSrc}`);
    process.exit(1);
  }

  // Read and display llama.cpp version
  const infoPath = path.join(ROOT, "node_modules", "node-llama-cpp", "llama", "llama.cpp.info.json");
  if (fs.existsSync(infoPath)) {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
    console.log(`  llama.cpp version: ${info.tag} (from ${info.llamaCppGithubRepo})`);
  }
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
  const binaries = [
    { name: `rpc-server${ext}`, searchDirs: ["bin", "tools/rpc", "."] },
    { name: `llama-server${ext}`, searchDirs: ["bin", "tools/server", "."] },
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

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  BonzAI — Build llama.cpp RPC binaries                     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`Platform: ${PLATFORM_KEY}-${ARCH}`);
console.log(`Output:   ${BIN_DIR}`);
console.log();

if (shouldClean) clean();

// Skip if binaries already exist and --clean not passed
const ext = PLATFORM === "win32" ? ".exe" : "";
const rpcBin = path.join(BIN_DIR, `rpc-server${ext}`);
const serverBin = path.join(BIN_DIR, `llama-server${ext}`);
if (fs.existsSync(rpcBin) && fs.existsSync(serverBin) && !shouldClean) {
  console.log("Binaries already exist. Use --clean to force rebuild.");
  console.log(`  ${rpcBin}`);
  console.log(`  ${serverBin}`);
  process.exit(0);
}

try {
  extractBundle();
  configure();
  compile();
  copyBinaries();
  verify();

  console.log();
  console.log("Build complete.");
  console.log(`  rpc-server:   ${path.join(BIN_DIR, `rpc-server${ext}`)}`);
  console.log(`  llama-server: ${path.join(BIN_DIR, `llama-server${ext}`)}`);
} finally {
  // Clean up temp build dir
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
}
