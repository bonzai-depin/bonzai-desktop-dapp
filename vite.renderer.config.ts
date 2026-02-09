import { defineConfig } from "vite";
import VuePlugin from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [VuePlugin(), tsconfigPaths()],
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
