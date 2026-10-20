import { STORE_THEMES, themeVariables, type StoreTheme } from "./store-settings";
export const COLOR_FIELDS = { accent: "Accent", hover: "Accent hover", highlight: "Highlight", soft: "Soft panels", paper: "Page background", dark: "Header & footer" } as const;
export type ColorKey = keyof typeof COLOR_FIELDS;
export type BrandColors = Record<ColorKey, string>;
export type Branding = {
  preset: StoreTheme | null; customColors: boolean; colors: BrandColors;
  logo: string; darkLogo: string; favicon: string; logoMode: "image" | "with-name"; logoWidth: number;
  displayFont: "serif" | "sans"; buttonShape: "sharp" | "soft" | "rounded";
  tagline: string; description: string;
};
export type BrandingRecord = { settings: Branding; revision: number };
export const BRAND_IMAGE_PATTERN = /^\/api\/branding-images\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(webp|png)$/;
export const isHex = (value: unknown): value is string => typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
export function presetColors(theme: StoreTheme): BrandColors {
  const p = STORE_THEMES[theme];
  return { accent: p.accent, hover: p.hover, highlight: p.highlight, soft: p.soft, paper: p.paper, dark: theme === "christmas" ? "#102b20" : theme === "halloween" ? "#171022" : "#0c0c0d" };
}
export const DEFAULT_BRANDING: Branding = { preset: null, customColors: false, colors: presetColors("classic"), logo: "", darkLogo: "", favicon: "", logoMode: "image", logoWidth: 160, displayFont: "serif", buttonShape: "soft", tagline: "", description: "" };
export function validateBranding(input: unknown): Branding {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send valid branding settings.");
  const b = input as Record<string, unknown>;
  if (b.preset !== null && (typeof b.preset !== "string" || !Object.hasOwn(STORE_THEMES, b.preset))) throw new Error("Choose a supported preset.");
  if (typeof b.customColors !== "boolean") throw new Error("Choose whether to use custom colours.");
  if (!b.colors || typeof b.colors !== "object" || Array.isArray(b.colors)) throw new Error("Choose valid colours.");
  const raw = b.colors as Record<string, unknown>, colors = {} as BrandColors;
  for (const key of Object.keys(COLOR_FIELDS) as ColorKey[]) { if (!isHex(raw[key])) throw new Error(`Use a six-digit hex colour for ${COLOR_FIELDS[key]}.`); colors[key] = raw[key].toLowerCase(); }
  for (const key of ["logo", "darkLogo", "favicon"] as const) {
    if (typeof b[key] !== "string" || (b[key] && (!BRAND_IMAGE_PATTERN.test(b[key]) || !b[key].endsWith(key === "favicon" ? ".png" : ".webp")))) throw new Error("Use a logo or icon uploaded through the branding editor.");
  }
  if (!["image", "with-name"].includes(String(b.logoMode)) || !["serif", "sans"].includes(String(b.displayFont)) || !["sharp", "soft", "rounded"].includes(String(b.buttonShape))) throw new Error("Choose valid branding options.");
  if (!Number.isInteger(b.logoWidth) || Number(b.logoWidth) < 80 || Number(b.logoWidth) > 220) throw new Error("Logo width must be between 80 and 220 pixels.");
  const text = (key: string, max: number) => { if (typeof b[key] !== "string" || b[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b[key])) throw new Error(`Check ${key} (maximum ${max} characters).`); return (b[key] as string).trim().replace(/\s+/g," "); };
  return { preset: b.preset as StoreTheme | null, customColors: b.customColors, colors, logo: b.logo as string, darkLogo: b.darkLogo as string, favicon: b.favicon as string, logoMode: b.logoMode as Branding["logoMode"], logoWidth: Number(b.logoWidth), displayFont: b.displayFont as Branding["displayFont"], buttonShape: b.buttonShape as Branding["buttonShape"], tagline: text("tagline", 120), description: text("description", 320) };
}
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => { const c = hex.slice(1).match(/../g)!.map(v => parseInt(v,16)/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4); return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722; };
  const l = [luminance(a),luminance(b)].sort((x,y)=>y-x); return (l[0]+0.05)/(l[1]+0.05);
}
export const readableText = (background: string) => contrast(background,"#000000") >= contrast(background,"#ffffff") ? "#000000" : "#ffffff";
export function effectiveColors(b: Branding, fallback: StoreTheme) {
  const base = presetColors(b.preset ?? fallback);
  return Object.fromEntries(Object.entries(base).map(([key,value]) => [key,b.customColors && isHex(b.colors[key as ColorKey]) ? b.colors[key as ColorKey] : value])) as BrandColors;
}
export function brandingVariables(b: Branding, fallback: StoreTheme): Record<string, string> {
  const c = effectiveColors(b, fallback), theme = b.preset ?? fallback;
  // Allowlisted tokens only: no arbitrary CSS, font URLs or scripts.
  return { ...themeVariables(theme), ...(b.customColors ? { "--wine":c.accent,"--wine-dark":c.hover,"--gold":c.highlight,"--rose":c.soft,"--paper":c.paper,"--black":c.dark,"--accent-text":readableText(c.accent),"--theme-muted-accent":c.accent } : {}), "--brand-hover-text": b.customColors ? readableText(c.hover) : STORE_THEMES[theme].text, "--on-dark": readableText(c.dark), "--brand-button-radius": { sharp:"0px",soft:"5px",rounded:"18px" }[b.buttonShape], "--serif": b.displayFont === "sans" ? "Manrope, Arial, sans-serif" : "'Instrument Serif', Georgia, serif" };
}
export function rgbToHSV(hex: string) {
  const [r,g,b] = hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255), max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  const h = d===0 ? 0 : max===r ? ((g-b)/d)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4;
  return { h:(h*60+360)%360,s:max===0 ? 0 : d/max,v:max };
}
export function hsvToHex(h: number,s: number,v: number) {
  const f=(n:number)=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1));};
  return "#"+[f(5),f(3),f(1)].map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join("");
}
