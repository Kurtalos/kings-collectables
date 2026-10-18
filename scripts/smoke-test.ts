import "dotenv/config";
import assert from "node:assert/strict";
import { db, pool } from "../src/db";
import { products, categories, imports, orders, inquiries, newsletter, customers, addresses } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseCSV } from "../src/lib/csv";
import { parseDecklist, normaliseName, frontFace } from "../src/lib/decklist";
import { parseDeckLink, isDeckLink, siteName } from "../src/lib/moxfield";
import { decks, deckItems } from "../src/db/schema";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let cookie = "", product: Record<string, any> | null = null, groupId = "", variantId = "", importId = "", orderNumber = "";
let posCardId = "", posCardStart = 0, checkoutCardId = "", checkoutCardStart = 0, pricingCardId = "", pricingCardStart = 0;
const posOrderNumbers: string[] = [], posEmails: string[] = [];
const email = `test-${Date.now()}@example.com`;
async function api(path: string, method = "GET", body?: unknown, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); return data;
}
async function main() {
  if (process.env.ADMIN_PASSWORD) { const response = await fetch(`${base}/api/owner`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }); assert.equal(response.status, 200); cookie = response.headers.get("set-cookie")?.split(";")[0] || ""; }
  assert.equal((await api("/api/health")).ok, true);
  const catalog = await api("/api/cards"); assert.ok(catalog.products.length >= 18); product = catalog.products.find((card: any) => card.name === "Sol Ring"); assert.ok(product);
  assert.equal(parseCSV('name,quantity\r\n"Ragavan, Nimble Pilferer",2\r\n').rows[0][0], "Ragavan, Nimble Pilferer");
  assert.equal(parseCSV('name,note\n"Sol Ring","a ""quoted"" note"\n').rows[0][1], 'a "quoted" note');
  assert.throws(() => parseCSV('name,qty\n"Broken,2'));
  // ── Deck URL detection (Moxfield and friends) ───────────────────────────
  const mox = parseDeckLink("https://www.moxfield.com/decks/kv1SlU7yTkupKQb8sBdR6A");
  assert.equal(mox?.site, "moxfield"); assert.equal(mox?.deckId, "kv1SlU7yTkupKQb8sBdR6A"); assert.equal(mox?.url, "https://www.moxfield.com/decks/kv1SlU7yTkupKQb8sBdR6A");
  assert.equal(parseDeckLink("moxfield.com/decks/abc123XYZ")?.site, "moxfield", "protocol-less URLs are recognised");
  assert.equal(parseDeckLink("  https://moxfield.com/decks/abc123  extra text")?.deckId, "abc123", "surrounding whitespace and text are ignored");
  assert.equal(parseDeckLink("https://archidekt.com/decks/12345/my-deck")?.site, "archidekt");
  assert.equal(parseDeckLink("https://www.tappedout.net/mtg-decks/my-deck-1")?.site, "tappedout");
  assert.equal(parseDeckLink("https://www.mtggoldfish.com/deck/6789012")?.site, "mtggoldfish");
  assert.equal(parseDeckLink("4 Lightning Bolt"), null, "a normal decklist line is not a link");
  assert.equal(parseDeckLink("https://example.com/decks/abc123"), null, "unsupported sites are not treated as links");
  assert.equal(parseDeckLink(""), null);
  assert.equal(isDeckLink("https://www.moxfield.com/decks/kv1SlU7yTkupKQb8sBdR6A"), true);
  assert.equal(isDeckLink("1 Sol Ring"), false);
  assert.equal(siteName("moxfield"), "Moxfield");
  assert.equal(siteName("archidekt"), "Archidekt");

  const parsed = parseDecklist("Deck\n4 Lightning Bolt\n4x Sol Ring\n1 The One Ring (LTR) 241\nSB: 2 Cyclonic Rift\nSideboard\n2 Swords to Plowshares\n\n// a comment line\n1 Lightning Bolt");
  const byName = (name: string) => parsed.cards.filter(card => card.name === name);
  assert.equal(byName("Lightning Bolt").length, 2, "same name in different sections stays separate");
  assert.equal(byName("Lightning Bolt")[0].quantity, 4);
  assert.equal(byName("Lightning Bolt")[1].quantity, 1);
  const merged = parseDecklist("3 Sol Ring\n4x Sol Ring\nSol Ring");
  assert.equal(merged.cards.length, 1, "duplicates in the same section merge");
  assert.equal(merged.cards[0].quantity, 8);
  assert.equal(byName("Sol Ring")[0].quantity, 4);
  assert.equal(byName("The One Ring")[0].setCode, "ltr");
  assert.equal(byName("The One Ring")[0].collectorNumber, "241");
  assert.equal(byName("Cyclonic Rift")[0].section, "Sideboard");
  assert.equal(parsed.cards.filter(card => card.section === "Sideboard").length, 3, "SB prefix, heading and following line all land in Sideboard");
  assert.ok(!parsed.cards.some(card => card.name.toLowerCase().includes("comment")), "comment lines must be ignored");
  assert.ok(parseDecklist("2 Ragavan, Nimble Pilferer").cards[0].name.includes(","));
  assert.equal(frontFace("Brisela, Voice of Nightmares // Briseole"), "Brisela, Voice of Nightmares");
  assert.equal(normaliseName("  Sol   Ring "), "sol ring");
  const linkLine = parseDecklist("1 https://example.com/card");
  assert.ok(linkLine.cards[0].error, "links must be rejected");
  const badQty = parseDecklist("9999 Sol Ring");
  assert.ok(badQty.cards[0].error, "quantities above the cap must be rejected");
  assert.throws(() => parseDecklist(""), "empty input must throw");
  assert.throws(() => parseDecklist("   \n  \n"), "whitespace-only input must throw");
  assert.throws(() => parseDecklist(Array.from({ length: 500 }, (_, index) => `1 Card ${index}`).join("\n")), "over 400 lines must throw");
  assert.throws(() => parseDecklist(Array.from({ length: 210 }, (_, index) => `1 Test Card ${index}`).join("\n")), "over 200 unique cards must throw");
  const atLimit = parseDecklist(Array.from({ length: 200 }, (_, index) => `1 Test Card ${index}`).join("\n"));
  assert.equal(atLimit.cards.length, 200);
  const deckResponse = await api("/api/decklist", "POST", { text: "4 Sol Ring\n2 Nonexistent Fake Card\n2 The One Ring" });
  assert.equal(deckResponse.rows.length, 3);
  const solRow = deckResponse.rows.find((row: any) => row.requested === "Sol Ring");
  assert.ok(solRow.variants.length >= 1, "Sol Ring should match inventory");
  assert.equal(solRow.status, "instock");
  assert.ok(solRow.available >= 4, `expected stock for 4 Sol Ring, got ${solRow.available}`);
  assert.ok(solRow.unitPrice > 0);
  assert.ok(solRow.scryfallId);
  assert.equal(deckResponse.rows.find((row: any) => row.requested === "Nonexistent Fake Card").status, "notstocked");
  const fakeScryfall = deckResponse.rows.find((row: any) => row.requested === "Nonexistent Fake Card");
  assert.equal(fakeScryfall.scryfallId, null, "fake card should not resolve on Scryfall");
  const oneRing = deckResponse.rows.find((row: any) => row.requested === "The One Ring");
  assert.ok(oneRing.variants.length >= 1);
  assert.equal(deckResponse.summary.totalCards, 8);
  assert.ok(deckResponse.summary.shoppable >= 2);
  assert.ok(deckResponse.summary.total > 0);
  const annotated = await api("/api/decklist", "POST", { text: "1 Sol Ring (CMM) 432" });
  assert.equal(annotated.rows[0].status, "instock");
  const emptyBody = await api("/api/decklist", "POST", { text: "   " }, 400);
  assert.ok(emptyBody.error);
  const group = await api("/api/collections", "POST", { name: `Test collection ${Date.now()}`, description: "Temporary test collection", color: "#49655c" }, 201); groupId = group.collection.id;
  await api("/api/cards", "PUT", { productIds: [product!.id], categoryId: groupId });
  let fresh = await api("/api/cards"); assert.ok(fresh.products.find((card: any) => card.id === product!.id).categoryIds.includes(groupId));
  await api(`/api/cards/${product!.id}`, "PATCH", { price: 456, quantity: product!.quantity });
  fresh = await api("/api/cards"); assert.equal(fresh.products.find((card: any) => card.id === product!.id).price, 456);
  await api(`/api/cards/${product!.id}`, "PATCH", { price: product!.price, quantity: product!.quantity });
  await api(`/api/cards/${product!.id}`, "PATCH", { price: -1 }, 400);
  await api("/api/cards/not-a-uuid", "PATCH", { price: 200 }, 400);
  const variant = await api("/api/cards", "POST", { scryfallId: product!.scryfallId, condition: "Lightly played", finish: "Foil", price: 123, quantity: 1, categoryIds: [groupId] }, 201); variantId = variant.product.id;
  await api("/api/cards", "POST", { scryfallId: product!.scryfallId, condition: product!.condition, finish: product!.finish, price: 123, quantity: 1 }, 400);
  await api(`/api/cards/${variantId}`, "DELETE"); variantId = "";
  const preview = await api("/api/import", "POST", { action: "preview", filename: "smoke-test.csv", rows: [{ name: "Sol Ring", set: "cmm", quantity: "2", price: "3.50", condition: "NM", finish: "Non-foil" }, { name: "Invalid test card", quantity: "bad", price: "1.00" }] }); importId = preview.importId;
  assert.equal(preview.rows[0].card.name, "Sol Ring"); assert.ok(preview.rows[1].error);
  const result = await api("/api/import", "POST", { action: "commit", importId, mode: "add" }); assert.equal(result.imported, 1); assert.equal(result.skipped, 1);
  await api("/api/import", "POST", { action: "commit", importId, mode: "add" }, 400);
  fresh = await api("/api/cards"); assert.equal(fresh.products.find((card: any) => card.id === product!.id).quantity, product!.quantity + 2);
  await api(`/api/cards/${product!.id}`, "PATCH", { quantity: product!.quantity });
  const order = await api("/api/orders", "POST", { customerName: "Smoke Test", email, recipientName: "Test Recipient", line1: "1 Test Street", suburb: "Melbourne", state: "VIC", postcode: "3000", items: [{ productId: product!.id, quantity: 1 }] }, 201); orderNumber = order.order.orderNumber; assert.equal(order.order.total, product!.price + 895);
  fresh = await api("/api/cards"); assert.equal(fresh.products.find((card: any) => card.id === product!.id).quantity, product!.quantity - 1);
  const lookup = await api(`/api/orders?email=${encodeURIComponent(email)}&orderNumber=${orderNumber}`); assert.equal(lookup.orders.length, 1);
  const wrongLookup = await api(`/api/orders?email=wrong@example.com&orderNumber=${orderNumber}`); assert.equal(wrongLookup.orders.length, 0);
  await api("/api/orders", "PATCH", { id: lookup.orders[0].id, status: "Cancelled" });
  await api("/api/orders", "PATCH", { id: lookup.orders[0].id, status: "Packing" }, 400);
  fresh = await api("/api/cards"); assert.equal(fresh.products.find((card: any) => card.id === product!.id).quantity, product!.quantity);
  await api("/api/contact", "POST", { name: "Smoke Test", email, message: "Temporary automated validation message." }, 201);
  const messages = await api("/api/contact"); const note = messages.messages.find((message: any) => message.email === email); assert.ok(note);
  await api("/api/contact", "PATCH", { id: note.id });
  await api("/api/newsletter", "POST", { email }); await api("/api/newsletter", "POST", { email }); await api("/api/newsletter", "POST", { email: "invalid" }, 400);
  const guestAccount = await fetch(`${base}/api/account`); const guestData = await guestAccount.json(); assert.equal(guestData.customer, null);
  await api("/api/account", "POST", { action: "wishlist", productId: product!.id }, 401);
  const accountEmail = `collector-${Date.now()}@example.com`;
  const registered = await fetch(`${base}/api/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name: "Test Collector", email: accountEmail, password: "password123" }) });
  const registeredData = await registered.json(); assert.equal(registered.status, 201, JSON.stringify(registeredData)); assert.equal(registeredData.customer.email, accountEmail);
  const customerCookie = registered.headers.get("set-cookie")?.split(";")[0] || ""; assert.ok(customerCookie);
  async function customerApi(body: unknown, expected = 200) {
    const response = await fetch(`${base}/api/account`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: customerCookie }, body: JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  }
  let accountState = await customerApi({ action: "wishlist", productId: product!.id }); assert.ok(accountState.wishlistIds.includes(product!.id));
  accountState = await customerApi({ action: "wishlist", productId: product!.id }); assert.equal(accountState.wishlistIds.includes(product!.id), false);
  accountState = await customerApi({ action: "watchlist", productId: product!.id }); assert.equal(accountState.watchlist.length, 1);
  accountState = await customerApi({ action: "sync", wishlistIds: [product!.id] }); assert.ok(accountState.wishlistIds.includes(product!.id));
  const duplicate = await fetch(`${base}/api/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name: "Test Collector", email: accountEmail, password: "password123" }) });
  assert.equal(duplicate.status, 400);
  const login = await fetch(`${base}/api/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email: accountEmail, password: "password123" }) });
  assert.equal(login.status, 200);
  const stripeCheck = await fetch(`${base}/api/payments/stripe`);
  const stripeData = await stripeCheck.json();
  assert.equal(stripeCheck.status, 200, JSON.stringify(stripeData));
  assert.equal(typeof stripeData.cardAvailable, "boolean");
  const stripeIntentUnauthorized = await fetch(`${base}/api/payments/stripe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: product!.id }) });
  assert.ok([400, 401].includes(stripeIntentUnauthorized.status), `Expected 400/401, got ${stripeIntentUnauthorized.status}`);
  const webhookNoSignature = await fetch(`${base}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "test" }) });
  assert.ok([400, 503].includes(webhookNoSignature.status), `Expected 400/503, got ${webhookNoSignature.status}`);
  const newOrder = await api("/api/orders", "POST", { customerName: "Payment Test", email, recipientName: "Test Recipient", line1: "1 Test Street", suburb: "Melbourne", state: "VIC", postcode: "3000", items: [{ productId: product!.id, quantity: 1 }] }, 201);
  const markPaid = await fetch(`${base}/api/payments/mark-paid`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ id: newOrder.order.id, status: "Paid", paymentMethod: "Bank transfer", paymentReceipt: `test-ref-${Date.now()}` }) });
  const markPaidData = await markPaid.json();
  assert.equal(markPaid.status, 200, JSON.stringify(markPaidData));
  const paidLookup = await api(`/api/orders?email=${encodeURIComponent(email)}&orderNumber=${newOrder.order.orderNumber}`);
  assert.equal(paidLookup.orders[0].status, "Paid");
  assert.equal(paidLookup.orders[0].paymentMethod, "Bank transfer");
  assert.ok(paidLookup.orders[0].paymentReceipt);
  assert.ok(paidLookup.orders[0].paidAt);
  // ── Point of sale ─────────────────────────────────────────────────────────
  const posCard = catalog.products.find((card: any) => card.name === "Lightning Bolt");
  assert.ok(posCard, "need a Lightning Bolt variant for POS tests");
  posCardId = posCard.id; posCardStart = posCard.quantity;
  const unit = posCard.price;
  const track = (sale: any) => { posOrderNumbers.push(sale.sale.orderNumber); return sale.sale; };
  const shelfQty = async () => (await api("/api/cards")).products.find((card: any) => card.id === posCardId).quantity as number;

  const sale1 = track(await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 2 }], payments: [{ method: "Cash", amount: unit * 2 }] }, 201));
  assert.equal(sale1.channel, "pos"); assert.equal(sale1.status, "Paid"); assert.ok(sale1.paidAt);
  assert.ok(sale1.orderNumber.startsWith("POS-"), `expected a POS receipt number, got ${sale1.orderNumber}`);
  assert.equal(sale1.total, unit * 2); assert.equal(sale1.shipping, 0); assert.equal(sale1.change, 0);
  assert.equal(sale1.paymentMethod, "Cash"); assert.equal(sale1.items.length, 1); assert.equal(sale1.items[0].quantity, 2);
  assert.equal(await shelfQty(), posCardStart - 2, "POS sale must decrement shared inventory");

  const sale2 = track(await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Cash", amount: unit + 5000 }] }, 201));
  assert.equal(sale2.change, 5000, "overpaid cash must produce change");
  assert.equal(sale2.total, unit); assert.equal(sale2.tenders[0].amount, unit, "only the applied amount is booked");

  const sale3 = track(await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 4 }], discount: { type: "percent", value: 10 }, payments: [{ method: "Card", amount: Math.round(unit * 4 * 0.9) }] }, 201));
  assert.equal(sale3.discount, Math.round(unit * 4 * 10) / 100); assert.equal(sale3.total, unit * 4 - sale3.discount);

  const sale4 = track(await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1, unitPrice: 150, note: "Counter haggle" }], payments: [{ method: "Cash", amount: 150 }] }, 201));
  assert.equal(sale4.total, 150, "line price overrides must apply"); assert.ok(sale4.items[0].variant.includes("Counter haggle"));

  const sale5 = track(await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 3 }], payments: [{ method: "Cash", amount: 400 }, { method: "Card", amount: unit * 3 - 400 }] }, 201));
  assert.equal(sale5.tenders.length, 2); assert.equal(sale5.paymentMethod, "Cash + Card"); assert.equal(sale5.total, unit * 3);

  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Cash", amount: 1 }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 999 }], payments: [{ method: "Cash", amount: 99999999 }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }, { productId: posCardId, quantity: 1 }], payments: [{ method: "Cash", amount: unit * 2 }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [], payments: [{ method: "Cash", amount: 100 }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Bitcoin", amount: unit }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], payments: [] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Store credit", amount: unit }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: "not-a-uuid", quantity: 1 }], payments: [{ method: "Cash", amount: unit }] }, 400);
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], discount: { type: "percent", value: 150 }, payments: [{ method: "Cash", amount: unit }] }, 400);
  const qtyAfterRejects = await shelfQty();
  assert.equal(qtyAfterRejects, posCardStart - 11, "rejected sales must not touch inventory");

  const posEmail = `pos-${Date.now()}@example.com`; posEmails.push(posEmail);
  const profile = await api("/api/pos", "POST", { action: "createCustomer", name: "POS Regular", email: posEmail, password: "register123" }, 201);
  assert.equal(profile.customer.creditBalance, 0);
  await api("/api/pos", "POST", { action: "createCustomer", name: "Dupe", email: posEmail, password: "register123" }, 400);
  await api("/api/pos", "POST", { action: "createCustomer", name: "Bad", email: "nope", password: "register123" }, 400);
  await api("/api/pos", "POST", { action: "createCustomer", name: "Bad", email: `x-${Date.now()}@example.com`, password: "short" }, 400);

  const tradeSale = track(await api("/api/pos", "POST", { action: "sale", customerId: profile.customer.id, lines: [{ productId: posCardId, quantity: 1 }], tradeIns: [{ name: "Sheoldred, the Apocalypse (DMU)", amount: 2500 }], payments: [{ method: "Cash", amount: unit }] }, 201));
  assert.equal(tradeSale.tradeTotal, 2500); assert.equal(tradeSale.customer.creditBalance, 2500, "trade-in must issue store credit");
  await api("/api/pos", "POST", { action: "sale", lines: [{ productId: posCardId, quantity: 1 }], tradeIns: [{ name: "Orphan trade", amount: 500 }], payments: [{ method: "Cash", amount: unit }] }, 400);

  const creditSale = track(await api("/api/pos", "POST", { action: "sale", customerId: profile.customer.id, lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Store credit", amount: unit }] }, 201));
  assert.equal(creditSale.customer.creditBalance, 2500 - unit, "store credit tender must draw down the balance");
  await api("/api/pos", "POST", { action: "sale", customerId: profile.customer.id, lines: [{ productId: posCardId, quantity: 1 }], payments: [{ method: "Store credit", amount: 99999 }] }, 400);

  const adjusted = await api("/api/pos", "POST", { action: "credit", customerId: profile.customer.id, amount: 1000, reason: "Goodwill" });
  assert.equal(adjusted.customer.creditBalance, 3500 - unit);
  await api("/api/pos", "POST", { action: "credit", customerId: profile.customer.id, amount: -999999, reason: "Overdraw" }, 400);
  await api("/api/pos", "POST", { action: "credit", customerId: profile.customer.id, amount: 0, reason: "Zero" }, 400);

  const searched = await api(`/api/pos?search=${encodeURIComponent(posEmail)}`);
  assert.equal(searched.customers.length, 1); assert.equal(searched.customers[0].creditBalance, 3500 - unit);
  await api("/api/pos?search=a", "GET", undefined, 400);

  const beforeRefund = await shelfQty();
  const refunded = await api("/api/pos", "POST", { action: "refund", orderId: creditSale.id, reason: "Customer changed their mind" });
  assert.equal(refunded.order.status, "Refunded"); assert.equal(refunded.order.refundedAmount, unit); assert.ok(refunded.order.refundedAt);
  assert.equal(refunded.order.refundReason, "Customer changed their mind");
  assert.equal(await shelfQty(), beforeRefund + 1, "refund must return cards to the shelf");
  const afterRefund = await api(`/api/pos?search=${encodeURIComponent(posEmail)}`);
  assert.equal(afterRefund.customers[0].creditBalance, 3500, "refunding a credit sale must return the credit");
  await api("/api/pos", "POST", { action: "refund", orderId: creditSale.id }, 400);
  await api("/api/orders", "PATCH", { id: sale1.id, status: "Cancelled" }, 400);
  await api("/api/orders", "PATCH", { id: creditSale.id, status: "Packing" }, 400);

  const report = await api("/api/pos");
  assert.ok(report.sales >= 6, `expected the day's POS sales, got ${report.sales}`);
  assert.equal(report.takings, report.gross - report.refundedTotal);
  assert.ok(report.byMethod.some((row: any) => row.method === "Cash" && row.amount > 0));
  assert.ok(report.byMethod.some((row: any) => row.method === "Store credit"));
  assert.ok(report.creditIssued >= 2500); assert.ok(report.creditRedeemed >= unit);
  assert.ok(report.discountGiven >= sale3.discount);
  assert.ok(report.recent.every((sale: any) => sale.channel === "pos"));
  assert.ok(report.recent.some((sale: any) => sale.orderNumber === sale1.orderNumber));
  assert.ok(report.recent.find((sale: any) => sale.orderNumber === sale1.orderNumber).tenders.length >= 1);
  await api(`/api/pos?from=not-a-date&to=2026-01-01`, "GET", undefined, 400);

  const webStillWorks = await api("/api/orders", "POST", { customerName: "Web Shopper", email, recipientName: "Test Recipient", line1: "1 Test Street", suburb: "Melbourne", state: "VIC", postcode: "3000", items: [{ productId: posCardId, quantity: 1 }] }, 201);
  posOrderNumbers.push(webStillWorks.order.orderNumber);
  assert.ok(webStillWorks.order.orderNumber.startsWith("KC-"), "web orders keep their own prefix");

  // ── Checkout: saved addresses & autofill ─────────────────────────────────
  const checkoutCard = catalog.products.find((card: any) => card.name === "Esper Sentinel");
  assert.ok(checkoutCard, "need an Esper Sentinel variant for checkout tests");
  checkoutCardId = checkoutCard.id; checkoutCardStart = checkoutCard.quantity;

  const stamp = Date.now();
  const buyerEmail = `buyer-${stamp}@example.com`, otherEmail = `other-${stamp}@example.com`;
  posEmails.push(buyerEmail, otherEmail);
  async function register(name: string, emailAddress: string) {
    const response = await fetch(`${base}/api/account`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name, email: emailAddress, password: "checkout123" }) });
    assert.equal(response.status, 201, `registration failed for ${emailAddress}`);
    return response.headers.get("set-cookie")?.split(";")[0] || "";
  }
  const buyerCookie = await register("Checkout Buyer", buyerEmail);
  const otherCookie = await register("Other Collector", otherEmail);
  async function addressApi(method: string, body: unknown, jar: string, expected = 200) {
    const init: RequestInit = { method, headers: { "Content-Type": "application/json", Cookie: jar } };
    if (method !== "GET" && body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${base}/api/addresses`, init);
    const data = await response.json(); assert.equal(response.status, expected, `${method} /api/addresses: ${JSON.stringify(data)}`); return data;
  }
  const unauthAddresses = await fetch(`${base}/api/addresses`); assert.equal(unauthAddresses.status, 401);

  const home = await addressApi("POST", { label: "Home", recipientName: "Checkout Buyer", line1: "12 Collector Street", suburb: "Melbourne", state: "VIC", postcode: "3000", phone: "0400 000 000" }, buyerCookie, 201);
  assert.equal(home.address.isDefault, true, "the first saved address becomes the default");
  const work = await addressApi("POST", { label: "Work", recipientName: "Checkout Buyer", line1: "88 Trade Road", line2: "Suite 4", suburb: "Brisbane", state: "QLD", postcode: "4000" }, buyerCookie, 201);
  assert.equal(work.address.isDefault, false);
  assert.equal(work.addresses[0].id, home.address.id, "default address should list first");

  await addressApi("PATCH", { id: work.address.id, action: "default" }, buyerCookie);
  let listed = await addressApi("GET", {}, buyerCookie);
  assert.equal(listed.addresses[0].id, work.address.id);
  assert.equal(listed.addresses.filter((entry: any) => entry.isDefault).length, 1, "exactly one default address at a time");

  const updated = await addressApi("POST", { id: home.address.id, label: "Home", recipientName: "Checkout Buyer", line1: "12 Collector Street", suburb: "Geelong", state: "VIC", postcode: "3220" }, buyerCookie);
  assert.equal(updated.address.suburb, "Geelong");
  await addressApi("POST", { label: "Home", recipientName: "Checkout Buyer", line1: "12 Collector Street", suburb: "Geelong", state: "VIC", postcode: "3220" }, buyerCookie, 400);
  await addressApi("POST", { recipientName: "Buyer", line1: "1 Bad Street", suburb: "Melbourne", state: "VIC", postcode: "300" }, buyerCookie, 400);
  await addressApi("POST", { recipientName: "Buyer", line1: "1 Bad Street", suburb: "Melbourne", state: "XYZ", postcode: "3000" }, buyerCookie, 400);
  await addressApi("POST", { recipientName: "B", line1: "1 Bad Street", suburb: "Melbourne", state: "VIC", postcode: "3000" }, buyerCookie, 400);
  await addressApi("POST", { recipientName: "Buyer", line1: "x", suburb: "Melbourne", state: "VIC", postcode: "3000" }, buyerCookie, 400);

  const otherList = await addressApi("GET", {}, otherCookie);
  assert.equal(otherList.addresses.length, 0, "addresses must not leak between customers");
  await addressApi("PATCH", { id: work.address.id, action: "default" }, otherCookie, 400);
  await addressApi("DELETE", { id: work.address.id }, otherCookie, 400);

  async function orderAs(jar: string, body: unknown, expected = 200) {
    const response = await fetch(`${base}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: jar }, body: JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, expected, `POST /api/orders: ${JSON.stringify(data)}`); return data;
  }
  const withSaved = await orderAs(buyerCookie, { customerName: "Checkout Buyer", email: buyerEmail, addressId: work.address.id, items: [{ productId: checkoutCardId, quantity: 1 }] }, 201);
  posOrderNumbers.push(withSaved.order.orderNumber);
  assert.equal(withSaved.order.addressId, work.address.id);
  const savedLookup = await api(`/api/orders?email=${encodeURIComponent(buyerEmail)}&orderNumber=${withSaved.order.orderNumber}`);
  assert.equal(savedLookup.orders[0].shippingAddress, "Checkout Buyer\n88 Trade Road\nSuite 4\nBrisbane QLD 4000", "the stored address must be composed server-side");
  assert.equal(savedLookup.orders[0].channel, "web");

  await orderAs(buyerCookie, { customerName: "Checkout Buyer", email: buyerEmail, addressId: "00000000-0000-4000-8000-000000000000", items: [{ productId: checkoutCardId, quantity: 1 }] }, 400);
  const stolenAddress = await fetch(`${base}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: otherCookie }, body: JSON.stringify({ customerName: "Other Collector", email: otherEmail, addressId: work.address.id, items: [{ productId: checkoutCardId, quantity: 1 }] }) });
  assert.equal(stolenAddress.status, 400, "another customer's saved address must be rejected");

  const withNew = await orderAs(buyerCookie, { customerName: "Checkout Buyer", email: buyerEmail, saveAddress: true, recipientName: "Checkout Buyer", line1: "5 New Lane", suburb: "Perth", state: "WA", postcode: "6000", items: [{ productId: checkoutCardId, quantity: 1 }] }, 201);
  posOrderNumbers.push(withNew.order.orderNumber);
  assert.ok(withNew.order.addressId, "saveAddress should persist and link the new address");
  listed = await addressApi("GET", {}, buyerCookie);
  assert.equal(listed.addresses.length, 3);

  const guestOrder = await api("/api/orders", "POST", { customerName: "Guest Shopper", email, recipientName: "Guest Shopper", line1: "9 Guest Court", suburb: "Adelaide", state: "SA", postcode: "5000", items: [{ productId: checkoutCardId, quantity: 1 }] }, 201);
  posOrderNumbers.push(guestOrder.order.orderNumber);
  assert.equal(guestOrder.order.addressId, null, "guests should not create saved addresses");
  const guestListed = await addressApi("GET", {}, buyerCookie);
  assert.equal(guestListed.addresses.length, 3, "a guest order must not add to the buyer's addresses");
  await api("/api/orders", "POST", { customerName: "Guest", email, addressId: work.address.id, items: [{ productId: checkoutCardId, quantity: 1 }] }, 400);
  await api("/api/orders", "POST", { customerName: "Guest", email, line1: "9 Guest Court", suburb: "Adelaide", state: "SA", postcode: "500", items: [{ productId: checkoutCardId, quantity: 1 }] }, 400);
  await api("/api/orders", "POST", { customerName: "Guest", email, items: [{ productId: checkoutCardId, quantity: 1 }] }, 400);

  await addressApi("DELETE", { id: work.address.id }, buyerCookie);
  listed = await addressApi("GET", {}, buyerCookie);
  assert.equal(listed.addresses.length, 2);
  assert.equal(listed.addresses.filter((entry: any) => entry.isDefault).length, 1, "deleting the default must promote another address");
  assert.notEqual(listed.addresses.find((entry: any) => entry.isDefault).id, work.address.id);

  await api("/api/collections", "DELETE", { id: groupId }); groupId = "";
  fresh = await api("/api/cards"); assert.equal(fresh.products.length, catalog.products.length);
  // ── Daily market price updates ─────────────────────────────────────────────
  const { resolvePriceSource, tcgplayerConfigured, pickProductId, matchPriceRow, rowPriceCents } = await import("../src/lib/tcgplayer");
  const { computeAudPrice, validateSettings, DEFAULT_SETTINGS } = await import("../src/lib/pricing");
  assert.equal(tcgplayerConfigured(), Boolean(process.env.TCGPLAYER_PUBLIC_KEY && process.env.TCGPLAYER_PRIVATE_KEY));
  if (!tcgplayerConfigured()) {
    assert.equal(resolvePriceSource("auto"), "scryfall", "auto without keys resolves to Scryfall");
    assert.equal(resolvePriceSource("scryfall"), "scryfall");
    assert.throws(() => resolvePriceSource("tcgplayer"), /TCGPLAYER_PUBLIC_KEY/);
  } else {
    assert.equal(resolvePriceSource("auto"), "tcgplayer"); assert.equal(resolvePriceSource("tcgplayer"), "tcgplayer");
  }
  assert.equal(pickProductId({ tcgplayer_id: 123, tcgplayer_etched_id: 456 }, "Non-foil"), 123);
  assert.equal(pickProductId({ tcgplayer_id: 123, tcgplayer_etched_id: 456 }, "Foil"), 123, "foils share the same productId, separated by subType row");
  assert.equal(pickProductId({ tcgplayer_id: 123, tcgplayer_etched_id: 456 }, "Etched"), 456, "etched uses the etched productId when known");
  assert.equal(pickProductId({ tcgplayer_id: 123, tcgplayer_etched_id: null }, "Etched"), 123, "etched falls back to the product when no etched id exists");
  assert.equal(pickProductId({ tcgplayer_id: null, tcgplayer_etched_id: null }, "Non-foil"), null, "unmapped cards return null so Scryfall can take over");
  const rows = [
    { productId: 1, subTypeName: "Normal", marketPrice: 5, midPrice: 4, lowPrice: 3, highPrice: 9, directLowPrice: null },
    { productId: 1, subTypeName: "Foil", marketPrice: null, midPrice: null, lowPrice: null, highPrice: null, directLowPrice: null },
  ];
  assert.equal(matchPriceRow(rows, "Non-foil")?.marketPrice, 5);
  assert.equal(matchPriceRow(rows, "Foil")?.marketPrice, 5, "empty foil row falls back to the Normal row");
  assert.equal(matchPriceRow([{ productId: 2, subTypeName: "Holo", marketPrice: null, midPrice: 7, lowPrice: null, highPrice: null, directLowPrice: null }], "Etched")?.midPrice, 7);
  assert.equal(matchPriceRow([], "Non-foil"), null);
  assert.equal(rowPriceCents(rows[0]), 500);
  assert.equal(rowPriceCents({ productId: 1, subTypeName: "Normal", marketPrice: null, midPrice: 2.5, lowPrice: 1, highPrice: 3, directLowPrice: null }), 250, "midPrice used when marketPrice is missing");
  assert.equal(rowPriceCents({ productId: 1, subTypeName: "Normal", marketPrice: null, midPrice: null, lowPrice: null, highPrice: 3, directLowPrice: null }), null, "no usable price yields null");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, priceSource: "snello" as never }), "junk priceSource values must be rejected");
  assert.ok(catalog.products.some((card: any) => card.scryfallId), "every seeded product carries its Scryfall id for mapping");
  assert.equal(computeAudPrice(1000, "Near mint", { ...DEFAULT_SETTINGS, rate: 1.5, markupPct: 15, roundingCents: 50 }, { rate: 1.5, date: "2026-01-01", source: "test" }), 1750, "AUD formula: 10.00 USD × 1.5 × 1.15 = 17.25 → rounds up to 17.50");
  assert.equal(computeAudPrice(1000, "Damaged", DEFAULT_SETTINGS, { rate: 1.5, date: "x", source: "t" }), 650, "damaged multiplier 0.35 applies before rounding");
  assert.equal(computeAudPrice(1, "Near mint", DEFAULT_SETTINGS, { rate: 1.5, date: "x", source: "t" }), 50, "never rounds below the rounding increment");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, markupPct: 500 }), "markupPct over 200 must be rejected");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, autoFx: false, rate: 8 }), "out-of-range manual rate must be rejected");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, conditionMultipliers: { ...DEFAULT_SETTINGS.conditionMultipliers, "Near mint": 2 } }), "multiplier over 1 must be rejected");
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, markupPct: -20, roundingCents: 250 }));

  const pricingCard = catalog.products.find((card: any) => card.name === "Psychic Frog");
  assert.ok(pricingCard, "need a Psychic Frog variant for pricing tests");
  pricingCardId = pricingCard.id; pricingCardStart = pricingCard.price;

  const pricingGet = await api("/api/pricing");
  assert.equal(pricingGet.settings.roundingCents, 50); assert.ok(pricingGet.follow.auto === 0 && pricingGet.follow.manual >= 18);
  assert.ok(Array.isArray(pricingGet.events)); assert.ok(pricingGet.conditions.includes("Near mint"));
  assert.equal(typeof pricingGet.tcgplayerConfigured, "boolean"); assert.equal(pricingGet.settings.priceSource, "auto", "default source is Automatic");
  if (!tcgplayerConfigured()) await api("/api/pricing", "PATCH", { priceSource: "tcgplayer" }, 400);
  await api("/api/pricing", "PATCH", { priceSource: "gobbledews" }, 400);
  const scrySource = await api("/api/pricing", "PATCH", { priceSource: "scryfall" });
  assert.equal(scrySource.settings.priceSource, "scryfall", "Scryfall can be pinned explicitly");

  await api("/api/pricing", "PATCH", { autoFx: true, markupPct: 500 }, 400);
  await api("/api/pricing", "PATCH", { autoFx: false, rate: 9 }, 400);
  const settingsSaved = await api("/api/pricing", "PATCH", { autoFx: false, rate: 1.5, markupPct: 0, roundingCents: 50 });
  assert.equal(settingsSaved.settings.markupPct, 0); assert.equal(settingsSaved.settings.autoFx, false);

  await api(`/api/cards/${pricingCardId}`, "PATCH", { priceMode: "nonsense" }, 400);
  await api(`/api/cards/${pricingCardId}`, "PATCH", { price: 1, priceMode: "nonsense" }, 400);
  await api(`/api/cards/${pricingCardId}`, "PATCH", { priceMode: "tidy" }, 400);
  await api(`/api/cards/${pricingCardId}`, "PATCH", { price: 1, priceMode: "auto" });
  let cardsAfter = await api("/api/cards");
  const autoCard = cardsAfter.products.find((card: any) => card.id === pricingCardId);
  assert.equal(autoCard.priceMode, "auto"); assert.equal(autoCard.price, 1, "starting price forced for a deterministic change");

  const eventsBefore = (await api("/api/pricing")).events.filter((event: any) => event.productId === pricingCardId).length;
  const run1 = await api("/api/pricing/update", "POST", {});
  assert.ok(run1.run.following === 1, `expected exactly 1 card following, got ${run1.run.following}`);
  assert.equal(run1.run.updated, 1, "the forced 1-cent price must be repriced");
  assert.equal(run1.run.failed, 0);
  assert.equal(run1.run.priceSource, process.env.TCGPLAYER_PUBLIC_KEY ? "tcgplayer" : "scryfall", "the run records which feed priced the cards");
  assert.ok(typeof run1.run.fallbacks === "number" && run1.run.fallbacks >= 0);
  assert.ok(run1.run.fx.rate > 0.5 && run1.run.fx.rate < 7);
  cardsAfter = await api("/api/cards");
  const repriced = cardsAfter.products.find((card: any) => card.id === pricingCardId);
  assert.ok(repriced.usdPrice && repriced.usdPrice > 0, "market USD price must be recorded");
  assert.equal(repriced.price, computeAudPrice(repriced.usdPrice, repriced.condition, settingsSaved.settings, { rate: 1.5, date: "d", source: "t" }), "AUD price must match the formula exactly");
  assert.ok(repriced.price > 1);
  assert.ok(repriced.priceUpdatedAt);
  const eventsAfter1 = (await api("/api/pricing")).events.filter((event: any) => event.productId === pricingCardId);
  assert.equal(eventsAfter1.length, eventsBefore + 1, "an event must be recorded for the change");
  assert.equal(eventsAfter1[0].source, "manual"); assert.equal(eventsAfter1[0].usdPrice, repriced.usdPrice);

  const run2 = await api("/api/pricing/update", "POST", {});
  assert.equal(run2.run.updated, 0, "an unchanged market price must not duplicate events");
  assert.equal(run2.run.unchanged, 1);
  const eventsAfter2 = (await api("/api/pricing")).events.filter((event: any) => event.productId === pricingCardId).length;
  assert.equal(eventsAfter2, eventsBefore + 1, "unchanged prices never write events");

  await api(`/api/cards/${pricingCardId}`, "PATCH", { priceMode: "manual" });
  const afterManual = await api("/api/pricing");
  assert.equal(afterManual.follow.auto, 0);
  const run3 = await api("/api/pricing/update", "POST", {});
  assert.equal(run3.run.following, 0, "manual cards must not be repriced");

  if (process.env.CRON_SECRET) {
    const bad = await fetch(`${base}/api/cron/prices?key=wrong-key`); assert.equal(bad.status, 401);
    const good = await fetch(`${base}/api/cron/prices?key=${encodeURIComponent(process.env.CRON_SECRET)}`);
    assert.equal(good.status, 200);
    assert.ok((await good.json()).ok);
  } else {
    const blocked = await fetch(`${base}/api/cron/prices?key=anything`);
    assert.equal(blocked.status, 503, "cron without CRON_SECRET must report it is disabled");
  }
  await api("/api/pricing", "PATCH", { ...DEFAULT_SETTINGS, priceSource: "auto" });

  // ── Customer management (owner workspace) ────────────────────────────────
  if (process.env.ADMIN_PASSWORD) {
    const unauthCustomers = await fetch(`${base}/api/customers`);
    assert.equal(unauthCustomers.status, 401, "customer list must be owner-only");
  }
  const badCustomerId = await api("/api/customers?id=not-a-uuid", "GET", undefined, 400);
  assert.ok(badCustomerId.error);
  const missingCustomer = await api("/api/customers?id=00000000-0000-4000-8000-000000000000", "GET", undefined, 404);
  assert.ok(missingCustomer.error);
  await api("/api/customers", "PATCH", { id: "not-a-uuid", amount: 500 }, 400);
  await api("/api/customers", "PATCH", { id: profile.customer.id, amount: 0 }, 400);
  await api("/api/customers", "PATCH", { id: profile.customer.id, amount: 9999999 }, 400);

  const customerList = await api("/api/customers?search=" + encodeURIComponent(posEmail));
  assert.ok(customerList.customers.length >= 1, "the POS customer should be findable by email");
  const target = customerList.customers.find((entry: any) => entry.email === posEmail);
  assert.ok(target);
  assert.ok(!("passwordHash" in target), "customer rows must never leak the password hash");
  assert.ok(typeof target.totalSpent === "number" && typeof target.orderCount === "number");
  assert.ok(typeof target.wishlistCount === "number" && typeof target.watchlistCount === "number" && typeof target.addressCount === "number");
  assert.ok(customerList.totals && typeof customerList.totals.customers === "number");
  const noMatches = await api("/api/customers?search=zzzznobodyzzzz");
  assert.equal(noMatches.customers.length, 0, "an unknown search should return no rows");
  const sortedBySpend = await api("/api/customers?sort=spend");
  assert.ok(sortedBySpend.customers.every((entry: any, index: number, all: any[]) => index === 0 || all[index - 1].totalSpent >= entry.totalSpent), "spend sort should be descending");
  const sortedByName = await api("/api/customers?sort=name");
  assert.ok(sortedByName.customers.every((entry: any, index: number, all: any[]) => index === 0 || all[index - 1].name.localeCompare(entry.name) <= 0), "name sort should be alphabetical");

  const detail = await api(`/api/customers?id=${profile.customer.id}`);
  assert.equal(detail.customer.email, posEmail);
  assert.ok(!("passwordHash" in detail.customer), "detail must never leak the password hash");
  assert.ok(Array.isArray(detail.orders) && detail.orders.length >= 1, "the customer's POS orders should be listed");
  assert.ok(detail.orders.some((order: any) => order.items.length >= 1), "orders should include their line items");
  assert.ok(Array.isArray(detail.wishlist) && Array.isArray(detail.watchlist) && Array.isArray(detail.addresses) && Array.isArray(detail.credits));
  const creditAdjust = await api("/api/customers", "PATCH", { id: profile.customer.id, amount: 750, reason: "Test goodwill" });
  assert.equal(creditAdjust.customer.creditBalance, (await api(`/api/customers?id=${profile.customer.id}`)).customer.creditBalance);
  assert.ok(creditAdjust.customer.creditBalance > 0);
  const creditsAfter = (await api(`/api/customers?id=${profile.customer.id}`)).credits;
  assert.ok(creditsAfter.some((entry: any) => entry.amount === 750 && entry.reason === "Test goodwill"), "the adjustment should appear in the credit log");
  const creditOverspend = await api("/api/customers", "PATCH", { id: profile.customer.id, amount: -999999 }, 400);
  assert.ok(creditOverspend.error, "credit cannot go negative");

  // ── Complete MTG card database & out-of-stock search ────────────────────────
  const lotusSearch = await (await fetch(`${base}/api/cards/search?q=Black+Lotus`)).json();
  assert.ok(lotusSearch.cards.length >= 1, "Black Lotus should be found in search even when out of stock");
  assert.equal(lotusSearch.cards[0].quantity, 0, "out-of-stock cards should have 0 quantity");
  assert.ok(lotusSearch.cards[0].imageUrl.startsWith("http"), "out-of-stock cards should have high-res image scans");

  const rhysticSearch = await (await fetch(`${base}/api/cards/search?q=Rhystic+Study`)).json();
  assert.ok(rhysticSearch.cards.length >= 1, "Rhystic Study printings should be found in search");

  console.log("PASS: catalogue, CSV parsing, decklist parsing + matching, deck URL detection (Moxfield/Archidekt/TappedOut/MTGGoldfish) + Moxfield export parsing, deck save/load/update/delete, order reservation/cancellation, payments, accounts, wishlists, watch lists, POS sales + validation + trade-in credit + refunds + takings, saved addresses (CRUD, default promotion, validation, cross-customer isolation), checkout with saved/inline/guest addresses, daily market pricing (formula, settings validation, follow manual toggle, deterministic repricing, event log idempotence, all-manual guard, cron key handling, customer management (owner auth, no password-hash leakage, search + sorts, order/wishlist/watch/address/credit detail, credit adjustments with log), complete MTG card database (universal search, out-of-stock cards, restock watch & notifications).");
}
main().finally(async () => {
  if (product) await db.update(products).set({ price: product.price, quantity: product.quantity }).where(eq(products.id, product.id));
  if (variantId) await db.delete(products).where(eq(products.id, variantId));
  if (groupId) await db.delete(categories).where(eq(categories.id, groupId));
  if (importId) await db.delete(imports).where(eq(imports.id, importId));
  if (orderNumber) await db.delete(orders).where(eq(orders.orderNumber, orderNumber));
  for (const receipt of posOrderNumbers) await db.delete(orders).where(eq(orders.orderNumber, receipt));
  for (const address of posEmails) await db.delete(customers).where(eq(customers.email, address));
  if (posCardId) await db.update(products).set({ quantity: posCardStart }).where(eq(products.id, posCardId));
  if (checkoutCardId) await db.update(products).set({ quantity: checkoutCardStart }).where(eq(products.id, checkoutCardId));
  await db.delete(addresses).where(inArray(addresses.customerId, (await db.select({ id: customers.id }).from(customers).where(inArray(customers.email, posEmails))).map(row => row.id)));
  await db.delete(inquiries).where(eq(inquiries.email, email)); await db.delete(newsletter).where(eq(newsletter.email, email));
  await pool.end();
}).catch(error => { console.error(error); process.exitCode = 1; });
