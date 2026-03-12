import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5001,
    proxy: {
      "/api": {
        target: "http://localhost:5002",
        changeOrigin: true,
      },
      "/embed": {
        target: "http://localhost:5002",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5002",
        ws: true,
      },
    },
  },
});
