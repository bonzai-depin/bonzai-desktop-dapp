// forge.config.mjs
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import fs               from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// your app name must match your executableName
const appName = 'bonzai';

export default {
  packagerConfig: {
    icon: './src/assets/logo',
    executableName: appName,

    // ─── 1) Ensure Packager temp files land in workspace/tmp, not /tmp ───
    //    Avoid ENOSPC on GitHub Actions runners :contentReference[oaicite:3]{index=3}
    os: { 
      // set env for the packing process
      // this can also be set in your CI yml, but here’s how to do it in-code
      afterCopyExtraResources: []
    },
    tmpdir: path.resolve(process.cwd(), 'tmp'), // instruct electron-packager to use this dir

    // ─── 2) Ship your Python server & CI-built binaries ───
    extraResource: [
      path.resolve(__dirname, 'src', 'server'),  // Python scripts
      path.resolve(__dirname, 'binaries')        // PyInstaller outputs
    ],

    // ─── 3) macOS signing & notarization ───
    osxSign: {
      hardenedRuntime: true,
      entitlements: 'entitlements.mac.plist',
      'entitlements-inherit': 'entitlements.mac.plist'
    },
    osxNotarize: {
      appleId:         process.env.APPLE_ID,
      appleIdPassword:process.env.MAC_APP_CERT_PASSWORD,
      teamId:          process.env.APPLE_TEAM_ID
    },

    // ─── 4) AFTER extraResource is copied, pick & embed your Python binary ───
    afterCopyExtraResources: [
      async (buildPath, _electronVer, platform, arch) => {
        // 4.1) Locate Resources root explicitly:
        //     - macOS: <root>/<appName>.app/Contents/Resources  
        //     - Linux/Windows: <root>/resources
        const resourcesRoot = platform === 'darwin'
          ? path.join(buildPath, `${appName}.app`, 'Contents', 'Resources')
          : path.join(buildPath, 'resources');
        
        // 4.2) Ensure server/ exists
        const serverDir = path.join(resourcesRoot, 'server');
        fs.mkdirSync(serverDir, { recursive: true });

        // 4.3) Compute where extraResource dropped your binaries/
        const platformKey = platform === 'darwin' ? 'macos' : platform;
        const binFolder = path.join(
          resourcesRoot,
          'binaries',
          `${platformKey}-${arch}`
        );

        if (!fs.existsSync(binFolder)) {
          throw new Error(`Binary directory not found: ${binFolder}`);
        }

        // 4.4) Pick the PyInstaller output (diffuser or diffuser.exe)
        const entries = fs.readdirSync(binFolder);
        if (entries.length === 0) {
          throw new Error(`No binaries found in: ${binFolder}`);
        }
        const exeName = entries[0];
        const srcPath = path.join(binFolder, exeName);

        // 4.5) Copy into server/python-binary
        const destPath = path.join(serverDir, 'python-binary');
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${exeName} → ${destPath}`);
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
    { name: '@electron-forge/maker-deb', config: { bin: appName } },
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
          { entry: 'src/main.js',    config: 'vite.main.config.ts'   },
          { entry: 'src/preload.js', config: 'vite.preload.config.ts' }
        ],
        renderer: [ { name: 'main_window', config: 'vite.renderer.config.ts' } ]
      }
    }
  ]
};
