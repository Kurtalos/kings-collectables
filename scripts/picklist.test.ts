import { test } from "node:test";
import assert from "node:assert/strict";
import { picklistCSV, csvCell, type PickLine } from "../src/lib/picklist";
import { parseCSV } from "../src/lib/csv";
const line: PickLine = {
  orderNumber: "KC-1",
  customerName: "Trader",
  productId: "one",
  cardName: "Sol Ring",
  variant: "CMM · Near mint · Non-foil",
  setCode: "cmm",
  collectorNumber: "396",
  condition: "Near mint",
  finish: "Non-foil",
  quantity: 2,
};
test("combined picklist totals include every order while retaining exact variant and order breakdown", () => {
  const csv = picklistCSV([
    line,
    { ...line, orderNumber: "KC-2", quantity: 3 },
    {
      ...line,
      productId: "two",
      finish: "Foil",
      variant: "CMM · Near mint · Foil",
      quantity: 1,
    },
  ]);
  const { rows } = parseCSV(csv);
  assert.equal(rows.length, 5);
  assert.equal(
    rows.find(
      (r) => r[0] === "COMBINED PICKING TOTAL" && r[5] === "Non-foil",
    )?.[7],
    "5",
  );
  assert.equal(rows.filter((r) => r[0] === "ORDER BREAKDOWN").length, 3);
  assert.ok(rows.some((r) => r[8] === "KC-1 | KC-2"));
  assert.ok(!csv.includes("cost_basis"));
});
test("CSV preserves commas, escaped quotes, Unicode and neutralises spreadsheet formulas", () => {
  const csv = picklistCSV([
    { ...line, cardName: '"Sol", Café', customerName: '=HYPERLINK("bad")' },
  ]);
  const { rows } = parseCSV(csv);
  assert.equal(rows[1][1], '"Sol", Café');
  assert.equal(rows[1][9], '\'=HYPERLINK("bad")');
  assert.equal(csvCell("\t=CMD()"), '"\'\t=CMD()"');
  assert.equal(csvCell(" +1"), '"\' +1"');
});
test("deleted product references remain distinguishable by historical variant", () => {
  const { rows } = parseCSV(
    picklistCSV([
      { ...line, productId: null },
      {
        ...line,
        productId: null,
        variant: "OLD · Foil",
        finish: null,
        setCode: null,
      },
    ]),
  );
  assert.equal(rows.filter((r) => r[0] === "COMBINED PICKING TOTAL").length, 2);
});

test("PDF separates orders and paginates long orders without dropping lines", async () => {
  const { picklistPDF } = await import("../src/lib/picklist-pdf");
  const pdf = await picklistPDF([line, { ...line, orderNumber: "KC-2", cardName: "Éowyn, Shieldmaiden" }]);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length, 2);
  const long = await picklistPDF(Array.from({ length: 100 }, (_, i) => ({ ...line, cardName: `Card ${i}`, productId: null, setCode: null })));
  assert.ok((long.toString("latin1").match(/\/Type \/Page\b/g) || []).length > 2);
  assert.ok(long.subarray(-20).toString().includes("%%EOF"));
});
