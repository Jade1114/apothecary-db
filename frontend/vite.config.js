import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/profile": "http://127.0.0.1:8000",
      "/ingest": "http://127.0.0.1:8000",
      "/documents": "http://127.0.0.1:8000",
      "/profiles": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
