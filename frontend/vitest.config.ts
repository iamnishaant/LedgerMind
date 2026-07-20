import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node", // pure-function tests only — no DOM needed
    include: ["src/**/*.test.ts"],
  },
});
