// forge.config.mjs
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import fs               from 'node:fs';

// recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default {
  packagerConfig: {
    icon: './src/assets/logo',
    executableName: 'bonzai',
    // ship both your Python script & binaries into the app's Resources folder
    extraResource: [
      'src/server',  // copy your Python script
      'binaries'     // copy the entire binaries/ folder
    ],
    osxSign: {
      hardenedRuntime: true,
      entitlements: 'entitlements.mac.plist',
      'entitlements-inherit': 'entitlements.mac.plist',
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.MAC_APP_CERT_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        bin: 'bonzai',
        background: './src/assets/background.png',
        format: 'ULFO',
        iconSize: 192,
        window: { width: 1000, height: 560 },
      },
    },
    { name: '@electron-forge/maker-deb',    config: { bin: 'bonzai' } },
    { name: '@electron-forge/maker-squirrel', config: { icon: './src/assets/logo' } },
  ],

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'bonzai-depin', name: 'bonzai-desktop-dapp' },
        prerelease: false,
        draft: true,
      },
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          { entry: 'src/main.js',   config: 'vite.main.config.ts'   },
          { entry: 'src/preload.js', config: 'vite.preload.config.ts' },
        ],
        renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
      },
    },
  ],

  hooks: {
    /**
     * packageAfterCopy(forgeConfig, buildPath, electronVer, platform, arch)
     */
    packageAfterCopy: async (_forgeConfig, buildPath, _ver, platform, arch) => {
      // 1) Determine the Resources root inside the bundle
      const resourcesRoot = platform === 'darwin'
        ? path.dirname(buildPath)               // …/YourApp.app/Contents/Resources
        : path.join(buildPath, 'resources');    // …/yourApp-unpacked/resources

      // 2) Create server folder
      const serverDir = path.join(resourcesRoot, 'server');
      fs.mkdirSync(serverDir, { recursive: true });

      // 3) Compute the CI-built directory name (e.g. macos-x64, macos-arm64, linux-x64, windows-x64)
      const platformKey = platform === 'darwin' ? 'macos' : platform;
      const binDir      = path.join(resourcesRoot, 'binaries', `${platformKey}-${arch}`);

      if (!fs.existsSync(binDir)) {
        throw new Error(`Binary directory not found: ${binDir}`);
      }

      // 4) Dynamically pick the first file in that directory
      const files = fs.readdirSync(binDir);  // synchronous read :contentReference[oaicite:3]{index=3}
      if (files.length === 0) {
        throw new Error(`No files found in binary directory: ${binDir}`);
      }
      // assume the executable is the only file (or first)
      const binName = files[0];
      const binSrc  = path.join(binDir, binName);

      // 5) Final existence check
      if (!fs.existsSync(binSrc)) {
        throw new Error(`Executable not found at: ${binSrc}`);
      }

      // 6) Copy into your app’s server folder
      const binDest = path.join(serverDir, 'python-binary');
      fs.copyFileSync(binSrc, binDest);
      console.log(`Copied Python binary from ${binSrc} → ${binDest}`);
    },
  },
};
