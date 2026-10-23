import './scripts/load-protocol-config.mjs';
import { privateStorageBuildGuard } from './scripts/private-storage-build-guard.mjs';
import { defineConfig } from "vite";
import VuePlugin from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    privateStorageBuildGuard(),
    VuePlugin(),
    tsconfigPaths(),
    nodePolyfills({
      // Polyfill stream + crypto for ethers.js and Web3 browser compat
      include: ['stream', 'crypto', 'buffer', 'process', 'util'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  base: './', // Required for Electron file:// protocol
  optimizeDeps: {
    include: [
      '@reown/appkit',
      '@reown/appkit-adapter-ethers',
      '@reown/appkit/vue',
      '@reown/appkit/networks',
      '@reown/appkit-scaffold-ui',
      '@reown/appkit-scaffold-ui/w3m-modal',
      '@reown/appkit-scaffold-ui/send',
      '@reown/appkit-scaffold-ui/receive',
      '@reown/appkit-scaffold-ui/embedded-wallet',
      '@reown/appkit-scaffold-ui/email',
      '@reown/appkit-scaffold-ui/socials',
      '@reown/appkit-scaffold-ui/swaps',
      '@reown/appkit-scaffold-ui/onramp',
      '@reown/appkit-scaffold-ui/transactions',
      '@reown/appkit-scaffold-ui/pay-with-exchange',
      '@reown/appkit-scaffold-ui/reown-authentication/data-capture',
      '@reown/appkit-pay',
    ],
  },
  build: {
    target: 'esnext',
    rollupOptions: { input: { main: 'index.html', companyRuntime: 'company-runtime.html', worker3d: 'worker-3d-runtime.html' } },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
