// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── 1) Determine which binary to ship ──────────────────────────────
const appName     = "bonzai";
const platformKey = process.platform === "darwin"
  ? "macos"
  : process.platform === "win32"
    ? "windows"
    : "linux";
const archKey     = process.arch;                // "x64" or "arm64"
const binName     = process.platform === "win32" 
  ? "diffuser.exe" 
  : "diffuser";

// Path to the single one-file PyInstaller binary built by your CI:
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
    // ─── avoid subdir-of-itself & ENOSPC by using runner temp ───────
    tmpdir: process.env.RUNNER_TEMP,                                  :contentReference[oaicite:0]{index=0}

    // ─── app metadata & icons ────────────────────────────────────────
    icon: "./src/assets/logo",
    executableName: appName,

    // ─── copy only your server sources + the one binary ─────────────
    extraResource: [
      // your Flask / Python scripts
      { from: path.resolve(__dirname, "src", "server"), to: "server" },
      // exactly the one-file binary
      { from: binSource, to: "server/python-binary" }
    ],

    // ─── keep python-binary unpacked so codesign/notarize see it ─────
    asarUnpack: ["server/python-binary"],

    // ─── macOS signing & notarization (will sign both app & nested exe) ─
    osxSign: {
      hardenedRuntime: true,
      entitlements: "entitlements.mac.plist",
      "entitlements-inherit": "entitlements.mac.plist",
      gatekeeperAssess: true
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    }
  },

  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        background: "./src/assets/background.png",
        format: "ULFO",
        iconSize: 192,
        window: { width: 1000, height: 560 }
      }
    },
    { name: "@electron-forge/maker-deb",    config: { bin: appName } },
    { name: "@electron-forge/maker-squirrel", config: { icon: "./src/assets/logo" } }
  ],

  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "bonzai-depin", name: "bonzai-desktop-dapp" },
        prerelease: false,
        draft: true
      }
    }
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          { entry: "src/main.js",    config: "vite.main.config.ts"    },
          { entry: "src/preload.js", config: "vite.preload.config.ts" }
        ],
        renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }]
      }
    }
  ]
};
