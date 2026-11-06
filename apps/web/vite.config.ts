import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL("../..", import.meta.url)),
    "",
  );
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${env.API_PORT || 3000}`,
          rewrite: (path) => path.replace(/^\/api/, ""),
          // Stands in for Tailscale Serve, which adds this header in production.
          headers: {
            "Tailscale-User-Login": env.ALLOWED_TAILSCALE_LOGIN ?? "",
          },
        },
      },
    },
    test: { environment: "jsdom" },
  };
});
