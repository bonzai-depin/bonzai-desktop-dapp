// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 1) Determine current platform & arch:
const platformKey = process.platform === "darwin"
  ? "macos"
  : process.platform === "win32"
    ? "windows"
    : "linux";
const archKey = process.arch;  // x64 or arm64

// 2) Decide expected binary name:
const binName = process.platform === "win32"
  ? "diffuser.exe"
  : "diffuser";

// 3) Resolve its source path in your repo:
const binSource = path.resolve(
  __dirname,
  "binaries",
  `${platformKey}-${archKey}`,
  binName
);
if (!fs.existsSync(binSource)) {
  throw new Error(`Python binary not found at: ${binSource}`);
}

export default {
  packagerConfig: {
    // ─── Use runner temp to avoid ENOSPC & subdir-of-itself ───
    tmpdir: process.env.RUNNER_TEMP,                           

    // ─── App metadata ────────────────────────────────────────
    icon: "./src/assets/logo",
    executableName: "bonzai",

    // ─── CORRECT key for extra resources ─────────────────────
    extraResources: [
      // copy your Flask scripts
      { from: path.resolve(__dirname, "src", "server"), to: "server" },  
      // copy exactly the one-file binary
      { from: binSource,                            to: "server/python-binary" }
    ],

    // ─── Unpack the binary so it lives outside the ASAR ────────
    asarUnpack: ["server/python-binary"],                         

    // ─── macOS signing/notarization (affects unpacked binary too) ──
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },

  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        background: "./src/assets/background.png",
        format: "ULFO",
        iconSize: 192,
        window: { width: 1000, height: 560 },
      },
    },
    { name: "@electron-forge/maker-deb",     config: { bin: "bonzai" } },
    { name: "@electron-forge/maker-squirrel", config: { icon: "./src/assets/logo" } },
  ],

  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "bonzai-depin", name: "bonzai-desktop-dapp" },
        prerelease: false,
        draft: true,
      },
    },
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          { entry: "src/main.js",    config: "vite.main.config.ts"    },
          { entry: "src/preload.js", config: "vite.preload.config.ts" },
        ],
        renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
      },
    },
  ],
};
