// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const appName    = "bonzai";

export default {
  packagerConfig: {
    // avoid ENOSPC & “subdir of itself”
    tmpdir: process.env.RUNNER_TEMP,

    icon: "./src/assets/logo",
    executableName: appName,

    // ship your Flask scripts + the entire binaries folder
    extraResources: [
      { from: path.resolve(__dirname, "src", "server"), to: "server"  },
      { from: path.resolve(__dirname, "binaries"),       to: "binaries" }
    ],

    // leave the one-file binary unpacked so codesign can see it
    asarUnpack: ["server/python-binary"],
  },

  // after extraResources land in Resources (or resources/)
  // find the right binary for this platform+arch and copy to server/python-binary
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform, arch) => {
      // Resources root differs on macOS vs others:
      const resourcesRoot = platform === "darwin"
        ? path.join(buildPath, `${appName}.app`, "Contents", "Resources")
        : path.join(buildPath, "resources");

      const serverDir = path.join(resourcesRoot, "server");
      fs.mkdirSync(serverDir, { recursive: true });

      // map Node’s platform+arch to your binaries folder
      const platformKey = platform === "darwin" ? "macos"
                        : platform === "win32"  ? "windows"
                        : "linux";
      const binFolder = path.resolve(
        __dirname,
        "binaries",
        `${platformKey}-${arch}`
      );
      if (!fs.existsSync(binFolder)) {
        throw new Error(`Binary directory not found: ${binFolder}`);
      }

      // pick out the single executable file
      const files = fs.readdirSync(binFolder).filter(f => {
        const full = path.join(binFolder, f);
        return fs.statSync(full).isFile();
      });
      if (files.length === 0) {
        throw new Error(`No files in binary folder: ${binFolder}`);
      }

      // choose .exe on Windows, or literal “diffuser” on macOS/Linux
      let exeName;
      if (platform === "win32") {
        exeName = files.find(f => f.toLowerCase().endsWith(".exe"));
        if (!exeName) throw new Error(`No .exe in ${binFolder}`);
      } else {
        exeName = files.find(f => f === "diffuser");
        if (!exeName) throw new Error(`"diffuser" missing in ${binFolder}`);
      }

      const src = path.join(binFolder, exeName);
      const dest = path.join(serverDir, "python-binary");
      fs.copyFileSync(src, dest);
      console.log(`Copied ${src} → ${dest}`);
    },
  },

  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        background: "./src/assets/background.png",
        format:     "ULFO",
        iconSize:   192,
        window:     { width: 1000, height: 560 },
      },
    },
    { name: "@electron-forge/maker-deb",     config: { bin: appName } },
    { name: "@electron-forge/maker-squirrel", config: { icon: "./src/assets/logo" } },
  ],

  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "bonzai-depin", name: "bonzai-desktop-dapp" },
        prerelease: false,
        draft:      true,
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
