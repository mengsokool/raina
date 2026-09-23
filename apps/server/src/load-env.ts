import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Side-effect module: must be the FIRST import in every server entry point
// (index.ts, worker.ts, rlp-gateway.ts). ESM hoists all imports, so calling
// dotenv.config() as inline code runs AFTER `new PrismaClient()` inside
// @raina/db — by then Prisma has already baked DATABASE_URL from its own
// packages/db/.env fallback. Importing this module first guarantees
// process.env is populated before PrismaClient is constructed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../.env"),
  ],
});
