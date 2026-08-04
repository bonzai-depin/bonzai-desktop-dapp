import { defineConfig } from "vite";
import VuePlugin from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    VuePlugin(),
    tsconfigPaths(),
    nodePolyfills({
      // Polyfill stream + crypto for ethers.js and Web3 browser compat
      include: ['stream', 'crypto', 'buffer', 'process', 'util'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  base: './', // Required for Electron file:// protocol
  server: {
    // Pinned to the loopback IP (not "localhost", whose resolution can
    // vary with host DNS/hosts-file config) and a fixed, non-random port,
    // matching src/main/csp.js's DEV_VITE_HOST/DEV_VITE_PORT and
    // src/main.js's VITE_DEV_SERVER_URL — the development CSP grants this
    // one deterministic origin, so it must never float or fall back to a
    // different port (P12/R3).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      port: 5173,
    },
  },
  optimizeDeps: {
    include: [
      '@reown/appkit',
      '@reown/appkit-adapter-ethers',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
