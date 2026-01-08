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
    },
    lib: {
      entry: resolve(__dirname, 'src/preload.js'),
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
  },
  resolve: {
    browserField: false,
    conditions: ['node'],
  },
});
