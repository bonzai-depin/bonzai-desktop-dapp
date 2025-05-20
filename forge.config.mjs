// forge.config.mjs
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import fs               from 'node:fs';

// Re-create __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default {
  packagerConfig: {
    icon: './src/assets/logo',
    executableName: 'bonzai',

    // ─── Ship these folders into Contents/Resources ───
    extraResource: [
      'src/server',  // your Python script(s)
      'binaries'     // your CI‐built PyInstaller binaries
    ],

    // ─── Electron Builder‐style signing/notarization for macOS ───
    osxSign: {
      hardenedRuntime: true,
      entitlements: 'entitlements.mac.plist',
      'entitlements-inherit': 'entitlements.mac.plist'
    },
    osxNotarize: {
      appleId:        process.env.APPLE_ID,
      appleIdPassword:process.env.MAC_APP_CERT_PASSWORD,
      teamId:         process.env.APPLE_TEAM_ID
    },

    // ─── AFTER the extraResource above are copied in, run this hook ───
    afterCopyExtraResources: [
      /**
       * Fired after extraResource folders are in Resources.
       *
       * @param {string} buildPath   …/YourApp.app/Contents/Resources/app   (macOS)
       *                             or …/yourApp-unpacked                  (win/linux)
       * @param {string} electronVer Electron version string
       * @param {'darwin'|'win32'|'linux'} platform
       * @param {string} arch        e.g. 'x64' | 'arm64'
       */
      async (buildPath, electronVer, platform, arch) => {
        // 1. Determine the root of Resources/
        const resourcesRoot = platform === 'darwin'
          ? path.dirname(buildPath)               // …/YourApp.app/Contents/Resources
          : path.join(buildPath, 'resources');    // …/yourApp-unpacked/resources

        // 2. Ensure a server folder exists
        const serverDir = path.join(resourcesRoot, 'server');
        fs.mkdirSync(serverDir, { recursive: true });

        // 3. Locate the CI output folder: binaries/<platformKey>-<arch>
        const platformKey = platform === 'darwin' ? 'macos' : platform;
        const binFolder   = path.join(resourcesRoot, 'binaries', `${platformKey}-${arch}`);

        if (!fs.existsSync(binFolder)) {
          throw new Error(`Binary directory not found: ${binFolder}`);
        }

        // 4. Read whichever file PyInstaller produced (e.g. "diffuser" or "diffuser.exe")
        const entries = fs.readdirSync(binFolder);
        if (entries.length === 0) {
          throw new Error(`No binaries found in: ${binFolder}`);
        }
        const exeName = entries[0];
        const srcPath = path.join(binFolder, exeName);

        // 5. Copy into server/python-binary
        const destPath = path.join(serverDir, 'python-binary');
        fs.copyFileSync(srcPath, destPath);

        console.log(`Copied ${exeName} from ${srcPath} → ${destPath}`);
      }
    ]
  },

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: './src/assets/background.png',
        format: 'ULFO',
        iconSize: 192,
        window: { width: 1000, height: 560 }
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: { bin: 'bonzai' }
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: { icon: './src/assets/logo' }
    }
  ],

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'bonzai-depin', name: 'bonzai-desktop-dapp' },
        prerelease: false,
        draft: true
      }
    }
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          { entry: 'src/main.js',   config: 'vite.main.config.ts'   },
          { entry: 'src/preload.js',config: 'vite.preload.config.ts' }
        ],
        renderer: [
          { name: 'main_window', config: 'vite.renderer.config.ts' }
        ]
      }
    }
  ]
};
