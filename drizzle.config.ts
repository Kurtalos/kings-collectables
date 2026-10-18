import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env so the same command works on any machine.
// Falls back to the local development database when the variable is unset.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
