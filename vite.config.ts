import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import * as dotenv from "dotenv";
import { defineConfig, loadEnv } from "vite";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  dotenv.config({ path: "./.env.local" });
  dotenv.config();
  return {
    plugins: [
      react(),
      wasm(),
      topLevelAwait(),
      {
        name: "copy-variants",
        closeBundle() {
          const srcDir = resolve("variants");
          const destDir = resolve("dist", "variants");
          mkdirSync(destDir, { recursive: true });
          for (const f of readdirSync(srcDir)) {
            if (f.endsWith(".rhai")) {
              copyFileSync(resolve(srcDir, f), resolve(destDir, f));
            }
          }
        },
      },
    ],
    base: env.BASE_URL,
    build: {
      target: "esnext",
    },
    worker: {
      format: "es",
      plugins: () => [wasm(), topLevelAwait()],
    },
    define: {
      global: "globalThis",
    },
    server: {
      open: env.BASE_URL,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          secure: false,
          ws: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
