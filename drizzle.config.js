/**
 * Drizzle Kit configuration for the BonzAI local data layer.
 *
 * The runtime DB lives at <userData>/bonzai.db (resolved at runtime in
 * src/main/db/connection.js). For schema generation + introspection
 * we point at a local-dev path; the user never invokes drizzle-kit
 * against their real DB.
 *
 * Usage:
 *   npm run db:generate   — diff schema against latest migration, write 000X_*.sql
 *   npm run db:studio     — open drizzle-studio on the dev DB
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('drizzle-kit').Config} */
export default {
  dialect: "sqlite",
  schema: path.join(__dirname, "src/main/db/schema/index.js"),
  out: path.join(__dirname, "src/main/db/migrations"),
  dbCredentials: {
    url: path.join(__dirname, ".dev/bonzai.dev.db"),
  },
  verbose: true,
  strict: true,
};
