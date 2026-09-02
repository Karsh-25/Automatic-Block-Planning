import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // forwards /api/* calls to the FastAPI backend during dev
      // adjust the target port to match wherever the backend team runs uvicorn
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
