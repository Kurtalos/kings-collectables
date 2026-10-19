import { test } from "node:test";
import assert from "node:assert/strict";
import { audCost, receiveLine } from "../src/lib/inventory-input";
import { parseCSV } from "../src/lib/csv";
import { assertTradeIns } from "../src/lib/pos";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
test("unknown cost and known zero are distinct; AUD is exact cents", () => {
  assert.equal(audCost(""), null);
  assert.equal(audCost("0"), 0);
  assert.equal(audCost("1.25"), 125);
  assert.throws(() => audCost("-1"));
  assert.throws(() => audCost("0.001"));
});
test("stock validation and pack allocations", () => {
  assert.equal(
    receiveLine({
      productId: id,
      quantity: 2,
      acquisition_type: "Pack opening",
    }).unitCost,
    null,
  );
  assert.equal(
    receiveLine({
      productId: id,
      quantity: 2,
      acquisition_type: "Pack opening",
      unit_cost_aud: "0.50",
    }).unitCost,
    50,
  );
  assert.throws(() => receiveLine({ productId: id, quantity: -1 }));
  assert.throws(() =>
    receiveLine({ productId: id, quantity: 2, date: "2026-02-30" }),
  );
});
test("CSV BOM, UTF8, quoted commas, escaped quotes and embedded newlines", () => {
  const parsed = parseCSV(
    '\uFEFFname,note,quantity\r\n"Ragavan, Nimble Pilferer","He said ""yes""\nCafé",2\r\n',
  );
  assert.deepEqual(parsed.rows, [
    ["Ragavan, Nimble Pilferer", 'He said "yes"\nCafé', "2"],
  ]);
  assert.throws(() => parseCSV('name\n"unfinished'));
  assert.throws(() =>
    parseCSV("name\n" + Array(1001).fill("Sol Ring").join("\n")),
  );
  const widths = parseCSV("name,quantity\nSol Ring,2\nBad,1,extra", true);
  assert.equal(Object.keys(widths.errors).length, 1);
  assert.equal(widths.rows.length, 2);
});
test("POS cannot credit nameless inventory or unallocated fractional cents", () => {
  assert.throws(() => assertTradeIns([{ name: "Sol Ring", amount: 100 }]));
  assert.throws(() =>
    assertTradeIns([
      { name: "Sol Ring", productId: id, quantity: 3, amount: 100 },
    ]),
  );
  assert.equal(
    assertTradeIns([
      { name: "Sol Ring", productId: id, quantity: 2, amount: 100 },
    ])[0].quantity,
    2,
  );
});
