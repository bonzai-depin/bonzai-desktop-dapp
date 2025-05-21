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

        // E) copy just the first file (diffuser or diffuser.exe)
        const [exeName] = fs.readdirSync(binFolder);
        const srcPath = path.join(binFolder, exeName);
        const destPath = path.join(serverDir, "python-binary");
        fs.copyFileSync(srcPath, destPath);

        console.log(`Copied ${exeName} → ${destPath}`);
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
