// forge.config.mjs
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import fs               from 'node:fs';

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default {
  packagerConfig: {
    icon: './src/assets/logo',
    executableName: 'bonzai',

    // ─── 1. Ship BOTH your server scripts AND your CI-built binaries folder ───
    // Use absolute paths so Packager finds them on disk.
    extraResource: [
      path.resolve(__dirname, 'src', 'server'),       // Python scripts :contentReference[oaicite:2]{index=2}
      path.resolve(__dirname, 'binaries')             // PyInstaller outputs :contentReference[oaicite:3]{index=3}
    ],

    // ─── macOS Signing & Notarization ───
    osxSign: {
      hardenedRuntime: true,
      entitlements: 'entitlements.mac.plist',
      'entitlements-inherit': 'entitlements.mac.plist'
    },
    osxNotarize: {
      appleId:         process.env.APPLE_ID,
      appleIdPassword: process.env.MAC_APP_CERT_PASSWORD,
      teamId:          process.env.APPLE_TEAM_ID
    },

    // ─── 2. AFTER those extraResource items land in Resources/, run this hook ───
    afterCopyExtraResources: [
      /**
       * @param {string} buildPath   macOS: …/YourApp.app/Contents/Resources/app  
       *                             Win/Linux: …/yourApp-unpacked  
       * @param {string} electronVer Electron version  
       * @param {'darwin'|'win32'|'linux'} platform  
       * @param {string} arch        'x64' | 'arm64' | etc.
       */
      async (buildPath, _electronVer, platform, arch) => {
        // 2.1 Locate the Resources root
        const resourcesRoot = platform === 'darwin'
          ? path.dirname(buildPath)                // …/YourApp.app/Contents/Resources :contentReference[oaicite:4]{index=4}
          : path.join(buildPath, 'resources');     // …/yourApp-unpacked/resources

        // 2.2 Ensure server folder exists
        const serverDir = path.join(resourcesRoot, 'server');
        fs.mkdirSync(serverDir, { recursive: true });  // make server/ 

        // 2.3 Compute where Packager put your binaries/
        //      It will live at Resources/binaries because of extraResource above
        const platformKey = platform === 'darwin' ? 'macos' : platform;
        const binFolder   = path.join(resourcesRoot, 'binaries', `${platformKey}-${arch}`);

        if (!fs.existsSync(binFolder)) {
          throw new Error(`Binary directory not found: ${binFolder}`);
        }

        // 2.4 Pick up whatever file PyInstaller emitted
        const entries = fs.readdirSync(binFolder);
        if (entries.length === 0) {
          throw new Error(`No binaries found in: ${binFolder}`);
        }
        const exeName = entries[0];  // e.g. 'diffuser' or 'diffuser.exe' 
        const srcPath = path.join(binFolder, exeName);

        // 2.5 Copy into server/python-binary
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
    { name: '@electron-forge/maker-deb',    config: { bin: 'bonzai' } },
    { name: '@electron-forge/maker-squirrel', config: { icon: './src/assets/logo' } }
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
