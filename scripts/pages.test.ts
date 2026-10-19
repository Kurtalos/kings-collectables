import { test } from "node:test";
import assert from "node:assert/strict";
import { starterPage, newPageBlock, richText, validatePage, validateRichText, safePageLink, pageURL } from "../src/lib/pages";
test("pages validate safe URLs, section structure, accessible images and visibility", () => {
  const page = starterPage("test-page", "Test page");
  assert.equal(validatePage(page).slug, "test-page");
  for (const slug of ["../admin", "UPPER", "x/y", ""]) assert.throws(() => validatePage({ ...page, slug }));
  assert.equal(pageURL("checkout"), "/pages/checkout");
  assert.equal(pageURL("home"), "/");
  assert.throws(() => validatePage({ ...page, blocks: [] }));
  assert.throws(() => validatePage({ ...page, blocks: [page.blocks[0], page.blocks[0]] }));
  assert.throws(() => validatePage({ ...page, blocks: [{ ...page.blocks[0], enabled: false }] }));
  assert.throws(() => validatePage({ ...page, blocks: [newPageBlock("image", "image-1")] }));
  assert.equal(validatePage({ ...page, blocks: [{ ...newPageBlock("image", "image-1"), alt: "A display of cards" }] }).blocks[0].alt, "A display of cards");
  for (const link of ["javascript:alert(1)", "data:text/html,bad", "//evil.invalid", "/\\evil.invalid", "http://evil.invalid", "https://user:pass@example.com"]) assert.equal(safePageLink(link), false);
  for (const link of ["/cards?set=blb", "https://example.com/info"]) assert.equal(safePageLink(link), true);
});
test("rich text allowlist removes raw attributes and rejects executable nodes and unsafe links", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "bad" }, content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/cards", onclick: "bad" } }] }] }] };
  const safe = validateRichText(doc);
  assert.ok(!JSON.stringify(safe).includes("onclick"));
  assert.throws(() => validateRichText({ type: "doc", content: [{ type: "script", text: "alert(1)" }] }));
  assert.throws(() => validateRichText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }));
  assert.throws(() => validateRichText({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }));
  assert.throws(() => validateRichText(richText("x".repeat(20001))));
  assert.equal(validateRichText(richText("<script>literal text</script>")).content?.[0].content?.[0].text, "<script>literal text</script>");
});
