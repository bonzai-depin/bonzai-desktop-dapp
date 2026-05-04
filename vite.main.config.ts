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
        // Ship the .sql migrations alongside the bundled main.js so
        // src/main/db/migrate.js can read them at runtime. The runner
        // resolves them via __dirname which, post-bundle, points at
        // .vite/build/.
        {
          src: resolve(__dirname, "src/main/db/migrations") + "/*.sql",
          dest: "migrations",
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
