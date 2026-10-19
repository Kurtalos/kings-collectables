import { chromium, request } from "@playwright/test";
import chromiumBinary from "@sparticuz/chromium";
import { Pool } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const database = process.env.DATABASE_URL;
if (!database?.includes("/inventory_test"))
  throw new Error("Only isolated inventory_test database is supported.");
const pool = new Pool({ connectionString: database });
const api = await request.newContext({ baseURL: base });
const publicAPI = await request.newContext({ baseURL: base });
let browser;
const errors = [];
try {
  const denied = await publicAPI.get("/api/inventory");
  assert.equal(denied.status(), 401);
  assert.equal(
    (
      await publicAPI.post("/api/inventory", {
        data: { action: "preview", rows: [] },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await api.post("/api/owner", {
        data: {
          password: process.env.TEST_ADMIN_PASSWORD || "inventory-test-only",
        },
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await api.post("/api/inventory", {
        headers: { origin: "https://evil.example.invalid" },
        data: { action: "preview", rows: [] },
      })
    ).status(),
    400,
  );
  const json = async (response) => {
    const data = await response.json();
    assert.ok(response.ok(), JSON.stringify(data));
    return data;
  };
  const tag = randomUUID().slice(0, 8);
  const product = await pool.query(
    `INSERT INTO products (scryfall_id,name,set_name,set_code,collector_number,image_url,art_url,rarity,type_line,price,quantity) VALUES ($1,$2,'API Test','api',$3,'/test.png','/test.png','common','Creature',1000,0) RETURNING *`,
    [randomUUID(), `API Card ${tag}`, tag],
  );
  const card = product.rows[0];
  const receive = async (rows, trade) => {
    const preview = await json(
      await api.post("/api/inventory", {
        data: { action: "preview", rows, trade },
      }),
    );
    const result = await json(
      await api.post("/api/inventory", {
        data: { action: "commit", importId: preview.importId },
      }),
    );
    return { preview, result };
  };
  const first = await receive([
    { productId: card.id, quantity: "2", unit_cost_aud: "1.00" },
  ]);
  assert.equal(first.preview.summary.existing, 1);
  await json(
    await api.post("/api/inventory", {
      data: { action: "commit", importId: first.preview.importId },
    }),
  );
  await receive([{ productId: card.id, quantity: "3", unit_cost_aud: "2.50" }]);
  const saleKey = randomUUID();
  const sale = await json(
    await api.post("/api/pos", {
      data: {
        action: "sale",
        requestKey: saleKey,
        lines: [{ productId: card.id, quantity: 3, unitPrice: 999 }],
        payments: [{ method: "Cash", amount: 2997 }],
      },
    }),
  );
  assert.equal(sale.sale.items[0].costBasis, 450);
  assert.equal(
    (
      await api.post("/api/pos", {
        data: {
          action: "sale",
          requestKey: saleKey,
          lines: [{ productId: card.id, quantity: 3 }],
          payments: [{ method: "Cash", amount: 3000 }],
        },
      })
    ).status(),
    400,
  );
  await json(
    await api.post("/api/pos", {
      data: { action: "refund", orderId: sale.sale.id },
    }),
  );
  assert.equal(
    (
      await api.post("/api/pos", {
        data: { action: "refund", orderId: sale.sale.id },
      })
    ).status(),
    400,
  );
  let stock = await pool.query(
    "SELECT quantity,price FROM products WHERE id=$1",
    [card.id],
  );
  assert.equal(stock.rows[0].quantity, 5);
  assert.equal(stock.rows[0].price, 1000);
  // CSV-style mapped exact printing matching, per-row errors, duplicates and variant creation.
  const bulk = await receive([
    {
      scryfall_id: card.scryfall_id,
      quantity: "1",
      unit_cost_aud: "",
      acquisition_type: "Pack opening",
    },
    {
      set: "api",
      collector_number: tag,
      quantity: "2",
      unit_cost_aud: "0.75",
      acquisition_type: "Pack opening",
    },
    {
      scryfall_id: card.scryfall_id,
      quantity: "1",
      unit_cost_aud: "0",
      condition: "Lightly played",
      finish: "Foil",
    },
    { name: "Invalid missing printing", quantity: "2" },
  ]);
  assert.equal(bulk.preview.summary.invalid, 1);
  assert.equal(bulk.preview.summary.duplicates, 1);
  assert.equal(bulk.preview.summary.unknownLines, 1);
  const customer = (
    await pool.query(
      "INSERT INTO customers(name,email,password_hash) VALUES ('API Trader',$1,'test-only') RETURNING *",
      [`${tag}@example.invalid`],
    )
  ).rows[0];
  const trade = await receive(
    [
      {
        productId: card.id,
        quantity: "2",
        unit_cost_aud: "1.50",
        acquisition_type: "Trade-in",
      },
    ],
    { customerId: customer.id, amount: 300 },
  );
  await json(
    await api.post("/api/inventory", {
      data: { action: "commit", importId: trade.preview.importId },
    }),
  );
  assert.equal(
    (
      await pool.query("SELECT credit_balance FROM customers WHERE id=$1", [
        customer.id,
      ])
    ).rows[0].credit_balance,
    300,
  );
  await json(
    await api.post("/api/pos", {
      data: {
        action: "sale",
        requestKey: randomUUID(),
        customerId: customer.id,
        lines: [{ productId: card.id, quantity: 1 }],
        tradeIns: [
          {
            receiptId: trade.result.receipt.id,
            productId: card.id,
            name: card.name,
            quantity: 2,
            amount: 300,
          },
        ],
        payments: [{ method: "Cash", amount: 1000 }],
      },
    }),
  );
  assert.equal(
    (
      await pool.query("SELECT credit_balance FROM customers WHERE id=$1", [
        customer.id,
      ])
    ).rows[0].credit_balance,
    300,
  );
  const tradeSale = await json(
    await api.post("/api/pos", {
      data: {
        action: "sale",
        requestKey: randomUUID(),
        customerId: customer.id,
        lines: [{ productId: card.id, quantity: 1 }],
        tradeIns: [
          { productId: card.id, name: card.name, quantity: 2, amount: 200 },
        ],
        payments: [{ method: "Cash", amount: 1000 }],
      },
    }),
  );
  assert.equal(tradeSale.sale.tradeTotal, 200);
  assert.equal(
    (
      await pool.query("SELECT credit_balance FROM customers WHERE id=$1", [
        customer.id,
      ])
    ).rows[0].credit_balance,
    500,
  );
  // Public checkout stores FIFO basis internally but never serializes cost publicly.
  const web = await json(
    await publicAPI.post("/api/orders", {
      data: {
        customerName: "Web Tester",
        email: "web@example.invalid",
        recipientName: "Web Tester",
        line1: "1 Test St",
        suburb: "Perth",
        state: "WA",
        postcode: "6000",
        items: [{ productId: card.id, quantity: 1 }],
      },
    }),
  );
  const webLines = await pool.query(
    "SELECT cost_basis FROM order_items WHERE order_id=$1",
    [web.order.id],
  );
  assert.notEqual(webLines.rows[0].cost_basis, null);
  const lookup = await json(
    await publicAPI.get(
      `/api/orders?email=web@example.invalid&orderNumber=${web.order.orderNumber}`,
    ),
  );
  assert.ok(!JSON.stringify(lookup).includes("costBasis"));
  const beforeCancel = (
    await pool.query("SELECT quantity FROM products WHERE id=$1", [card.id])
  ).rows[0].quantity;
  await json(
    await api.patch("/api/orders", {
      data: { id: web.order.id, status: "Cancelled" },
    }),
  );
  await json(
    await api.patch("/api/orders", {
      data: { id: web.order.id, status: "Cancelled" },
    }),
  );
  assert.equal(
    (await pool.query("SELECT quantity FROM products WHERE id=$1", [card.id]))
      .rows[0].quantity,
    beforeCancel + 1,
  );
  const publicCards = await json(
    await publicAPI.post("/api/cards/by-ids", { data: { ids: [card.id] } }),
  );
  assert.ok(!JSON.stringify(publicCards).includes("totalCost"));
  // Large catalogue: synthetic out-of-stock printings, not fetched from Scryfall.
  await pool.query(
    `INSERT INTO products(scryfall_id,name,set_name,set_code,collector_number,image_url,art_url,rarity,type_line,price,quantity) SELECT 'perf-'||g,'Performance Printing '||g,'Benchmark Set','perf',g::text,'/test.png','/test.png','common','Creature',100,0 FROM generate_series(1,110000) g ON CONFLICT DO NOTHING`,
  );
  await pool.query("ANALYZE products");
  const start = performance.now();
  const search = await json(
    await api.get("/api/inventory?q=Performance%20Printing%201000&page=0"),
  );
  const elapsed = performance.now() - start;
  assert.ok(search.cards.length <= 30);
  assert.ok(search.cards.length > 0);
  console.log(
    `PASS API: authorization, receive existing zero stock, repeated-confirmation idempotency, FIFO POS, price override independence, exact one-time refund, CSV preview/valid subset/duplicates/new variant, trade credit and stock, web FIFO and cancellation, public cost redaction. Catalogue search: ${elapsed.toFixed(0)}ms with 110,000 synthetic printings; ${search.cards.length} returned.`,
  );
  await mkdir("artifacts/chromium-libs", { recursive: true });
  if (process.platform === "linux") {
    writeFileSync(
      "artifacts/al2023.tar",
      brotliDecompressSync(
        readFileSync("node_modules/@sparticuz/chromium/bin/al2023.tar.br"),
      ),
    );
    execFileSync("tar", [
      "-xf",
      "artifacts/al2023.tar",
      "-C",
      "artifacts/chromium-libs",
    ]);
  }
  browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      (await chromiumBinary.executablePath()),
    args: chromiumBinary.args,
    headless: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${resolve("artifacts/chromium-libs/lib")}:${process.env.LD_LIBRARY_PATH || ""}`,
    },
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addCookies((await api.storageState()).cookies);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/admin", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Receive stock", exact: true })
    .waitFor();
  await page.getByLabel("Search the complete catalogue").fill(card.name);
  await page
    .getByRole("button", { name: "Add stock", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Add stock", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Review receipt", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review receipt", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Confirm and add stock" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Stock received" })
    .waitFor();
  await page.getByText("Bulk collection / CSV intake", { exact: true }).click();
  await page
    .getByLabel("Or paste a CSV list")
    .fill(
      `name,scryfall_id,quantity,unit_cost_aud,note\n"${card.name}",${card.scryfall_id},2,0.55,"A quoted, note"\nBad card,,1,,Invalid`,
    );
  await page.getByRole("button", { name: "Read pasted list" }).click();
  await page.getByRole("button", { name: "Preview CSV intake" }).click();
  await page.getByText(/1 invalid rows/).waitFor();
  await page.getByRole("button", { name: "Confirm and add stock" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Stock received" })
    .waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/inventory-receiving.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/inventory-receiving-mobile.png",
    fullPage: true,
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS browser: owner intake screen, server search, add/review/confirm receipt, CSV paste/mapping/preview/partial-valid confirmation; desktop and mobile screenshots; no page errors.",
  );
} finally {
  await browser?.close();
  await api.dispose();
  await publicAPI.dispose();
  await pool.end();
}
