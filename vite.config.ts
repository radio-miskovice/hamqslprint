import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["node:fs/promises", "pdf-lib", "@pdf-lib/fontkit", "yaml"]
    },
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "hamqslprint"
    }
  },
  test: {
    include: ["src/**/*.test.ts"]
  }
});
