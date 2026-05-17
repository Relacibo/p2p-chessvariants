import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import * as dotenv from "dotenv";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  dotenv.config({ path: "./.env.local" });
  dotenv.config();
  return {
    plugins: [react(), wasm(), topLevelAwait()],
    base: env.BASE_URL,
    build: {
      target: "esnext",
    },
    define: {
      global: "globalThis",
    },
    server: {
      open: env.BASE_URL,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: false,
          ws: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
