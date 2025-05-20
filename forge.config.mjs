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
     *   (forgeConfig, buildPath, electronVer, platform, arch)
     */
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVer, platform, arch) => {
      // 1) Locate the Resources root in the bundled app
      //    On macOS: buildPath = …/YourApp.app/Contents/Resources/app
      //    On win/linux: buildPath = …/<yourApp>-unpacked
      const resourcesRoot = platform === 'darwin'
        ? path.dirname(buildPath)                   // …/YourApp.app/Contents/Resources
        : path.join(buildPath, 'resources');        // …/yourApp-unpacked/resources

      // 2) Ensure your server folder exists
      const serverDir = path.join(resourcesRoot, 'server');
      fs.mkdirSync(serverDir, { recursive: true });

      // 3) Compute the directory name where PyInstaller put your binary:
      //    we use `<platformKey>-<arch>` to match your CI output folder.
      //    On macOS that becomes `macos-arm64` or `macos-x64`,
      //    on Linux `linux-x64`, on Windows `windows-x64`, etc.
      const platformKey = platform === 'darwin' ? 'macos' : platform;
      const binDir      = `${platformKey}-${arch}`;
      const binName     = platform === 'win32' ? 'python.exe' : 'python';

      const binSrc = path.join(resourcesRoot, 'binaries', binDir, binName);
      if (!fs.existsSync(binSrc)) {
        throw new Error(`Python binary not found at: ${binSrc}`);
      }

      // 4) Copy it into your app’s server folder
      const binDest = path.join(serverDir, 'python-binary');
      fs.copyFileSync(binSrc, binDest);
      console.log(`Copied Python binary from ${binSrc} → ${binDest}`);
    },
  },
};
