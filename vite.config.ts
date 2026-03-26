import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/splitwise': {
        target: 'https://secure.splitwise.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/splitwise/, '/api/v3.0'),
        secure: false,
      },
      '/api/llm': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
