import react from "@vitejs/plugin-react";
import * as dotenv from "dotenv";
import { defineConfig, loadEnv } from "vite";
// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  dotenv.config({ path: "./.env.local" });
  dotenv.config();
  return {
    plugins: [react()],
    base: env.BASE_URL,
    server: {
      open: env.BASE_URL,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
