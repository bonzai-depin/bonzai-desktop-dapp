export default {
  buildIdentifier: "esm",
  defaultResolved: true,
  packagerConfig: {
    icon: "./src/assets/logo",
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      executableName: "BonzAI",
      config: {
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
      executableName: "BonzAI",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      executableName: "BonzAI",
      config: {},
    },
    {
      name: "@electron-forge/maker-squirrel",
      executableName: "BonzAI",
      config: {},
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "bonzai-depin",
          name: "bonzai-desktop-dappbonzai-desktop-dapp",
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
        // `build` can specify multiple entry builds, which can be Main
        // process, Preload scripts, Worker process, etc.  If you are familiar
        // with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the
            // corresponding file of `config`.
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
};
