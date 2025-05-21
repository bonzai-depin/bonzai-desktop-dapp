import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "node-llama-cpp",
        "ps-tree",
        /^.*\/lib\/python\/.*$/,
      ],
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "src/server/diffuser.py"),
          dest: "", // Copies to the root of the `.vite/build` directory
        },
      ],
    }),
  ],
  resolve: {
    // Some libs that can run in both Web and Node.js, such as `axios`, we need
    // to tell Vite to build them in Node.js.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
