"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Eye, ArrowUp, ArrowDown, Trash2, Upload, LoaderCircle } from "lucide-react";
import { PAGE_BLOCK_LABELS, PAGE_STARTERS, starterPage, newPageBlock, pageURL, validSlug, validatePage, type ContentPage, type PageRecord, type PageBlock } from "@/lib/pages";
import type { Card, Collection } from "@/lib/types";
import { requestJSON } from "./ui";
import { PageRichEditor } from "./page-rich-editor";
import { PageBlocks } from "./page-blocks";
export function PagesEditor({ products, collections }: { products: Card[]; collections: Collection[] }) {
  const router = useRouter();
  const [records, setRecords] = useState<PageRecord[]>([]), [record, setRecord] = useState<PageRecord | null>(null), [draft, setDraft] = useState<ContentPage | null>(null);
  const [selected, setSelected] = useState(""), [version, setVersion] = useState(0), [reload, setReload] = useState(0);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState(""), [newSlug, setNewSlug] = useState(""), [kind, setKind] = useState<PageBlock["type"]>("rich"), [preview, setPreview] = useState(false), [mobile, setMobile] = useState(false);
  const [catalog, setCatalog] = useState({ products, collections });
  useEffect(() => {
    let cancelled = false;
    requestJSON<{ pages: PageRecord[] }>("/api/pages", { cache: "no-store" }).then(result => {
      if (!cancelled) { setRecords(result.pages); setRecord(result.pages[0]); setDraft(structuredClone(result.pages[0].draft)); setSelected(result.pages[0].draft.blocks[0].id); setLoading(false); }
    }).catch(error => { if (!cancelled) { setError(error instanceof Error ? error.message : "Unable to load pages."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reload]);
  const dirty = !!draft && !!record && JSON.stringify(draft) !== JSON.stringify(record.draft);
  const block = draft?.blocks.find(b => b.id === selected) || draft?.blocks[0];
  function choose(next: PageRecord) {
    if (dirty && !window.confirm("Discard unsaved edits on this page?")) return;
    setRecord(next); setDraft(structuredClone(next.draft)); setSelected(next.draft.blocks[0].id); setVersion(v => v + 1); setPreview(false); setError(""); setMessage("");
  }
  function editPage<K extends keyof ContentPage>(key: K, value: ContentPage[K]) { setDraft(current => current ? { ...current, [key]: value } : current); setMessage(""); }
  function editBlock<K extends keyof PageBlock>(key: K, value: PageBlock[K]) { if (!draft || !block) return; editPage("blocks", draft.blocks.map(b => b.id === block.id ? { ...b, [key]: value } : b)); }
  function create() {
    if (!newTitle.trim() || !validSlug(newSlug) || records.some(r => r.draft.slug === newSlug)) { setError("Choose a page title and a unique lowercase URL slug (letters, digits and hyphens)."); return; }
    const next = { draft: starterPage(newSlug, newTitle.trim()), published: null, revision: 0, publishedAt: null };
    if (dirty && !window.confirm("Discard unsaved edits before creating a page?")) return;
    setRecords(rows => [...rows, next]); setRecord(next); setDraft(structuredClone(next.draft)); setSelected(next.draft.blocks[0].id); setVersion(v => v + 1); setPreview(false); setNewTitle(""); setNewSlug(""); setError(""); setMessage("New page created locally. Save draft to keep it.");
  }
  async function action(action: "save" | "publish" | "unpublish" | "delete") {
    if (!draft || !record) return;
    if ((action === "unpublish" || action === "delete") && !window.confirm(action === "delete" ? "Delete this custom page and its published version? Links to it will stop working." : "Unpublish this page? The homepage returns to the original layout; other pages become unavailable.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestJSON<{ record: PageRecord | null }>("/api/pages", { method: "POST", body: JSON.stringify({ page: validatePage(action === "unpublish" || action === "delete" ? record.draft : draft), revision: record.revision, action }) });
      if (!result.record) { setLoading(true); setReload(v => v + 1); }
      else { const next = result.record; setRecords(rows => rows.map(r => r.draft.slug === next.draft.slug ? next : r)); setRecord(next); setDraft(structuredClone(next.draft)); setVersion(v => v + 1); setMessage(action === "save" ? "Draft saved. The live site has not changed." : action === "publish" ? "Page published. Refresh an already-open storefront to see it." : "Page unpublished. Your draft is retained."); }
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save page."); }
    finally { setBusy(false); }
  }
  async function showPreview() {
    if (!draft) return; setBusy(true); setError("");
    try { const result = await requestJSON<{ catalog: { products: Card[]; collections: Collection[] } }>("/api/pages", { method: "POST", body: JSON.stringify({ action: "preview", page: validatePage(draft) }) }); setCatalog(result.catalog); setPreview(true); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to preview page."); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || !block) return;
    if (file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP up to 8 MB."); return; }
    const id = block.id; setUploading(true); setError("");
    try { const result = await requestJSON<{ image: string }>("/api/carousel-images", { method: "POST", headers: { "Content-Type": file.type }, body: file }); setDraft(current => current ? { ...current, blocks: current.blocks.map(b => b.id === id ? { ...b, image: result.image } : b) } : current); setMessage("Image uploaded. Save draft or publish to keep the page change."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to upload image."); }
    finally { setUploading(false); }
  }
  if (loading) return <p role="status">Loading pages…</p>;
  if (!draft || !record || !block) return <div role="alert">{error}<button onClick={() => { setLoading(true); setReload(v => v + 1); }}>Retry loading pages</button></div>;
  return <div className="pages-manager">
    <div className="settings-intro"><Eye size={24}/><div><h2>Build your pages visually</h2><p>Format text, arrange sections and preview your work. Save drafts privately; publish only when ready. Checkout, accounts and inventory are protected.</p></div></div>
    {error && <p role="alert" className="form-error">{error} <button type="button" onClick={() => { if (!dirty || window.confirm("Discard unsaved edits and reload all pages?")) { setLoading(true); setReload(v => v + 1); setError(""); } }}>Reload Pages</button></p>}
    {message && <p role="status" className="pages-status">{message}</p>}
    <fieldset disabled={busy || uploading} className="pages-controls"><label>Choose page<select aria-label="Choose page" value={draft.slug} onChange={e => { const next = records.find(r => r.draft.slug === e.target.value); if (next) choose(next); }}>{records.map(r => <option value={r.draft.slug} key={r.draft.slug}>{r.draft.title} — {r.published ? "Published" : "Draft"}</option>)}</select></label><div className="pages-new"><label>New page title<input maxLength={100} value={newTitle} onChange={e => setNewTitle(e.target.value)}/></label><label>New URL slug<input maxLength={60} placeholder="our-story" value={newSlug} onChange={e => setNewSlug(e.target.value)}/></label><button className="button button-outline" type="button" onClick={create}><Plus size={15}/> Create page</button></div></fieldset>
    <div className="pages-editor-toolbar"><span><strong>{pageURL(draft.slug)}</strong> · {record.published ? "Published version exists" : "Not published"}{dirty ? " · Unsaved changes" : ""}</span><div><button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => preview ? setPreview(false) : void showPreview()}><Eye size={15}/>{preview ? "Back to editor" : "Preview page"}</button><button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => void action("save")}><Save size={15}/> Save draft</button><button type="button" className="button button-primary" disabled={busy || uploading} onClick={() => void action("publish")}>{busy ? <LoaderCircle className="spin" size={15}/> : <Upload size={15}/>} Publish page</button></div></div>
    {preview ? <div className="pages-preview"><div className="pages-preview-controls"><strong>Private preview — links and shopping actions disabled</strong><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></div><div className={`pages-preview-frame ${mobile ? "pages-preview-mobile" : ""}`}><PageBlocks page={draft} products={catalog.products} collections={catalog.collections} preview/></div></div> : <div className="pages-edit-fields" inert={busy || uploading || undefined}>
      <fieldset className="settings-section"><legend>Page details</legend><div className="settings-fields"><label>Page title<input required maxLength={100} value={draft.title} onChange={e => editPage("title", e.target.value)}/></label><label>Search description<textarea maxLength={300} value={draft.description} onChange={e => editPage("description", e.target.value)}/></label>{draft.slug !== "home" && <><label className="settings-check"><input type="checkbox" checked={draft.inHeader} onChange={e => editPage("inHeader", e.target.checked)}/> Link in header</label><label className="settings-check"><input type="checkbox" checked={draft.inFooter} onChange={e => editPage("inFooter", e.target.checked)}/> Link in footer</label></>}</div><p className="small muted">URL is fixed after creation. Custom pages live under /pages/ so they cannot replace protected application routes.</p></fieldset>
      <div className="pages-block-workspace"><aside className="pages-block-list"><h3>Sections · {draft.blocks.length}/30</h3>{draft.blocks.map((item, i) => <div className={`pages-block-row ${block.id === item.id ? "selected" : ""}`} key={item.id}><button type="button" className="pages-block-select" onClick={() => setSelected(item.id)}>{i + 1}. {item.title || PAGE_BLOCK_LABELS[item.type]}<small>{item.enabled ? "Visible" : "Hidden"}</small></button><div><button type="button" aria-label={`Move section ${i+1} up`} disabled={i === 0} onClick={() => { const next = [...draft.blocks]; [next[i], next[i-1]] = [next[i-1], next[i]]; editPage("blocks", next); }}><ArrowUp size={15}/></button><button type="button" aria-label={`Move section ${i+1} down`} disabled={i === draft.blocks.length-1} onClick={() => { const next = [...draft.blocks]; [next[i], next[i+1]] = [next[i+1], next[i]]; editPage("blocks", next); }}><ArrowDown size={15}/></button><button type="button" aria-label={`Remove section ${i+1}`} disabled={draft.blocks.length === 1} onClick={() => editPage("blocks", draft.blocks.filter(b => b.id !== item.id))}><Trash2 size={15}/></button></div></div>)}<label>Add section type<select aria-label="Add section type" value={kind} onChange={e => setKind(e.target.value as PageBlock["type"])}>{Object.entries(PAGE_BLOCK_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="button button-outline" disabled={draft.blocks.length >= 30} onClick={() => { const next = newPageBlock(kind, crypto.randomUUID()); editPage("blocks", [...draft.blocks, next]); setSelected(next.id); }}><Plus size={15}/> Add section</button></aside>
      <section className="pages-block-editor"><h3>{PAGE_BLOCK_LABELS[block.type]}</h3><label className="settings-check"><input type="checkbox" checked={block.enabled} onChange={e => editBlock("enabled", e.target.checked)}/> Show section</label><label>Section heading<input maxLength={160} value={block.title} onChange={e => editBlock("title", e.target.value)}/></label>
        {["rich", "image", "banner"].includes(block.type) && <PageRichEditor key={`${block.id}-${version}`} value={block.body} onChange={body => editBlock("body", body)}/>}
        {block.type === "image" && <><img className="pages-image-thumb" src={block.image} alt={block.alt || "Selected image"}/><label>Upload page image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label><small>JPEG / PNG / WebP, up to 8 MB. Uses the existing persistent carousel image storage.</small><label>Image description (alt text)<input required maxLength={250} value={block.alt} onChange={e => editBlock("alt", e.target.value)}/></label><label>Image alignment<select aria-label="Image alignment" value={block.alignment} onChange={e => editBlock("alignment", e.target.value as "left" | "right")}><option value="left">Left</option><option value="right">Right</option></select></label></>}
        {["rich", "image", "banner"].includes(block.type) && <div className="settings-fields"><label>Button label<input maxLength={60} value={block.button} onChange={e => editBlock("button", e.target.value)}/></label><label>Button link<input maxLength={300} placeholder="/cards or https://…" value={block.href} onChange={e => editBlock("href", e.target.value)}/></label></div>}
        {["products", "collections"].includes(block.type) && <div className="settings-fields"><label>Content source<select aria-label="Content source" value={block.source} onChange={e => editBlock("source", e.target.value)}>{block.type === "products" ? <><option value="featured">Featured products</option><option value="newest">Newest products</option></> : <option value="featured">All collections</option>}{collections.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label><label>Number to display<input type="number" min="1" max="12" value={block.limit} onChange={e => editBlock("limit", Number(e.target.value))}/></label></div>}
        {block.type === "carousel" && <p>Uses your published Homepage carousel configuration. Edit the slides in the Homepage carousel admin section.</p>}
        {["shipping", "contact", "benefits"].includes(block.type) && <p>This block uses live store settings, so contact details and shipping prices stay up to date.</p>}
      </section></div>
    </div>}
    <div className="pages-bottom-actions"><button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => { if (!dirty || window.confirm("Discard unsaved page edits?")) { setDraft(structuredClone(record.draft)); setVersion(v => v + 1); setMessage(""); setError(""); } }}>Discard edits</button>{record.published && <><a href={pageURL(draft.slug)} target="_blank" rel="noreferrer" className="button button-outline">View live page</a><button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => void action("unpublish")}>Unpublish</button></>}{!PAGE_STARTERS.some(p => p.slug === draft.slug) && <button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => void action("delete")}>Delete page</button>}{uploading && <span role="status">Uploading image…</span>}</div>
  </div>;
}
