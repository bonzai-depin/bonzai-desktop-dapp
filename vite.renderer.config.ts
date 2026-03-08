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
      // Polyfill stream + crypto for @irys/web-upload browser compat
      include: ['stream', 'crypto', 'buffer', 'process', 'util'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  base: './', // Required for Electron file:// protocol
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
