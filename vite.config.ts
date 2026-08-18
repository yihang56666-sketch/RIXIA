import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/bili-api": {
        target: "https://api.bilibili.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-api/, ""),
      },
      "/bili-suggest": {
        target: "https://s.search.bilibili.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-suggest/, ""),
      },
      "/bili-comment": {
        target: "https://comment.bilibili.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-comment/, ""),
      },
      "/bili-passport": {
        target: "https://passport.bilibili.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bili-passport/, ""),
      },
    },
  },
  test: {
    environment: "node",
  },
});
