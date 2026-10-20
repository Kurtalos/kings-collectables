import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STORE_SETTINGS as defaults, validateStoreSettings, shippingCost, shippingMessage, STORE_THEMES, themeVariables } from "../src/lib/store-settings";
test("defaults preserve current shipping; custom rates respect exact threshold, zero and disabled", () => {
  assert.equal(shippingCost(9999, defaults), 895);
  assert.equal(shippingCost(10000, defaults), 0);
  const custom = { ...defaults, shippingFlat: 1200, freeShippingThreshold: 15000 };
  assert.equal(shippingCost(14999, custom), 1200);
  assert.equal(shippingCost(15000, custom), 0);
  assert.equal(shippingCost(999999, { ...custom, freeShippingThreshold: null }), 1200);
  assert.equal(shippingCost(0, { ...custom, freeShippingThreshold: 0 }), 0);
  assert.equal(shippingCost(0, { ...custom, shippingFlat: 0 }), 0);
  assert.equal(shippingMessage(custom), "Free shipping on orders $150+");
  assert.equal(shippingMessage({ ...custom, freeShippingThreshold: null }), "Tracked shipping $12");
});
test("settings trim public fields and validate cents, ABN, email and allowlisted themes", () => {
  assert.equal(validateStoreSettings({ ...defaults, storeName: " New name ", abn: "51 824 753 556" }).abn, "51824753556");
  for (const patch of [{ storeName: " " }, { abn: "123" }, { email: "javascript:alert(1)" }, { shippingFlat: -1 }, { shippingFlat: 1.5 }, { shippingFlat: "895" }, { freeShippingThreshold: 1000001 }, { theme: "__proto__" }, { theme: "<style>" }]) {
    assert.throws(() => validateStoreSettings({ ...defaults, ...patch }));
  }
  for (const theme of Object.keys(STORE_THEMES)) {
    const settings = validateStoreSettings({ ...defaults, theme });
    assert.match(themeVariables(settings.theme)["--wine"], /^#[a-f0-9]{6}$/);
  }
});

test("admin slogans support old settings, blanks and bounded plain text", () => {
  const { headerSlogan: _header, sidebarSlogan: _sidebar, ...legacy } = defaults;
  assert.equal(validateStoreSettings(legacy).headerSlogan, defaults.headerSlogan);
  assert.equal(validateStoreSettings(legacy).sidebarSlogan, defaults.sidebarSlogan);
  assert.equal(validateStoreSettings({ ...defaults, headerSlogan: "  Collect your way.  " }).headerSlogan, "Collect your way.");
  assert.equal(validateStoreSettings({ ...defaults, headerSlogan: "", sidebarSlogan: "" }).headerSlogan, "");
  assert.equal(validateStoreSettings({ ...defaults, headerSlogan: "", sidebarSlogan: "" }).sidebarSlogan, "");
  for (const patch of [{ headerSlogan: "x".repeat(161) }, { sidebarSlogan: "x".repeat(81) }, { headerSlogan: null }, { sidebarSlogan: 42 }, { headerSlogan: "bad\u0000text" }]) assert.throws(() => validateStoreSettings({ ...defaults, ...patch }));
});
