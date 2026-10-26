/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const previewHost = process.env.ZUNO_PREVIEW_HOST;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: previewHost ? [previewHost] : undefined,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        ws: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    emptyOutDir: true,
  },
});
