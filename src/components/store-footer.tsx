"use client";
import { StoreBusinessDetails } from "./store-business-details";
import { useStoreSettings, usePageNavigation, useSiteChrome } from "./store-settings-provider";
import { RichContent } from "./page-blocks";
import { chromeTokens, INFO_LABELS, INFO_PAGES, type ChromeInfo, type ChromeLink } from "@/lib/site-chrome";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Sparkles, Check, LoaderCircle } from "lucide-react";
import { Brand, requestJSON } from "./ui";
import type { InfoType } from "./store-info";
export function StoreFooter({ onInfo }: { onInfo: (type: InfoType) => void }) {
  const settings = useStoreSettings(), chrome = useSiteChrome();
  const pages = usePageNavigation().filter(page => page.inFooter);
  const extras = chrome.footerPages ? pages.filter(p=>!chrome.footerColumns.some(c=>c.links.some(l=>(l.href===`/pages/${p.slug}` || INFO_PAGES[l.kind as ChromeInfo]===p.slug)))) : [];
  function navigationLink(item:ChromeLink){
    const page=pages.find(p=>p.slug===INFO_PAGES[item.kind as ChromeInfo]);
    return item.kind==="link" ? <Link key={item.id} href={item.href}>{item.label}</Link> : page ? <Link key={item.id} href={`/pages/${page.slug}`}>{item.label===INFO_LABELS[item.kind as ChromeInfo] ? page.title:item.label}</Link> : <button key={item.id} onClick={()=>onInfo(item.kind as ChromeInfo)}>{item.label}</button>;
  }
  const [busy, setBusy] = useState(false), [joined, setJoined] = useState(false), [error, setError] = useState("");
  async function subscribe(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); try { await requestJSON("/api/newsletter", { method: "POST", body: JSON.stringify({ email: form.get("email") }) }); setJoined(true); } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); } }
  return <><section className="container newsletter-section"><div className="newsletter-sparkle"><Sparkles size={34}/><span>♔</span></div><div className="newsletter-copy"><span className="eyebrow">GOOD THINGS COME TO COLLECTORS</span><h2>A little magic in your inbox.</h2><p>Fresh cards, new sets, and something worth getting excited about.</p></div><div className="newsletter-form-area">{joined ? <div className="newsletter-success"><Check size={22}/><div><strong>You’re on the list.</strong><span>Thanks for being part of the gathering.</span></div></div> : <form onSubmit={subscribe}><div className="newsletter-input"><input name="email" type="email" aria-label="Your email for store updates" required placeholder="Your email address" maxLength={254}/><button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <>Count me in <ArrowRight size={16}/></>}</button></div>{error ? <p className="form-error" role="alert">{error}</p> : <p className="newsletter-fineprint">Just the good stuff. Your details stay with this store.</p>}</form>}</div></section><footer className="store-footer"><div className="container footer-main" style={{"--footer-columns":Math.max(chrome.footerColumns.length,extras.length ? 1:0)} as CSSProperties}><div className="footer-brand"><Brand/><div className="chrome-footer-intro"><RichContent doc={chromeTokens(chrome.footerIntro,settings.storeName,new Date().getFullYear())}/></div>{chrome.footerOrigin && <span className="footer-australian">{chrome.footerOrigin}</span>}<StoreBusinessDetails/></div>{chrome.footerColumns.map((column,index)=><div className="footer-links" key={column.id}><h4>{column.title}</h4>{column.links.filter(l=>l.enabled).map(navigationLink)}{index===chrome.footerColumns.length-1 && extras.map(page=><Link key={`page-${page.slug}`} href={`/pages/${page.slug}`}>{page.title}</Link>)}</div>)}{!chrome.footerColumns.length && extras.length>0 && <div className="footer-links"><h4>Pages</h4>{extras.map(page=><Link key={page.slug} href={`/pages/${page.slug}`}>{page.title}</Link>)}</div>}</div><div className="container footer-bottom"><div className="chrome-copyright"><RichContent doc={chromeTokens(chrome.copyright,settings.storeName,new Date().getFullYear())}/></div><div className="chrome-disclaimer"><RichContent doc={chromeTokens(chrome.disclaimer,settings.storeName,new Date().getFullYear())}/></div><span className="footer-currency">AUD $</span></div></footer></>;
}
