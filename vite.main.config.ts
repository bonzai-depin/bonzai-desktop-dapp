import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    emptyOutDir: false,
    rollupOptions: {
      external: [
        "electron",
        "node-llama-cpp",
        "ps-tree",
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
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "src/server/diffuser.py"),
          dest: "",
        },
        {
          src: resolve(__dirname, "src/template.jinja"),
          dest: "",
        },
      ],
    }),
  ],
  resolve: {
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
