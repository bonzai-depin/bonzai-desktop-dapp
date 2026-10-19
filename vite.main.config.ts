import './scripts/load-protocol-config.mjs';
import { privateStorageBuildGuard } from './scripts/private-storage-build-guard.mjs';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';
import { mainRuntimeAssets } from "./scripts/main-runtime-assets.mjs";

// https://vitejs.dev/config
const oauthEnv = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'BONZAI_');
export default defineConfig({
  // Public desktop application IDs only. Account tokens and client secrets
  // are never compiled into the renderer or distributed as build constants.
  define: {
    __BONZAI_COMPANY_OAUTH_CLIENTS__: JSON.stringify({
      google: oauthEnv.BONZAI_GOOGLE_OAUTH_CLIENT_ID || '',
      microsoft: oauthEnv.BONZAI_MICROSOFT_OAUTH_CLIENT_ID || '',
    }),
  },
  build: {
    target: 'node18',
    ssr: true,
    emptyOutDir: false,
    rollupOptions: {
      external: [
        "electron",
        "ps-tree",
        // Native + extension-loading modules — must resolve at runtime
        // via Electron's require, not via Vite/Rollup bundling.
        "better-sqlite3",
        "sqlite-vec",
        // drizzle-orm is pure ESM but importing from node_modules at
        // runtime keeps the bundle small + avoids tree-shake surprises
        // around the better-sqlite3 driver path.
        /^drizzle-orm($|\/)/,
        /^.*\/lib\/python\/.*$/,
        // Externalize all Node.js built-ins
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
    },
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
  },
  plugins: [
    privateStorageBuildGuard(),
    mainRuntimeAssets(),
  ],
  resolve: {
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
