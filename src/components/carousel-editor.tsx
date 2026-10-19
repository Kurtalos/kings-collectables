"use client";
import Image from "next/image";
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Plus, Trash2, Upload, Save, LoaderCircle, Check } from "lucide-react";
import { useHomepageCarousel } from "./store-settings-provider";
import { HomepageCarousel } from "./homepage-carousel";
import { DEFAULT_CAROUSEL, validateCarousel, type CarouselSlide } from "@/lib/homepage-carousel";
import { requestJSON } from "./ui";
export function CarouselEditor() {
  const initial = useHomepageCarousel(), router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [loadKey, setLoadKey] = useState(0);
  const [slides, setSlides] = useState(saved.map(slide => ({ ...slide })));
  const [selected, setSelected] = useState(saved[0].id);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    requestJSON<{ slides: CarouselSlide[] }>("/api/homepage-carousel", { cache: "no-store" }).then(result => {
      if (!cancelled) { setSaved(result.slides); setSlides(result.slides.map(slide => ({ ...slide }))); setSelected(result.slides[0].id); setLoading(false); }
    }).catch(error => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : "Unable to load slides."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [loadKey]);
  const current = slides.find(slide => slide.id === selected) || slides[0];
  const dirty = JSON.stringify(saved) !== JSON.stringify(slides);
  function change<K extends keyof CarouselSlide>(key: K, value: CarouselSlide[K]) {
    setSlides(rows => rows.map(row => row.id === current.id ? { ...row, [key]: value } : row)); setMessage("");
  }
  function move(index: number, delta: number) {
    setSlides(rows => { const next = [...rows]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); setMessage("");
  }
  function add() {
    const slide = { ...DEFAULT_CAROUSEL[0], id: crypto.randomUUID(), title: "Your new promotion", description: "", eyebrow: "", secondary: "", secondHref: "" };
    setSlides(rows => [...rows, slide]); setSelected(slide.id); setMessage("");
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    const id = current.id;
    setError(""); setMessage("");
    if (file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP up to 8 MB."); return; }
    setUploading(true);
    try {
      const result = await requestJSON<{ image: string }>("/api/carousel-images", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      setSlides(rows => rows.map(row => row.id === id ? { ...row, image: result.image } : row));
      setMessage("Image uploaded. Save carousel to publish it.");
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      const validated = validateCarousel(slides);
      const result = await requestJSON<{ slides: CarouselSlide[] }>("/api/homepage-carousel", { method: "PUT", body: JSON.stringify({ slides: validated }) });
      setSaved(result.slides); setSlides(result.slides); setMessage("Carousel saved. Refresh an already-open homepage to see the changes."); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save carousel."); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading carousel…</p>;
  if (loadError) return <div role="alert"><p>{loadError}</p><button className="button button-outline" onClick={() => { setLoadError(""); setLoading(true); setLoadKey(value => value + 1); }}>Retry loading carousel</button></div>;
  return <form className="carousel-editor" onSubmit={submit}>
    <div className="settings-intro"><Upload size={24}/><div><h2>Your homepage, your promotions</h2><p>Edit up to 12 slides. Upload images, change copy and links, then arrange the order. Nothing goes live until you save.</p></div></div>
    <div className="carousel-workspace"><fieldset disabled={busy || uploading} className="carousel-slide-list"><legend>Slides · {slides.length}/12</legend>{slides.map((slide, index) => <div className={`carousel-slide-row ${current.id === slide.id ? "selected" : ""}`} key={slide.id}>
      <button type="button" className="carousel-select" onClick={() => setSelected(slide.id)} aria-pressed={current.id === slide.id}><Image unoptimized width={60} height={52} src={slide.image} alt="" onError={e => { e.currentTarget.src = "/favicon.svg"; }}/><span><strong>{index + 1}. {slide.title || "Untitled slide"}</strong><small>{slide.enabled ? "Visible" : "Hidden"}</small></span></button>
      <div className="carousel-row-actions"><button type="button" aria-label={`Move slide ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button type="button" aria-label={`Move slide ${index + 1} down`} disabled={index === slides.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16}/></button><button type="button" aria-label={`Remove slide ${index + 1}`} disabled={slides.length === 1} onClick={() => { setSlides(rows => rows.filter(row => row.id !== slide.id)); setMessage(""); }}><Trash2 size={16}/></button></div>
    </div>)}<button type="button" className="button button-outline" disabled={slides.length >= 12} onClick={add}><Plus size={16}/> Add slide</button></fieldset>
    <fieldset className="carousel-slide-form" disabled={busy || uploading}><legend>Edit selected slide</legend><label className="settings-check"><input type="checkbox" checked={current.enabled} onChange={e => change("enabled", e.target.checked)}/> Show this slide on the homepage</label>
      <div className="carousel-upload"><Image key={current.image} unoptimized width={960} height={480} src={current.image} alt="Selected slide artwork" onError={e => { e.currentTarget.src = "/favicon.svg"; }}/><label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label><small>JPEG, PNG or WebP · up to 8 MB / 40 megapixels. Recommended: wide artwork around 1920 × 900. Images are optimised and metadata removed.</small></div>
      <label>Built-in artwork<select value={DEFAULT_CAROUSEL.some(slide => slide.image === current.image) ? current.image : "uploaded"} onChange={e => { if (e.target.value !== "uploaded") change("image", e.target.value); }}><option value="uploaded" disabled>Uploaded image</option>{DEFAULT_CAROUSEL.map(slide => <option key={slide.id} value={slide.image}>{slide.title.replace(/\n/g, " ")}</option>)}</select></label>
      <label>Eyebrow / small heading<input aria-label="Eyebrow / small heading" maxLength={100} value={current.eyebrow} onChange={e => change("eyebrow", e.target.value)}/><small>Leave blank to use your store name.</small></label>
      <label>Slide title<textarea aria-label="Slide title" required maxLength={160} rows={3} value={current.title} onChange={e => change("title", e.target.value)}/><small>Use a new line to control the heading layout.</small></label>
      <label>Description<textarea maxLength={400} rows={3} value={current.description} onChange={e => change("description", e.target.value)}/></label>
      <div className="settings-fields"><label>Primary button label<input maxLength={60} value={current.primary} onChange={e => change("primary", e.target.value)}/></label><label>Primary button link<input maxLength={300} placeholder="/cards?set=blb" value={current.href} onChange={e => change("href", e.target.value)}/></label><label>Secondary button label<input maxLength={60} value={current.secondary} onChange={e => change("secondary", e.target.value)}/></label><label>Secondary button link<input maxLength={300} placeholder="/cards" value={current.secondHref} onChange={e => change("secondHref", e.target.value)}/></label></div><p className="muted small">Use paths within this store, such as /cards. To hide a button, clear both its label and link.</p>
      <div className="settings-fields"><label>Image focus — horizontal: {current.focalX}%<input type="range" min="0" max="100" value={current.focalX} onChange={e => change("focalX", Number(e.target.value))}/></label><label>Image focus — vertical: {current.focalY}%<input type="range" min="0" max="100" value={current.focalY} onChange={e => change("focalY", Number(e.target.value))}/></label></div>
    </fieldset></div>
    <div className="carousel-preview-heading"><h3>Selected slide preview</h3><p>{current.enabled ? "Visible after saving" : "Hidden on the homepage"} · Preview links are disabled</p></div><HomepageCarousel slides={[current]} preview/>
    <div className="settings-save">{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status"><Check size={17}/>{message}</p>}{uploading && <p role="status"><LoaderCircle size={16} className="spin"/> Uploading and optimising image…</p>}<div><span>{dirty ? "Unsaved carousel changes" : "Carousel is up to date"}</span><button type="button" className="button button-outline" disabled={busy || uploading} onClick={() => { setSlides(saved.map(slide => ({ ...slide }))); setSelected(saved[0].id); setError(""); setMessage(""); }}>Discard changes</button><button className="button button-primary" disabled={busy || uploading}><Save size={16}/>{busy ? "Saving…" : "Save carousel"}</button></div></div>
  </form>;
}
