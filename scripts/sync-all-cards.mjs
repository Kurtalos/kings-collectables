import "dotenv/config";
import { Pool } from "pg";
import zlib from "zlib";
import https from "https";
import readline from "readline";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function getBulkUrl() {
  return new Promise((resolve, reject) => {
    https.get("https://api.scryfall.com/bulk-data", {
      headers: { "User-Agent": "KingsCollectables/1.0 (card database sync)", Accept: "application/json" }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const defaultCards = json.data?.find((d) => d.type === "default_cards");
          if (!defaultCards?.jsonl_download_uri) {
            return reject(new Error("Could not find default_cards download URI in Scryfall bulk data."));
          }
          resolve(defaultCards.jsonl_download_uri);
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

async function syncAllCards() {
  console.log("=== Kings Collectables: Complete MTG Card Database Sync ===");
  const client = await pool.connect();
  const start = Date.now();

  try {
    // Ensure pg_trgm and indexes exist
    console.log("Ensuring database indexes exist...");
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS products_name_lower_idx ON products (lower(name));
      CREATE INDEX IF NOT EXISTS products_set_code_idx ON products (set_code);
      CREATE INDEX IF NOT EXISTS products_quantity_idx ON products (quantity);
      CREATE INDEX IF NOT EXISTS products_in_stock_idx ON products ((quantity > 0));
      CREATE INDEX IF NOT EXISTS products_featured_idx ON products (featured);
    `);

    console.log("Fetching latest Scryfall bulk data URL...");
    const downloadUri = await getBulkUrl();
    console.log(`Downloading stream from: ${downloadUri}`);

    let count = 0;
    let inserted = 0;
    let batch = [];

    await new Promise((resolve, reject) => {
      https.get(downloadUri, {
        headers: { "User-Agent": "KingsCollectables/1.0 (card database sync)" }
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Scryfall CDN returned status ${res.statusCode}`));
        }

        const gunzip = zlib.createGunzip();
        res.pipe(gunzip);
        const rl = readline.createInterface({ input: gunzip });

        rl.on("line", async (line) => {
          try {
            const c = JSON.parse(line);
            // Skip digital cards or tokens without valid printings/scans
            if (c.digital || (!c.image_uris && !c.card_faces?.[0]?.image_uris)) return;

            const img = c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal;
            const art = c.image_uris?.art_crop || c.card_faces?.[0]?.image_uris?.art_crop;
            if (!img || !art) return;

            count++;
            const usd = parseFloat(c.prices?.usd || c.prices?.usd_foil || "0.5");
            const estimatedAudPrice = Math.max(50, Math.round(usd * 1.5 * 100));

            batch.push({
              scryfallId: c.id,
              name: c.name,
              setName: c.set_name,
              setCode: c.set,
              collectorNumber: c.collector_number,
              imageUrl: img,
              artUrl: art,
              rarity: c.rarity,
              colors: JSON.stringify(c.colors || c.card_faces?.[0]?.colors || []),
              typeLine: c.type_line || "",
              manaCost: c.mana_cost || "",
              oracleText: c.oracle_text || c.card_faces?.[0]?.oracle_text || "",
              condition: "Near mint",
              finish: (c.finishes && !c.finishes.includes("nonfoil") && c.finishes.includes("foil")) ? "Foil" : "Non-foil",
              price: estimatedAudPrice,
              quantity: 0
            });

            if (batch.length >= 2500) {
              rl.pause();
              const toInsert = [...batch];
              batch = [];

              const values = [];
              const params = [];
              let pIdx = 1;
              for (const item of toInsert) {
                values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::jsonb, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                params.push(
                  item.scryfallId, item.name, item.setName, item.setCode, item.collectorNumber,
                  item.imageUrl, item.artUrl, item.rarity, item.colors, item.typeLine,
                  item.manaCost, item.oracleText, item.condition, item.finish, item.price, item.quantity
                );
              }

              const query = `
                INSERT INTO products (
                  scryfall_id, name, set_name, set_code, collector_number, image_url, art_url,
                  rarity, colors, type_line, mana_cost, oracle_text, condition, finish, price, quantity
                ) VALUES ${values.join(", ")}
                ON CONFLICT (scryfall_id, condition, finish) DO NOTHING;
              `;

              await client.query(query, params);
              inserted += toInsert.length;
              if (inserted % 15000 === 0) {
                const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                console.log(`Synced ${inserted} printings (${elapsed}s elapsed)...`);
              }
              rl.resume();
            }
          } catch (err) {
            console.error("Line parse error:", err.message);
          }
        });

        rl.on("close", async () => {
          if (batch.length > 0) {
            const values = [];
            const params = [];
            let pIdx = 1;
            for (const item of batch) {
              values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}::jsonb, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
              params.push(
                item.scryfallId, item.name, item.setName, item.setCode, item.collectorNumber,
                item.imageUrl, item.artUrl, item.rarity, item.colors, item.typeLine,
                item.manaCost, item.oracleText, item.condition, item.finish, item.price, item.quantity
              );
            }
            const query = `
              INSERT INTO products (
                scryfall_id, name, set_name, set_code, collector_number, image_url, art_url,
                rarity, colors, type_line, mana_cost, oracle_text, condition, finish, price, quantity
              ) VALUES ${values.join(", ")}
              ON CONFLICT (scryfall_id, condition, finish) DO NOTHING;
            `;
            await client.query(query, params);
            inserted += batch.length;
          }
          resolve(inserted);
        });

        res.on("error", reject);
        gunzip.on("error", reject);
      }).on("error", reject);
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const statsRes = await client.query(`
      SELECT 
        count(*) as total_cards,
        count(*) FILTER (WHERE quantity > 0) as in_stock,
        count(*) FILTER (WHERE quantity = 0) as out_of_stock,
        pg_size_pretty(pg_total_relation_size('products')) as table_size
      FROM products;
    `);

    console.log("=== Sync Complete! ===");
    console.log(`Total time: ${elapsed} seconds.`);
    console.log("Database Stats:", statsRes.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

syncAllCards().catch(err => {
  console.error("Sync failed:", err);
  process.exit(1);
});
