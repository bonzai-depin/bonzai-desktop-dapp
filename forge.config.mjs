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
    icon: "./src/assets/logo",
    executableName: appName,

    // 1) Put temp OUTSIDE the repo to avoid subdir-of-itself & ENOSPC
    // tmpdir: path.resolve(__dirname, "..", "tmp"), // :contentReference[oaicite:6]{index=6}
    tmpdir: process.env.RUNNER_TEMP,
    // 2) Ship your Python scripts + CI-built binaries
    extraResource: [path.resolve(__dirname, "src", "server")], // :contentReference[oaicite:7]{index=7}

    // 3) macOS signing/notarization
    osxSign: {
      /* … */
    },
    osxNotarize: {
      /* … */
    },

    // 4) AFTER extraResource is copied, embed the correct PyInstaller output
    afterCopyExtraResources: [
      async (buildPath, _ver, platform, arch) => {
        // A) locate Resources root
        const resourcesRoot =
          platform === "darwin"
            ? path.join(buildPath, `${appName}.app`, "Contents", "Resources")
            : path.join(buildPath, "resources");

        // B) ensure server folder exists
        const serverDir = path.join(resourcesRoot, "server");
        fs.mkdirSync(serverDir, { recursive: true });

        // C) pick platform key matching your build folder
        const platformKey =
          platform === "darwin"
            ? "macos"
            : platform === "win32"
            ? "windows"
            : "linux";

        // D) locate only that arch’s binary folder
        const binFolder = path.resolve(
          __dirname,
          "binaries",
          `${platformKey}-${arch}`
        );
        if (!fs.existsSync(binFolder)) {
          throw new Error(`Binary directory not found: ${binFolder}`);
        }

        // Determine the source path:
        let srcPath = binFolder;
        const stat = fs.statSync(binFolder);
        if (stat.isDirectory()) {
          // Drill in: expect exactly one entry (the folder or file)
          const entries = fs.readdirSync(binFolder);
          if (entries.length !== 1) {
            throw new Error(
              `Expected one entry in ${binFolder}, found: ${entries}`
            );
          }
          const entry = entries[0];
          // If that entry is itself a folder, look inside once more
          const candidate = path.join(binFolder, entry);
          const cstat = fs.statSync(candidate);
          srcPath = cstat.isDirectory()
            ? path.join(candidate, entry) // nested folder/executable
            : candidate; // direct file
        }

        const destPath = path.join(serverDir, "python-binary");
        fs.copyFileSync(srcPath, destPath);

        console.log(`Copied ${srcPath} → ${destPath}`);
      },
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
