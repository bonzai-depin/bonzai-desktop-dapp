// forge.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appName = "BonzAI";

// tiny helper
function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Missing: ${src}`);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dst, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

export default {
  packagerConfig: {
    icon: "./src/assets/logo",
    executableName: appName,

    // Ignore large build artifacts (anchored to root to not match .vite/build)
    ignore: [
      /^[/\\]dist$/,
      /^[/\\]build$/,
      /^[/\\]bonzai$/,
      /^[/\\]binaries$/,
      /^[/\\]out$/,
      /^[/\\]out-test$/,
      /\.pyc$/,
      /^[/\\]\.venv$/,
      /^[/\\]venv$/,
    ],

    // ship your scripts (optional if you only need the PyInstaller binary)
    extraResource: [path.resolve(__dirname, "src", "server")],

    // ───────── macOS signing & notarization (only on CI where certs are available)
    ...(process.env.CI ? {
      osxSign: {
        identity: process.env.MAC_CODESIGN_IDENTITY || "Developer ID Application",
        "hardened-runtime": true,
        entitlements: "./entitlements.mac.plist",
        "entitlements-inherit": "./entitlements.mac.plist",
        "signature-flags": "library",
        "gatekeeper-assess": false,
      },
      osxNotarize: {
        tool: "notarytool",
        appleId: process.env.APPLE_ID,
        teamId: process.env.APPLE_TEAM_ID,
        password: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      },
    } : {}),

    // After extraResource is copied, embed the correct PyInstaller output
    afterCopyExtraResources: [
      async (buildPath, _ver, platform, arch) => {
        const resourcesRoot =
          platform === "darwin"
            ? path.join(buildPath, `${appName}.app`, "Contents", "Resources")
            : path.join(buildPath, "resources");

        const serverDir = path.join(resourcesRoot, "server");
        fs.mkdirSync(serverDir, { recursive: true });

        const platformKey =
          platform === "darwin"
            ? "macos"
            : platform === "win32"
              ? "windows"
              : "linux";

        // PyInstaller output lives here (created by CI)
        let pyDist = path.resolve(
          __dirname,
          "binaries",
          `${platformKey}-${arch}`
        );
        if (!fs.existsSync(pyDist)) {
          // Skip on local dev where PyInstaller binaries don't exist
          console.log(`[forge] Skipping python runtime copy - binaries not found at ${pyDist} (this is normal for local dev)`);
          return;
        }

        // If there's a single subfolder, descend (e.g. binaries/macos-arm64/diffuser/)
        const entriesTop = fs.readdirSync(pyDist);
        if (
          entriesTop.length === 1 &&
          fs.statSync(path.join(pyDist, entriesTop[0])).isDirectory()
        ) {
          pyDist = path.join(pyDist, entriesTop[0]);
        }

        // Detect onefile vs onedir:
        // - mac: we prefer onefile → a single "diffuser" binary
        // - linux/win: onedir → whole folder of bins/dlls/so's
        const destDir = path.join(
          serverDir,
          "python-runtime",
          `${platformKey}-${arch}`
        );
        fs.mkdirSync(destDir, { recursive: true });

        const hasExe =
          platform === "win32"
            ? fs
                .readdirSync(pyDist)
                .some((f) => f.toLowerCase().endsWith(".exe"))
            : fs.existsSync(path.join(pyDist, "diffuser"));

        if (platform === "darwin" && hasExe) {
          // onefile: copy just the binary but keep the name 'diffuser'
          const src = path.join(pyDist, "diffuser"); // your spec should name the exe "diffuser"
          if (!fs.existsSync(src)) {
            throw new Error(`Expected PyInstaller binary not found: ${src}`);
          }
          copyRecursive(src, path.join(destDir, "diffuser"));
        } else {
          // onedir or fallback: copy entire folder contents
          copyRecursive(pyDist, destDir);
        }

        console.log(
          `[forge] Packaged python runtime from ${pyDist} → ${destDir}`
        );
      },
    ],
  },

  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        background: "./src/assets/background.png",
        format: "ULFO",
        iconSize: 128,
        window: { width: 660, height: 400 },
        contents: [
          { x: 180, y: 170, type: "file", path: "" }, // App icon position (path filled by forge)
          { x: 480, y: 170, type: "link", path: "/Applications" }, // Applications folder
        ],
        additionalDMGOptions: {
          "background-color": "transparent",
          "icon-size": 128,
        },
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
        draft: false,
      },
    },
  ],

  plugins: [
    // Vite plugin disabled - build manually with npm run build:vite before packaging
    // {
    //   name: "@electron-forge/plugin-vite",
    //   config: {
    //     build: [
    //       { entry: "src/main.js", config: "vite.main.config.ts" },
    //       { entry: "src/preload.js", config: "vite.preload.config.ts" },
    //     ],
    //     renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    //   },
    // },
  ],
};
