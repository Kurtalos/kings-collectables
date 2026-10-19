import "dotenv/config";


// Reads DATABASE_URL from .env so the same command works on any machine.
// Falls back to the local development database when the variable is unset.
// A plain configuration object is supported by Drizzle Kit; no runtime helper is needed.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
};
