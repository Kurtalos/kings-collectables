import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { request, chromium } from "@playwright/test";
import chromiumBinary from "@sparticuz/chromium";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseCSV } from "../src/lib/csv";
type TestResponse = {
  summary: { invalid: number };
  importId: string;
  variants: { quantity: number; lotCount: number }[];
  lots: { unitCost: number | null; acquiredQuantity: number }[];
  sources: { type: string; remaining: string; acquired: string }[];
  hasMore: boolean;
};
async function main() {
  if (
    !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).pathname !== "/inventory_test"
  )
    throw new Error("Only isolated inventory_test is supported.");
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = await request.newContext({ baseURL: base });
  const guest = await request.newContext({ baseURL: base });
  let browser;
  const tag = randomUUID().slice(0, 8);
  const json = async (r: Awaited<ReturnType<typeof owner.get>>) => {
    const data = (await r.json()) as TestResponse;
    assert.ok(r.ok(), JSON.stringify(data));
    return data;
  };
  try {
    assert.equal((await guest.get("/api/orders/picklist")).status(), 401);
    assert.equal(
      (
        await guest.get("/api/inventory/history?productId=" + randomUUID())
      ).status(),
      401,
    );
    await json(
      await owner.post("/api/owner", {
        data: {
          password: process.env.TEST_ADMIN_PASSWORD || "inventory-test-only",
        },
      }),
    );
    const initialPacking = Number(
      (await pool.query("SELECT count(*) FROM orders WHERE status='Packing'"))
        .rows[0].count,
    );
    if (!initialPacking)
      assert.equal((await owner.get("/api/orders/picklist")).status(), 404);
    const ids: string[] = [];
    const name = `Sol Ring · ${tag}`;
    for (let index = 0; index < 6; index++) {
      const p = (
        await pool.query(
          `INSERT INTO products(scryfall_id,name,set_name,set_code,collector_number,image_url,art_url,rarity,type_line,condition,finish,price,quantity) VALUES($1,$2,$3,$4,$5,'/favicon.svg','/favicon.svg','uncommon','Artifact',$6,$7,500,0) RETURNING id`,
          [
            randomUUID(),
            name,
            ["Commander Masters", "Modern Horizons 3", "Commander Legends"][
              Math.floor(index / 2)
            ],
            ["cmm", "mh3", "cmr"][Math.floor(index / 2)],
            String(100 + index),
            index % 2 ? "Lightly played" : "Near mint",
            index % 2 ? "Foil" : "Non-foil",
          ],
        )
      ).rows[0];
      ids.push(p.id);
    }
    const receive = async (rows: unknown[]) => {
      const preview = await json(
        await owner.post("/api/inventory", {
          data: { action: "preview", rows },
        }),
      );
      assert.equal(preview.summary.invalid, 0);
      return json(
        await owner.post("/api/inventory", {
          data: { action: "commit", importId: preview.importId },
        }),
      );
    };
    await receive(
      ids.map((id, i) => ({
        productId: id,
        quantity: i + 1,
        condition: i % 2 ? "Lightly played" : "Near mint",
        finish: i % 2 ? "Foil" : "Non-foil",
        unit_cost_aud: (i * 0.5).toFixed(2),
        acquisition_type: "Purchase",
        supplier: "Local collection",
        reference: `BUY-${tag}`,
        date: "2026-10-18",
      })),
    );
    await receive([
      {
        productId: ids[0],
        quantity: 2,
        unit_cost_aud: "",
        acquisition_type: "Pack opening",
        note: "Opened collector boosters",
        date: "2026-10-19",
      },
    ]);
    await pool.query(
      "UPDATE inventory_lots SET remaining_quantity=0 WHERE product_id=$1",
      [ids[5]],
    );
    await pool.query("UPDATE products SET quantity=0 WHERE id=$1", [ids[5]]);
    const history = await json(
      await owner.get("/api/inventory/history?productId=" + ids[0]),
    );
    assert.equal(history.variants.length, 6);
    const exactHistory = await json(
      await owner.get(
        "/api/inventory/history?productId=" + ids[0] + "&scope=variant",
      ),
    );
    assert.equal(exactHistory.variants.length, 1);
    assert.equal(exactHistory.lots.length, 2);
    assert.equal(
      (
        await owner.get(
          "/api/inventory/history?productId=" + ids[0] + "&scope=invalid",
        )
      ).status(),
      400,
    );
    assert.equal(history.lots.length, 7);
    assert.equal(
      Number(
        history.sources.find((s: { type: string }) => s.type === "Pack opening")
          ?.remaining,
      ),
      2,
    );
    assert.equal(
      Number(
        history.sources.find((s: { type: string }) => s.type === "Purchase")
          ?.acquired,
      ),
      21,
    );
    assert.ok(
      history.lots.some((l: { unitCost: number | null }) => l.unitCost === 0),
    );
    assert.ok(
      history.lots.some(
        (l: { unitCost: number | null }) => l.unitCost === null,
      ),
    );
    assert.ok(
      history.variants.some(
        (v: { quantity: number; lotCount: number }) =>
          v.quantity === 0 && v.lotCount > 0,
      ),
    );
    assert.equal(
      (
        await owner.get(
          "/api/inventory/history?productId=" + ids[0] + "&page=-1",
        )
      ).status(),
      400,
    );
    const pagination = (
      await pool.query(
        `INSERT INTO products(scryfall_id,name,set_name,set_code,collector_number,image_url,art_url,rarity,type_line,price,quantity) VALUES($1,$2,'Pagination Test','pag','1','/favicon.svg','/favicon.svg','common','Artifact',100,101) RETURNING id`,
        [randomUUID(), `History pagination ${tag}`],
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO inventory_lots(product_id,acquired_quantity,remaining_quantity,unit_cost,acquisition_type) SELECT $1,1,1,100,'Purchase' FROM generate_series(1,101)`,
      [pagination],
    );
    const historyPage1 = await json(
      await owner.get("/api/inventory/history?productId=" + pagination),
    );
    const historyPage2 = await json(
      await owner.get(
        "/api/inventory/history?productId=" + pagination + "&page=1",
      ),
    );
    assert.equal(historyPage1.lots.length, 100);
    assert.equal(historyPage1.hasMore, true);
    assert.equal(historyPage2.lots.length, 1);
    assert.equal(historyPage2.hasMore, false);
    // More than the dashboard's 200-order display cap: export must query all Packing orders.
    const orderIds: string[] = [];
    for (let i = 0; i < 210; i++) {
      const order = (
        await pool.query(
          `INSERT INTO orders(order_number,customer_name,email,shipping_address,status,subtotal,shipping,total) VALUES($1,'Picklist Tester','test@example.invalid','Collected','Packing',500,0,500) RETURNING id`,
          [`PICK-${tag}-${String(i).padStart(3, "0")}`],
        )
      ).rows[0];
      orderIds.push(order.id);
      await pool.query(
        `INSERT INTO order_items(order_id,product_id,card_name,variant,quantity,unit_price,cost_basis) VALUES($1,$2,$3,'CMM · Near mint · Non-foil',1,500,100)`,
        [order.id, ids[0], name],
      );
    }
    await pool.query(
      `INSERT INTO order_items(order_id,product_id,card_name,variant,quantity,unit_price) VALUES($1,$2,$3,'CMM · Lightly played · Foil',2,500)`,
      [orderIds[0], ids[1], name],
    );
    const excluded = (
      await pool.query(
        `INSERT INTO orders(order_number,customer_name,email,shipping_address,status,subtotal,shipping,total) VALUES($1,'Not packing','no@example.invalid','Collected','Paid',500,0,500) RETURNING id`,
        [`NO-PICK-${tag}`],
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO order_items(order_id,product_id,card_name,variant,quantity,unit_price) VALUES($1,$2,$3,'Not packing',99,500)`,
      [excluded, ids[0], name],
    );
    const stockBefore = await pool.query(
      "SELECT quantity FROM products WHERE id=$1",
      [ids[0]],
    );
    const pdf = await owner.get("/api/orders/picklist");
    assert.equal(pdf.status(), 200);
    assert.match(pdf.headers()["content-type"], /application\/pdf/);
    assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
    const exported = await owner.get("/api/orders/picklist?format=csv");
    assert.equal(exported.status(), 200);
    assert.equal(
      Number(exported.headers()["x-picklist-orders"]),
      initialPacking + 210,
    );
    assert.match(exported.headers()["content-disposition"], /attachment/);
    const csv = await exported.text(),
      parsed = parseCSV(
        [
          csv.split("\r\n")[0],
          ...csv
            .split("\r\n")
            .slice(1)
            .filter((row) => row.includes(name)),
        ].join("\r\n"),
      );
    assert.ok(!csv.includes("cost_basis"));
    assert.ok(!csv.includes(`NO-PICK-${tag}`));
    assert.equal(
      parsed.rows.filter((r) => r[0] === "ORDER BREAKDOWN" && r[1] === name)
        .length,
      211,
    );
    assert.equal(
      parsed.rows.find(
        (r) =>
          r[0] === "COMBINED PICKING TOTAL" &&
          r[1] === name &&
          r[5] === "Non-foil",
      )?.[7],
      "210",
    );
    assert.ok(csv.includes(`PICK-${tag}-209`));
    assert.equal(
      (await pool.query("SELECT quantity FROM products WHERE id=$1", [ids[0]]))
        .rows[0].quantity,
      stockBefore.rows[0].quantity,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM orders WHERE status='Packing' AND order_number LIKE $1",
          [`PICK-${tag}-%`],
        )
      ).rows[0].count,
      "210",
    );
    console.log(
      "PASS API: private cross-printing history (six variants, seven lots), sold-out lots, unknown vs zero costs, 100-lot pagination; complete Packing-only export beyond 200 orders; distinct variants; export is read-only.",
    );
    await mkdir("artifacts/chromium-libs", { recursive: true });
    await writeFile(
      "artifacts/al2023.tar",
      brotliDecompressSync(
        await readFile("node_modules/@sparticuz/chromium/bin/al2023.tar.br"),
      ),
    );
    execFileSync("tar", [
      "-xf",
      "artifacts/al2023.tar",
      "-C",
      "artifacts/chromium-libs",
    ]);
    browser = await chromium.launch({
      executablePath: await chromiumBinary.executablePath(),
      args: chromiumBinary.args,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${resolve("artifacts/chromium-libs/lib")}:${process.env.LD_LIBRARY_PATH || ""}`,
      },
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
    });
    await context.addCookies((await owner.storageState()).cookies);
    const page = await context.newPage();
    const errors: string[] = [];
    const catalogueRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/inventory?")) catalogueRequests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/admin", { waitUntil: "networkidle" });
    await page.getByLabel("Search inventory", { exact: true }).fill(name);
    await page
      .locator(".inventory-name")
      .filter({ hasText: name })
      .filter({ hasText: "#100" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .locator(".history-metrics")
      .getByText("6", { exact: true })
      .waitFor();
    await dialog
      .getByRole("heading", { name: "Printings & acquisition receipts" })
      .waitFor();
    await dialog
      .locator(".history-receipts")
      .getByText("Pack opening", { exact: true })
      .waitFor();
    await page.screenshot({
      path: "artifacts/acquisition-history-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/acquisition-history-mobile.png",
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await page.setViewportSize({ width: 1600, height: 1100 });
    const editRow = page.locator(".inventory-table tbody tr").filter({
      has: page
        .locator(".inventory-name")
        .filter({ hasText: name })
        .filter({ hasText: "#100" }),
    });
    await editRow
      .getByRole("button", { name: `Edit ${name}`, exact: true })
      .click();
    const costs = page.locator(".card-paid-panel");
    await costs.getByRole("cell", { name: "$0.00", exact: true }).waitFor();
    await costs.getByRole("cell", { name: "Unknown", exact: true }).waitFor();
    assert.equal(
      await costs.getByRole("cell", { name: "$2.50", exact: true }).count(),
      0,
      "Other variants must not leak into the selected cost panel",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();

    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await page.getByRole("button", { name: "Picklist generator", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Picklist PDF", exact: true })
      .click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /kings-picklist/);
    assert.equal(await download.failure(), null);
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page
      .getByRole("button", { name: "Receive stock", exact: true })
      .first()
      .click();

    await page
      .getByRole("heading", {
        name: "Which cards are you receiving?",
        exact: true,
      })
      .waitFor();
    await page.waitForTimeout(400);
    assert.equal(
      catalogueRequests.length,
      0,
      "Opening intake must not fetch the catalogue",
    );
    assert.equal(await page.locator(".receive-search table").count(), 0);
    assert.equal(await page.locator(".receive-receipt").count(), 0);
    await page.screenshot({
      path: "artifacts/receive-stock-search-first.png",
      fullPage: true,
    });
    await page.getByLabel("Search the complete catalogue").fill(name);
    await page
      .getByRole("button", { name: "Add stock", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Add stock", exact: true })
      .nth(1)
      .click();
    assert.equal(await page.locator(".receive-line").count(), 2);
    await page.getByLabel("Search the complete catalogue").fill("");
    await page
      .getByRole("heading", {
        name: "Which cards are you receiving?",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".receive-search table").count(), 0);
    assert.equal(
      await page.locator(".receive-line").count(),
      2,
      "Clearing search must preserve receipt",
    );
    await page.getByLabel("Search the complete catalogue").fill(name);
    await page
      .getByLabel("Default cost for new cards (AUD)", { exact: true })
      .fill("1.25");
    await page
      .getByRole("button", {
        name: "Apply default cost to blank receipt lines",
        exact: true,
      })
      .click();
    assert.equal(
      await page
        .locator(".receive-line")
        .first()
        .getByLabel("Unit cost AUD", { exact: true })
        .inputValue(),
      "1.25",
    );
    await page
      .locator(".receive-line")
      .nth(1)
      .getByLabel("Unit cost AUD", { exact: true })
      .fill("");

    await page
      .locator(".receive-line")
      .first()
      .getByLabel("Quantity", { exact: true })
      .fill("2");
    await page
      .locator(".receive-line")
      .first()
      .getByLabel("Unit cost AUD", { exact: true })
      .fill("1.25");
    await page
      .locator(".receive-line")
      .nth(1)
      .getByLabel("Source", { exact: true })
      .selectOption("Pack opening");
    assert.equal(await page.locator(".receive-csv").getAttribute("open"), null);
    await page.screenshot({
      path: "artifacts/receive-stock-clean-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/receive-stock-clean-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "No mobile page overflow",
    );
    await page
      .getByRole("button", { name: "Review receipt", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Review receipt", exact: true })
      .waitFor();
    await page
      .locator(".receive-preview-table")
      .getByRole("cell", { name: "$1.25", exact: true })
      .waitFor();
    assert.ok(
      (await page
        .locator(".receive-preview-table")
        .getByRole("cell", { name: "Unknown", exact: true })
        .count()) > 0,
    );
    await page.getByRole("button", { name: "Confirm and add stock" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Stock received" })
      .waitFor();
    const received = await json(
      await owner.get("/api/inventory/history?productId=" + ids[0]),
    );
    assert.ok(
      received.lots.some(
        (l: { unitCost: number | null; acquiredQuantity: number }) =>
          l.unitCost === 125 && l.acquiredQuantity === 2,
      ),
    );

    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole("button", { name: /^Card inventory/ })
      .first()
      .click();
    await page.getByLabel("Search inventory", { exact: true }).fill(name);
    await editRow
      .getByRole("button", { name: `Edit ${name}`, exact: true })
      .click();
    await costs.getByRole("cell", { name: "$1.25", exact: true }).waitFor();
    await page.screenshot({
      path: "artifacts/card-editor-acquisition-costs.png",
      animations: "disabled",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/card-editor-acquisition-costs-mobile.png",
      animations: "disabled",
      fullPage: true,
    });
    await costs
      .getByRole("button", { name: "All versions & receipts →", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Printings & acquisition receipts" })
      .waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      "PASS Chromium: search-first intake makes no blank catalogue requests; clearing search preserves receipt; explicit default-cost application and per-line review; saved $1.25 cost visible in editor alongside known-zero and unknown costs; exact-variant isolation; history shortcut; PDF picklist; desktop/mobile screenshots and no page errors.",
    );
  } finally {
    await browser?.close();
    await owner.dispose();
    await guest.dispose();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
