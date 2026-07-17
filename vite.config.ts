import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/portal": {
        target: "https://anle.toaan.gov.vn/webcenter",
        changeOrigin: true,
        secure: false,
        headers: {
          "User-Agent": "curl/8.7.1",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        rewrite: (path) => path.replace(/^\/api\/portal/, "/portal")
      },
      "/api/precedent-pdf": {
        target: "https://anle.toaan.gov.vn",
        changeOrigin: true,
        secure: false,
        headers: {
          "User-Agent": "curl/8.7.1",
          Accept: "application/pdf,*/*;q=0.8"
        },
        rewrite: (path) => path.replace(/^\/api\/precedent-pdf/, "")
      }
    }
  }
});
