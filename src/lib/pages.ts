import { validCarouselImage } from "./homepage-carousel";
export type RichNode = { type: string; text?: string; attrs?: { level?: number; start?: number; href?: string }; marks?: { type: string; attrs?: { href: string } }[]; content?: RichNode[] };
export type PageBlock = { id: string; type: "rich" | "image" | "banner" | "collections" | "products" | "carousel" | "benefits" | "sets" | "discovery" | "contact" | "shipping"; enabled: boolean; title: string; body: RichNode; image: string; alt: string; alignment: "left" | "right"; button: string; href: string; source: string; limit: number };
export type ContentPage = { slug: string; title: string; description: string; inHeader: boolean; inFooter: boolean; blocks: PageBlock[] };
export type PageRecord = { draft: ContentPage; published: ContentPage | null; revision: number; publishedAt: string | null };
export type PageNav = { slug: string; title: string; inHeader: boolean; inFooter: boolean };
export const PAGE_BLOCK_LABELS: Record<PageBlock["type"], string> = { rich: "Formatted text", image: "Image & text", banner: "Promotion banner", collections: "Collections", products: "Product grid", carousel: "Homepage carousel", benefits: "Store benefits", sets: "Featured sets", discovery: "Discovery links", contact: "Live contact details", shipping: "Live shipping rates" };
export const validSlug = (slug: unknown): slug is string => typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60;
export const pageURL = (slug: string) => slug === "home" ? "/" : `/pages/${slug}`;
export function safePageLink(value: string) {
  if (!value || /[\u0000-\u0020\\<>"']/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return new URL(value, "https://store.invalid").origin === "https://store.invalid";
  return /^https:\/\/[^/\s]+/i.test(value) && (() => { try { const url = new URL(value); return !url.username && !url.password; } catch { return false; } })();
}
export function richText(text = ""): RichNode { return { type: "doc", content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }] }; }
export function newPageBlock(type: PageBlock["type"], id: string): PageBlock {
  return { id, type, enabled: true, title: type === "rich" ? "" : PAGE_BLOCK_LABELS[type], body: richText("Add your content here."), image: "/images/vault-hero.jpg", alt: "", alignment: "left", button: "", href: "", source: "featured", limit: 6 };
}
export function starterPage(slug: string, title: string): ContentPage {
  const types: PageBlock["type"][] = slug === "home" ? ["carousel", "benefits", "sets", "products", "discovery"] : slug === "shipping" ? ["shipping", "rich"] : slug === "contact" ? ["contact", "rich"] : ["rich"];
  return { slug, title, description: "", inHeader: false, inFooter: slug !== "home", blocks: types.map((type, i) => ({ ...newPageBlock(type, `starter-${i}`), body: richText(slug === "home" ? "" : `Add your ${title.toLowerCase()} content here before publishing.`) })) };
}
export const PAGE_STARTERS = [starterPage("home", "Home"), starterPage("about-us", "About us"), starterPage("shipping", "Shipping & delivery"), starterPage("returns", "Returns"), starterPage("faq", "FAQs"), starterPage("contact", "Contact us")];
function cleanText(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value) || (required && !value.trim())) throw new Error(`Check ${label} (maximum ${max} characters).`);
  return value.trim();
}
export function validateRichText(input: unknown): RichNode {
  let nodes = 0, chars = 0;
  function parse(value: unknown, depth: number): RichNode {
    if (++nodes > 2000 || depth > 16 || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rich text is too large or invalid.");
    const node = value as Record<string, unknown>, type = String(node.type);
    if (!["doc", "paragraph", "heading", "text", "bulletList", "orderedList", "listItem", "blockquote", "hardBreak", "horizontalRule"].includes(type)) throw new Error("Unsupported rich-text content. Paste plain text instead.");
    const out: RichNode = { type };
    if (type === "text") {
      if (typeof node.text !== "string" || !node.text.length || /[\u0000-\u0008\u000b-\u001f]/.test(node.text)) throw new Error("Invalid rich text.");
      chars += node.text.length; if (chars > 20000) throw new Error("Keep text below 20,000 characters per section.");
      out.text = node.text;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 5) throw new Error("Invalid text formatting.");
        out.marks = node.marks.map((mark: { type?: string; attrs?: { href?: string } }) => {
          if (!mark || !["bold", "italic", "underline", "strike", "link"].includes(mark.type || "")) throw new Error("Unsupported text formatting.");
          if (mark.type === "link") { const href = cleanText(mark.attrs?.href, "text link", 300, true); if (!safePageLink(href)) throw new Error("Use store paths or HTTPS links."); return { type: "link", attrs: { href } }; }
          return { type: mark.type! };
        });
      }
    } else {
      if (type === "heading") { const level = (node.attrs as { level?: number })?.level; if (level !== 2 && level !== 3) throw new Error("Use heading levels 2 or 3."); out.attrs = { level }; }
      if (type === "orderedList") out.attrs = { start: 1 };
      if (node.content !== undefined) { if (!Array.isArray(node.content)) throw new Error("Invalid text content."); out.content = node.content.map(child => parse(child, depth + 1)); }
      const allowed = type === "doc" || type === "blockquote" ? ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule"] : type === "bulletList" || type === "orderedList" ? ["listItem"] : type === "listItem" ? ["paragraph", "bulletList", "orderedList"] : type === "paragraph" || type === "heading" ? ["text", "hardBreak"] : [];
      if (out.content?.some(child => !allowed.includes(child.type))) throw new Error("Invalid rich-text structure.");
    }
    return out;
  }
  const result = parse(input, 0); if (result.type !== "doc") throw new Error("Rich text must be a document."); return result;
}
export function validatePage(input: unknown): ContentPage {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send a valid page.");
  const p = input as ContentPage;
  if (!validSlug(p.slug)) throw new Error("Use a URL slug with lowercase letters, digits and hyphens (up to 60 characters).");
  if (typeof p.inHeader !== "boolean" || typeof p.inFooter !== "boolean") throw new Error("Check navigation options.");
  if (!Array.isArray(p.blocks) || !p.blocks.length || p.blocks.length > 30) throw new Error("Keep between 1 and 30 sections.");
  const ids = new Set<string>();
  const blocks = p.blocks.map(b => {
    if (!b || !Object.hasOwn(PAGE_BLOCK_LABELS, b.type) || typeof b.enabled !== "boolean") throw new Error("Choose a supported section type.");
    const id = cleanText(b.id, "section ID", 80, true); if (!/^[a-zA-Z0-9-]+$/.test(id) || ids.has(id)) throw new Error("Section IDs must be unique."); ids.add(id);
    const image = cleanText(b.image, "image", 200); if (image && !validCarouselImage(image)) throw new Error("Upload an image or choose existing artwork.");
    if (b.type === "image" && (!image || !b.alt?.trim())) throw new Error("Image sections need an image and accessible image description.");
    const button = cleanText(b.button, "button label", 60), href = cleanText(b.href, "button link", 300);
    if (Boolean(button) !== Boolean(href) || (href && !safePageLink(href))) throw new Error("Buttons need a label and a store path or HTTPS link.");
    if (!["left", "right"].includes(b.alignment)) throw new Error("Choose an image alignment.");
    if (!Number.isInteger(b.limit) || b.limit < 1 || b.limit > 12) throw new Error("Show between 1 and 12 products/collections.");
    const source = cleanText(b.source, "collection source", 80, true); if (!/^[a-z0-9-]+$/.test(source)) throw new Error("Choose a collection source.");
    return { id, type: b.type, enabled: b.enabled, title: cleanText(b.title, "section heading", 160), body: validateRichText(b.body), image, alt: cleanText(b.alt, "image description", 250), alignment: b.alignment, button, href, source, limit: b.limit };
  });
  if (!blocks.some(b => b.enabled)) throw new Error("Keep at least one section visible.");
  return { slug: p.slug, title: cleanText(p.title, "page title", 100, true), description: cleanText(p.description, "SEO description", 300), inHeader: p.slug !== "home" && p.inHeader, inFooter: p.slug !== "home" && p.inFooter, blocks };
}
