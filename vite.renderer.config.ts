import { defineConfig } from "vite";
import VuePlugin from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [VuePlugin(), tsconfigPaths()],
});
