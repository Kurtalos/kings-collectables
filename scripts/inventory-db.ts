import "dotenv/config";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not configured; no database audit or migration performed.",
    );
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (process.argv.includes("--migrate")) {
      await pool.query(
        readFileSync("scripts/migrations/001-inventory.sql", "utf8"),
      );
      console.log("Inventory migration completed.");
    }
    const columns = await pool.query(
      "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name='products' AND column_name IN ('quantity','total_cost')) OR (table_name='order_items' AND column_name IN ('cost_basis','legacy_cost_basis'))) ORDER BY 1,2",
    );
    const indexes = await pool.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='products'",
    );
    console.log(
      JSON.stringify({ columns: columns.rows, indexes: indexes.rows }, null, 2),
    );
  } catch {
    console.error(
      "Database audit/migration failed. Inspect database access and schema locally; connection details have been withheld.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
void main();
