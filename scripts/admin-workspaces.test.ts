import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_SECTIONS, adminSectionFor } from "../src/lib/admin-navigation";
import { insightPaging, insightsCSV, demandCSV } from "../src/lib/admin-insights";
import { parseCSV } from "../src/lib/csv";
test("four admin sections own every tool once and defaults stay inside their section", () => {
  assert.deepEqual(ADMIN_SECTIONS.map(s => s.label), ["Store", "Inventory", "Customers", "Orders"]);
  const tabs = ADMIN_SECTIONS.flatMap(s => s.tabs);
  assert.equal(new Set(tabs).size, 14); assert.equal(tabs.length, 14);
  for (const section of ADMIN_SECTIONS) { assert.ok(section.tabs.includes(section.defaultTab)); for (const tab of section.tabs) assert.equal(adminSectionFor(tab).id, section.id); }
  assert.equal(adminSectionFor("picklist").id, "orders"); assert.equal(adminSectionFor("demand").id, "inventory");
});
test("insight paging rejects malformed pages and treats wildcard searches literally", () => {
  assert.equal(insightPaging(new URLSearchParams()).page, 1);
  assert.equal(insightPaging(new URLSearchParams({ q: "50%_\\" })).pattern, "%50\\%\\_\\\\%");
  for (const page of ["NaN","-1","1.2","100001"]) assert.throws(() => insightPaging(new URLSearchParams({ page })));
  assert.throws(() => insightPaging(new URLSearchParams({ q: "x".repeat(121) })));
});
test("insight exports preserve variants and neutralise spreadsheet formulas", () => {
  assert.equal(parseCSV(insightsCSV(["email"], [["=FORMULA@example.invalid"]])).rows[0][0], "'=FORMULA@example.invalid");
  const csv = demandCSV([{ productId:"one",name:'Card, "Café"',setName:"Test",setCode:"tst",collectorNumber:"001",condition:"Near mint",finish:"Foil",quantity:0,interested:3,oldest:"2026-10-01T00:00:00Z",newest:"2026-10-20T00:00:00Z" }]);
  const row = parseCSV(csv).rows[0]; assert.equal(row[0], 'Card, "Café"'); assert.equal(row[2], "001"); assert.equal(row[4], "Foil"); assert.equal(row[6], "3"); assert.ok(!csv.includes("email"));
});
