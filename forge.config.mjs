// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// your app name must match your executableName
const appName = "bonzai";

export default {
  packagerConfig: {
    // Keep python binary out of asar so it can be signed
    asarUnpack: ["server/python-binary"],
    icon: "./src/assets/logo",
    executableName: appName,

    // 1) Put temp OUTSIDE the repo to avoid subdir-of-itself & ENOSPC
    // tmpdir: path.resolve(__dirname, "..", "tmp"), // :contentReference[oaicite:6]{index=6}
    tmpdir: process.env.RUNNER_TEMP,
    // 2) Ship your Python scripts + CI-built binaries
    extraResource: [
      path.resolve(__dirname, "src", "server"),
      path.resolve(__dirname, "binaries")
    ],
    // 3) macOS signing/notarization
    osxSign: {
      hardenedRuntime: true,
      entitlements: "entitlements.mac.plist",
      "entitlements-inherit": "entitlements.mac.plist",
      gatekeeperAssess: true, // ← ensures nested code is checked
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },

    // 4) AFTER extraResource is copied, embed the correct PyInstaller output
    afterCopyExtraResources: [
      async (buildPath, _ver, platform, arch) => {
        // 1) Determine the root Resources folder:
        const resourcesRoot = platform === "darwin"
          ? path.join(buildPath, `${appName}.app`, "Contents", "Resources")
          : path.join(buildPath, "resources");

        // 2) Ensure server/ exists for your Flask script + binary:
        const serverDir = path.join(resourcesRoot, "server");
        fs.mkdirSync(serverDir, { recursive: true });

        // 3) Build the path to where GitHub Actions put your bin:
        const platformKey = platform === "darwin" ? "macos"
                           : platform === "win32"  ? "windows"
                           : "linux";
        const binFolder = path.join(
          resourcesRoot,
          "binaries",
          `${platformKey}-${arch}`
        );

        if (!fs.existsSync(binFolder)) {
          throw new Error(`Binary directory not found: ${binFolder}`);
        }

        // 4) Find the single executable inside that folder:
        const files = fs
          .readdirSync(binFolder)
          .filter(name =>
            fs.statSync(path.join(binFolder, name)).isFile()
          );

        if (files.length === 0) {
          throw new Error(`No files found in ${binFolder}`);
        }

        // 5) Pick .exe on Windows, or the bare name on macOS/Linux:
        let exeName;
        if (platform === "win32") {
          exeName = files.find(f => f.toLowerCase().endsWith(".exe"));
          if (!exeName) {
            throw new Error(`No .exe found in ${binFolder}: ${files}`);
          }
        } else {
          // assume exactly one file like "diffuser"
          if (files.length > 1) {
            console.warn(
              `Multiple files in ${binFolder}, defaulting to first:`,
              files
            );
          }
          exeName = files[0];
        }

        // 6) Copy it into server/python-binary for your Electron app to spawn:
        const srcPath  = path.join(binFolder, exeName);
        const destPath = path.join(serverDir, "python-binary");
        fs.copyFileSync(srcPath, destPath);

        console.log(`Copied ${srcPath} → ${destPath}`);
      }
    ],
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
    { name: "@electron-forge/maker-deb", config: { bin: appName } },
    {
      name: "@electron-forge/maker-squirrel",
      config: { icon: "./src/assets/logo" },
    },
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
          { entry: "src/main.js", config: "vite.main.config.ts" },
          { entry: "src/preload.js", config: "vite.preload.config.ts" },
        ],
        renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
      },
    },
  ],
};
