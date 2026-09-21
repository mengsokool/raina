import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/worker.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "es2022",
  external: ["@prisma/client"],
  noExternal: ["@raina/workflow", "@raina/db"],
  clean: true,
});
