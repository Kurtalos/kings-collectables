"use client";
import { useStoreSettings, useBranding } from "./store-settings-provider";
import type { StoreTheme } from "@/lib/store-settings";
import Link from "next/link";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { X, ArrowUpRight, TreePine, Ghost } from "lucide-react";

export function ThemeMotif({ theme }: { theme: StoreTheme }) {
  return theme === "christmas" ? <TreePine size={16} aria-hidden="true"/> : theme === "halloween" ? <Ghost size={16} aria-hidden="true"/> : null;
}
export function Brand({ light = false, small = false, surface = "dark" }: { light?: boolean; small?: boolean; surface?: "dark" | "light" }) {
  const { storeName } = useStoreSettings();
  const branding = useBranding(), image = surface === "dark" ? branding.darkLogo || branding.logo : branding.logo;
  if (image) return <Link href="/" data-brand-surface={surface} className={`brand brand-uploaded ${small ? "brand-small" : ""} ${branding.logoMode === "with-name" ? "brand-with-name" : ""}`} style={{ "--brand-logo-width": `${branding.logoWidth}px` } as CSSProperties} aria-label={`${storeName} home`}><img className="brand-image" src={image} alt=""/>{branding.logoMode === "with-name" && <span className="custom-brand-name">{storeName}</span>}</Link>;
  return <Link href="/" className={`brand ${light ? "brand-light" : ""} ${small ? "brand-small" : ""}`} aria-label={`${storeName} home`}><svg className="brand-mark" viewBox="0 0 46 46" fill="none" aria-hidden="true"><path d="M8 18 15 10l8 7 8-7 7 8-4 16H12L8 18Z" fill="currentColor"/><path d="M12 34h22v4H12z" fill={light ? "#111" : "var(--gold)"}/><path d="M23 16 26.5 24h-7L23 16Z" fill={light ? "#111" : "var(--gold)"}/></svg><span>{storeName === "Kings Collectables" ? <>KINGS<span className="brand-second">COLLECTABLES</span></> : <span className="custom-brand-name">{storeName}</span>}</span></Link>;
}
export function Modal({ children, title, onClose, wide = false, drawer = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean; drawer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow; document.body.style.overflow = "hidden";
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]') || [])].filter(element => !element.hasAttribute("disabled") && element.offsetParent !== null);
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") { const targets = focusable(), first = targets[0], last = targets.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener("keydown", handle);
    return () => { document.body.style.overflow = before; document.removeEventListener("keydown", handle); prior?.focus(); };
  }, []);
  return <div className={`modal-backdrop ${drawer ? "drawer-backdrop" : ""}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} className={`modal-panel ${wide ? "modal-wide" : ""} ${drawer ? "drawer-panel" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div>{children}</div></div>;
}
export function SectionLink({ href, children }: { href: string; children: ReactNode }) { return <Link className="section-link" href={href}>{children}<ArrowUpRight size={16}/></Link>; }
export function EmptyState({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{children}</div>; }
export async function requestJSON<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}
