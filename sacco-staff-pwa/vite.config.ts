import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local dev helper so the PWA can call the existing backend
      // without dealing with cross-origin/CORS. Any /u or /api calls
      // during `npm run dev` will be forwarded to the Node server.
      "/u": {
        target: "http://localhost:5001",
        changeOrigin: true
      },
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist"
  }
});

