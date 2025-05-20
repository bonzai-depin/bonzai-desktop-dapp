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
      { from: path.resolve(__dirname, 'src', 'server'), to: 'server' },
      { from: path.resolve(__dirname, 'binaries'),      to: 'binaries' },
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
     * packageAfterCopy signature:
     *   (forgeConfig: Object,
     *    buildPath:   string,
     *    electronVer: string,
     *    platform:    'darwin'|'win32'|'linux',
     *    arch:        'x64'|'arm64'|…)
     */
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVer, platform, arch) => {
      // ─── locate the Resources folder ───
      // on macOS buildPath = .../YourApp.app/Contents/Resources/app
      // so go up one: .../YourApp.app/Contents/Resources
      const resourcesRoot = platform === 'darwin'
        ? path.dirname(buildPath)
        : // on Windows/Linux buildPath = .../yourApp-unpacked
          path.join(buildPath, 'resources');

      const serverDir = path.join(resourcesRoot, 'server');
      fs.mkdirSync(serverDir, { recursive: true });

      // ─── copy your Python script (already in extraResource) ───
      // we shipped it into resources/server/diffuser.py
      console.log(`Copying diffuser.py → ${serverDir}`);
      // no-op if you rely on extraResource

      // ─── pick & copy the correct binary ───
      let binSrc;
      if (platform === 'darwin') {
        binSrc = arch === 'x64'
          ? path.join(resourcesRoot, 'binaries', 'mac-intel', 'python')
          : path.join(resourcesRoot, 'binaries', 'mac-arm',   'python');
      } else if (platform === 'win32') {
        binSrc = path.join(resourcesRoot, 'binaries', 'windows', 'python.exe');
      } else {
        binSrc = path.join(resourcesRoot, 'binaries', 'linux',   'python');
      }

      if (!fs.existsSync(binSrc)) {
        throw new Error(`Python binary not found at: ${binSrc}`);
      }

      const binDest = path.join(serverDir, 'python-binary');
      fs.copyFileSync(binSrc, binDest);
      console.log(`Copied Python binary from ${binSrc} → ${binDest}`);
    },
  },
};
