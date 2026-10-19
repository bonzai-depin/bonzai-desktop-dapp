import './scripts/load-protocol-config.mjs';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    emptyOutDir: false,
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        entryFileNames: 'preload.js',
        format: 'cjs',
      },
    },
    lib: {
      entry: resolve(__dirname, 'src/preload.js'),
      formats: ['cjs'],
    },
  },
  resolve: {
    browserField: false,
    conditions: ['node'],
  },
});
