import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { chromium, request, expect } from "@playwright/test";
import chromiumBinary from "@sparticuz/chromium";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseCSV } from "../src/lib/csv";
import type { DemandData, SubscriberData } from "../src/lib/admin-insights";
async function main() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/inventory_test") throw new Error("Only isolated inventory_test is supported.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }), base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const owner = await request.newContext({ baseURL: base }), guest = await request.newContext({ baseURL: base });
  const tag = randomUUID().slice(0,8), term = `Demand ${tag}`, emailPrefix = `newsletter-${tag}`;
  const customerIds: string[] = [], productIds: string[] = [], emails = Array.from({ length: 30 }, (_,i) => `${emailPrefix}-${String(i).padStart(2,"0")}@example.invalid`); emails.push(`=${emailPrefix}@example.invalid`);
  let browser;
  const json = async <T,>(r: Awaited<ReturnType<typeof owner.get>>): Promise<T> => { const data = await r.json(); assert.ok(r.ok(), JSON.stringify(data)); return data as T; };
  try {
    for (const url of ["/api/inventory/demand", "/api/inventory/demand?format=csv", `/api/inventory/demand?productId=${randomUUID()}`, "/api/newsletter/subscribers", "/api/newsletter/subscribers?format=csv"]) assert.equal((await guest.get(url)).status(), 401);
    assert.equal((await guest.delete("/api/newsletter/subscribers", { data: { email: emails[0] } })).status(), 401);
    await json(await owner.post("/api/owner", { data: { password: process.env.TEST_ADMIN_PASSWORD || "inventory-test-only" } }));
    assert.equal((await owner.delete("/api/newsletter/subscribers", { headers: { origin: "https://evil.invalid" }, data: { email: emails[0] } })).status(), 400);
    for (const url of ["/api/inventory/demand?page=NaN", "/api/inventory/demand?stock=bad", "/api/inventory/demand?sort=bad", "/api/inventory/demand?productId=bad", "/api/newsletter/subscribers?page=-1", "/api/newsletter/subscribers?sort=bad"]) assert.equal((await owner.get(url)).status(), 400);
    const baseline = await json<SubscriberData>(await owner.get("/api/newsletter/subscribers"));
    for (let i=0;i<3;i++) {
      const row = (await pool.query("INSERT INTO customers(name,email,password_hash) VALUES($1,$2,'never-expose-this-hash') RETURNING id", [`Demand Customer ${i}`, i===0 ? emails[0] : `${tag}-no-marketing-${i}@example.invalid`])).rows[0]; customerIds.push(row.id);
    }
    const printing = randomUUID();
    for (let i=0;i<29;i++) {
      const row = (await pool.query("INSERT INTO products(scryfall_id,name,set_name,set_code,collector_number,image_url,art_url,rarity,type_line,condition,finish,price,quantity) VALUES($1,$2,'Demand Test','dmd',$3,'/favicon.svg','/favicon.svg','common','Artifact',$4,$5,500,$6) RETURNING id", [i<3 ? printing : randomUUID(), i<3 ? term : `${term} extra ${String(i).padStart(2,"0")}`, String(i+1), i===2 ? "Lightly played" : "Near mint", i===1 ? "Foil" : "Non-foil", 0])).rows[0]; productIds.push(row.id);
      const interested = i===0 ? 3 : i===1 ? 2 : 1;
      for (let j=0;j<interested;j++) await pool.query("INSERT INTO watchlists(customer_id,product_id,last_seen_quantity,last_seen_price,created_at) VALUES($1,$2,0,500,now()-interval '60 days'+$3*interval '1 day')", [customerIds[j], row.id, i]);
    }
    const initialStock = await json<{ importId: string }>(await owner.post("/api/inventory", { data: { action: "preview", rows: [{ productId: productIds[2], condition: "lp", finish: "nonfoil", quantity: 2, unit_cost_aud: "1.25", acquisition_type: "Purchase" }] } }));
    await json(await owner.post("/api/inventory", { data: { action: "commit", importId: initialStock.importId } }));
    const demandURL = `/api/inventory/demand?q=${encodeURIComponent(term)}`;
    const response = await owner.get(demandURL); assert.match(response.headers()["cache-control"], /private, no-store/);
    const demand = await json<DemandData>(response);
    assert.equal(demand.total, 28); assert.equal(demand.rows.length, 25); assert.equal(demand.stats.customers, 3); assert.equal(demand.stats.interests, 31);
    assert.equal(demand.rows[0].productId, productIds[0]); assert.equal(demand.rows[0].interested, 3); assert.equal(demand.rows[1].finish, "Foil");
    assert.equal((await json<DemandData>(await owner.get(demandURL+"&page=2"))).rows.length, 3);
    assert.equal((await json<DemandData>(await owner.get(demandURL+"&stock=all"))).total, 29);
    assert.equal((await json<DemandData>(await owner.get(demandURL+"&page=999"))).total, 28);
    const exportDemand = await owner.get(demandURL+"&format=csv"); assert.equal(parseCSV(await exportDemand.text()).rows.length, 28);
    assert.equal((await json<DemandData>(await owner.get(`/api/inventory/demand?q=${encodeURIComponent(term+"%")}`))).total, 0);
    const people = await json<{ rows: { email: string }[]; total: number }>(await owner.get(`/api/inventory/demand?productId=${productIds[0]}`)); assert.equal(people.total, 3); assert.equal(people.rows.length, 3); assert.ok(!JSON.stringify(people).includes("password"));
    for (const email of emails) await pool.query("INSERT INTO newsletter(email) VALUES($1)", [email]);
    const subscribers = await json<SubscriberData>(await owner.get(`/api/newsletter/subscribers?q=${tag}`)); assert.equal(subscribers.total, 31); assert.equal(subscribers.rows.length, 25); assert.equal(subscribers.stats.total, baseline.stats.total+31); assert.equal(subscribers.stats.withAccount, baseline.stats.withAccount+1);
    assert.equal((await json<SubscriberData>(await owner.get(`/api/newsletter/subscribers?q=${tag}&page=2`))).rows.length, 6);
    const exported = await owner.get(`/api/newsletter/subscribers?q=${tag}&format=csv`), csv = await exported.text(); assert.equal(parseCSV(csv).rows.length, 31); assert.ok(csv.includes(`'=${emailPrefix}`)); assert.ok(!csv.includes("password"));
    assert.ok(!subscribers.rows.some(row => row.email.includes("no-marketing")));
    assert.equal((await guest.post("/api/newsletter", { data: { email: emails[0] } })).status(), 200);
    assert.equal((await json<SubscriberData>(await owner.get(`/api/newsletter/subscribers?q=${tag}`))).total, 31);
    await mkdir("artifacts/chromium-libs", { recursive: true }); await writeFile("artifacts/al2023.tar", brotliDecompressSync(await readFile("node_modules/@sparticuz/chromium/bin/al2023.tar.br"))); execFileSync("tar", ["-xf", "artifacts/al2023.tar", "-C", "artifacts/chromium-libs"]);
    browser = await chromium.launch({ executablePath: await chromiumBinary.executablePath(), args: chromiumBinary.args, env: { ...process.env, LD_LIBRARY_PATH: `${resolve("artifacts/chromium-libs/lib")}:${process.env.LD_LIBRARY_PATH || ""}` }, headless: true });
    const context = await browser.newContext({ viewport: { width: 1550, height: 1100 } }); await context.addCookies((await owner.storageState()).cookies);
    const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(base+"/admin", { waitUntil: "networkidle" });
    await expect(page.locator(".admin-section-button")).toHaveCount(4); await expect(page.getByRole("button", { name: "Export Picklist PDF", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Pages", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Store", exact: true }).click(); await expect(page.getByRole("button", { name: "Pages", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Homepage carousel", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Restock demand", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Inventory", exact: true }).click(); await page.getByRole("button", { name: "Restock demand", exact: true }).click(); await page.getByLabel("Search restock demand", { exact: true }).fill(term);
    const table = page.locator(".restock-demand-table"); await expect(table.locator("tbody tr")).toHaveCount(25); await expect(table.locator("tbody tr").first()).toContainText(term);
    await table.locator("tbody tr").first().getByRole("button", { name: /^View watchers/ }).click(); await expect(page.getByRole("dialog")).toContainText("Demand Customer 2"); await page.getByRole("button", { name: "Close dialog", exact: true }).click();
    await page.screenshot({ path: "artifacts/admin-restock-demand-desktop.png", fullPage: true, animations: "disabled" }); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: "artifacts/admin-restock-demand-mobile.png", fullPage: true, animations: "disabled" }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth), "Demand mobile overflow");
    await table.locator("tbody tr").first().getByRole("button", { name: "Find in receiving", exact: true }).click(); await expect(page.locator(".admin-subnavigation").getByRole("button", { name: "Receive stock", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Customers", exact: true }).click(); await expect(page.getByRole("button", { name: "Customer directory", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: /^Inbox/ })).toBeVisible(); await page.getByRole("button", { name: "Newsletter & engagement", exact: true }).click(); await page.getByLabel("Search newsletter sign-ups", { exact: true }).fill(tag); await page.getByLabel("Newsletter sort", { exact: true }).selectOption("email"); await expect(page.locator(".newsletter-table tbody tr")).toHaveCount(25);
    const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export sign-ups CSV", exact: true }).click(); const download = await downloadPromise; assert.match(download.suggestedFilename(), /newsletter/); assert.equal(await download.failure(), null);
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: `Remove subscriber ${emails[0]}`, exact: true }).click(); await expect(page.locator(".pages-status")).toContainText("Removed from the website list"); assert.equal((await json<SubscriberData>(await owner.get(`/api/newsletter/subscribers?q=${tag}`))).total, 30); assert.equal((await pool.query("SELECT count(*)::int AS n FROM customers WHERE id=$1", [customerIds[0]])).rows[0].n, 1);
    await expect(page.locator(".newsletter-table tbody tr")).toHaveCount(25);
    await page.screenshot({ path: "artifacts/admin-newsletter-mobile.png", fullPage: true, animations: "disabled" }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth), "Newsletter mobile overflow");
    await page.getByRole("button", { name: "Orders", exact: true }).click(); await page.getByRole("button", { name: "Picklist generator", exact: true }).click(); await expect(page.getByRole("button", { name: "Export Picklist PDF", exact: true })).toBeVisible(); await expect(page.locator(".picklist-workspace")).toContainText("Every Packing order");
    const preview = await json<{ importId: string }>(await owner.post("/api/inventory", { data: { action: "preview", rows: [{ productId: productIds[0], quantity: 5, unit_cost_aud: "1.25", acquisition_type: "Purchase" }] } })); await json(await owner.post("/api/inventory", { data: { action: "commit", importId: preview.importId } }));
    const after = await json<DemandData>(await owner.get(demandURL)); assert.equal(after.total, 27); assert.ok(!after.rows.some(row => row.productId===productIds[0])); assert.equal((await json<{ total: number }>(await owner.get(`/api/inventory/demand?productId=${productIds[0]}`))).total, 3);
    assert.deepEqual(errors, []); console.log("PASS: four grouped workspaces and scoped picklist; owner/CSRF protection; exact-variant restock ranking, unique customers, filters, all-page exports, watcher details and live receiving updates; newsletter-only audience, account consent separation, CSV safety, pagination, removal without account deletion; desktop/mobile without overflow or page errors.");
  } finally {
    await browser?.close(); await pool.query("DELETE FROM newsletter WHERE email=ANY($1::text[])", [emails]); await pool.query("DELETE FROM customers WHERE id=ANY($1::uuid[])", [customerIds]); /* Keep isolated product/receipt fixtures: immutable acquisition lots reference them. */ await owner.dispose(); await guest.dispose(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
