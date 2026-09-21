import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/worker.ts", "src/rlp-gateway.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "es2022",
  external: ["@prisma/client"],
  noExternal: ["@raina/workflow", "@raina/db"],
  clean: true,
});
