import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
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
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}); 
