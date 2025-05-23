// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Determine the binary file for this OS/arch
const platformKey = process.platform === "darwin"
  ? "macos"
  : process.platform === "win32"
    ? "windows"
    : "linux";
const arch = process.arch;
const binName = process.platform === "win32" ? "diffuser.exe" : "diffuser";
const binSource = path.resolve(
  __dirname,
  "binaries",
  `${platformKey}-${arch}`,
  binName
);
if (!fs.existsSync(binSource)) {
  throw new Error(`Expected Python binary at ${binSource}`);
}

export default {
  packagerConfig: {
    // 1) Use runner temp for all ephemeral data
    tmpdir: process.env.RUNNER_TEMP,

    // 2) App icon & name
    icon: "./src/assets/logo",
    executableName: "bonzai",

    // 3) Only ship server scripts + the one correct binary
    extraResource: [
      { from: path.resolve(__dirname, "src", "server"), to: "server" },
      { from: binSource,                          to: "server/python-binary" }
    ],

    // 4) Prevent Python binary from being packed into app.asar
    asarUnpack: ["server/python-binary"],

    // 5) macOS signing & notarization (applies to unpacked binary too)
    osxSign: {
      hardenedRuntime: true,
      entitlements: "entitlements.mac.plist",
      "entitlements-inherit": "entitlements.mac.plist",
      gatekeeperAssess: true,
    },
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
    { name: "@electron-forge/maker-deb", config: { bin: "bonzai" } },
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
