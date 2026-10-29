import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  define: { __MOCK_LLM__: JSON.stringify(process.env.MOCK_LLM === "1") },
  worker: { format: "es" },
  build: { target: "es2022" },
});
