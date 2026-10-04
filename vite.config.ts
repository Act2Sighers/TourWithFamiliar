import { defineConfig } from "vitest/config";

export default defineConfig({
  // 静的ホスティング(サブパス配下でも動くように相対パス)
  base: "./",
  server: { host: true },
  test: { include: ["tests/**/*.test.ts"] },
});
