import path from "path";
import fs from "fs";

export default {
  buildIdentifier: "esm",
  defaultResolved: true,
  packagerConfig: {
    icon: "./src/assets/logo",
    executableName: "bonzai",
    extraResource: [
      // Resources will be added dynamically in hooks
    ],
    osxSign: {
      // defaults auto-detect your Developer ID Application cert
      hardenedRuntime: true, // required for Hardened Runtime
      entitlements: "entitlements.mac.plist",
      "entitlements-inherit": "entitlements.mac.plist",
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.MAC_APP_CERT_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      executableName: "bonzai",
      config: {
        bin: "bonzai",
        background: "./src/assets/background.png",
        format: "ULFO",
        iconSize: 192,
        window: {
          width: 1000,
          height: 560,
        },
      },
    },
    {
      name: "@electron-forge/maker-deb",
      executableName: "bonzai",
      config: {
        bin: "bonzai",
      },
    },
    {
      name: "@electron-forge/maker-squirrel",
      executableName: "bonzai",
      config: {
        icon: "./src/assets/logo",
      },
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "bonzai-depin",
          name: "bonzai-desktop-dapp",
        },
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
          {
            entry: "src/main.js",
            config: "vite.main.config.ts",
          },
          {
            entry: "src/preload.js",
            config: "vite.preload.config.ts",
          },
        ],
        renderer: [
          {
            name: "main_window",
            config: "vite.renderer.config.ts",
          },
        ],
      },
    },
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath, electronVersion, platform, arch) => {
      // now buildPath is a string you can join on
      const resourcesPath = platform === "darwin"
        // on macOS .app bundles, resources live under Contents/Resources
        ? path.join(buildPath, "Contents", "Resources")
        : path.join(buildPath, "resources");
  
      const serverDir = path.join(resourcesPath, "server");
      fs.mkdirSync(serverDir, { recursive: true });
  
      // Copy the Python script
      const pythonScriptPath = path.resolve(__dirname, "server/diffuser.py");
      fs.copyFileSync(pythonScriptPath, path.join(serverDir, "diffuser.py"));
  
      console.log(`Packaging for platform: ${platform}, arch: ${arch}`);

      let binarySourcePath;
      let binaryTargetPath = path.join(serverDir, "python-binary");

      if (platform === "darwin") {
        if (arch === "x64") {
          binarySourcePath = path.resolve(
            __dirname,
            "binaries/mac-intel/python"
          );
        } else if (arch === "arm64") {
          binarySourcePath = path.resolve(__dirname, "binaries/mac-arm/python");
        }
      } else if (platform === "win32") {
        binarySourcePath = path.resolve(
          __dirname,
          "binaries/windows/python.exe"
        );
      } else if (platform === "linux") {
        binarySourcePath = path.resolve(__dirname, "binaries/linux/python");
      }

      if (!binarySourcePath) {
        throw new Error(
          `Unsupported platform or architecture: ${platform} ${arch}`
        );
      }

      // Copy the Python binary
      fs.copyFileSync(binarySourcePath, binaryTargetPath);

      console.log(`Copied Python binary to ${binaryTargetPath}`);
    },
  },
};
