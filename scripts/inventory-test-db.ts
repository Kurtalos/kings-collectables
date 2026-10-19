import EmbeddedPostgres from "embedded-postgres";
import { readFileSync } from "node:fs";
async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: "./artifacts/inventory-pg",
    user: "postgres",
    password: "local-test-only",
    port: 55432,
    persistent: true,
    createPostgresUser: process.getuid?.() === 0,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("inventory_test");
  const client = pg.getPgClient();
  await client.connect();
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  // The schema dump targets public and has no production data.
  const { Client } = await import("pg");
  const target = new Client({
    connectionString:
      "postgresql://postgres:local-test-only@127.0.0.1:55432/inventory_test",
  });
  await target.connect();
  await target.query(readFileSync("scripts/schema.sql", "utf8"));
  await target.query("SET search_path TO public");
  await target.query(
    readFileSync("scripts/migrations/001-inventory.sql", "utf8"),
  );
  for (const statement of readFileSync(
    "scripts/migrations/002-inventory-search.sql",
    "utf8",
  )
    .replace(/^--.*$/gm, "")
    .split(";"))
    if (statement.trim()) await target.query(statement);
  await target.end();
  await client.end();
  console.log(
    "Isolated PostgreSQL test database ready on port 55432. No production database used.",
  );
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await new Promise(() => {});
}
main().catch((error) => {
  console.error(error.message);
  console.error("Isolated test database setup failed.");
  process.exit(1);
});
