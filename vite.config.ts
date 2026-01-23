import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Set base to '/' for root deployment or '/chess/' for subdirectory
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5173 }
});
