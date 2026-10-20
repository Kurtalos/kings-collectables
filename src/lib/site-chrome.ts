import { richText, safePageLink, validateRichText, type RichNode } from "./pages";
import { SHOP_SETS } from "./store-config";
export type ChromeInfo = "story" | "shipping" | "conditions" | "contact" | "faq" | "tracker";
export type ChromeLink = { id: string; label: string; kind: "link" | "sets" | ChromeInfo; href: string; enabled: boolean };
export type FooterColumn = { id: string; title: string; links: ChromeLink[] };
export type SiteChrome = {
  announcementMode: "automatic" | "custom" | "hidden"; announcement: RichNode;
  origin: string; dashboardLabel: string; searchPlaceholder: string; navTagline: string;
  headerLinks: ChromeLink[]; setLinks: ChromeLink[]; setHeading: string; headerPages: boolean;
  footerIntro: RichNode; footerOrigin: string; footerColumns: FooterColumn[]; footerPages: boolean;
  copyright: RichNode; disclaimer: RichNode;
};
export type ChromeRecord = { draft: SiteChrome; published: SiteChrome | null; revision: number; publishedAt: string | null };
const link = (id: string, label: string, href: string, kind: ChromeLink["kind"] = "link"): ChromeLink => ({ id, label, href, kind, enabled: true });
export const INFO_LABELS: Record<ChromeInfo,string> = { story:"Our story",shipping:"Shipping & delivery",conditions:"Card condition guide",contact:"Contact us",faq:"Frequently asked questions",tracker:"Track a guest order" };
export const INFO_PAGES: Partial<Record<ChromeInfo,string>> = { story:"about-us",shipping:"shipping",contact:"contact",faq:"faq" };
export const DEFAULT_SITE_CHROME: SiteChrome = {
  announcementMode:"automatic", announcement:richText("Welcome to {storeName}."), origin:"🇦🇺 Independent & Australian", dashboardLabel:"Store dashboard",searchPlaceholder:"Search any Magic card, set, printing…",navTagline:"Collect with confidence.",
  headerLinks:[link("singles","Shop all singles","/cards"),link("sets","Shop by set","","sets"),link("commander","Commander staples","/cards?category=commander-staples"),link("new","New arrivals","/cards?category=new-arrivals"),link("deck","Deck builder","/deckbuilder"),link("account","My account","/account"),link("story","Our story","","story")],
  setLinks:[...SHOP_SETS.map(s=>link(s.code,s.name,`/cards?set=${s.code}`)),link("all","Browse every set","/cards")],setHeading:"EXPLORE THE MULTIVERSE",headerPages:true,
  footerIntro:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"For the cards you need."},{type:"hardBreak"},{type:"text",text:"For the game you love."}]}]},footerOrigin:"🇦🇺 Proudly independent. Based in Australia.",
  footerColumns:[{id:"shop",title:"Explore the shop",links:[link("deck","Deck builder","/deckbuilder"),link("all","All Magic singles","/cards"),link("commander","Commander staples","/cards?category=commander-staples"),link("new","New arrivals","/cards?category=new-arrivals"),link("cheap","Cards under $5","/cards?category=under-5")]},{id:"info",title:"Good to know",links:[link("shipping",INFO_LABELS.shipping,"","shipping"),link("conditions",INFO_LABELS.conditions,"","conditions"),link("faq",INFO_LABELS.faq,"","faq"),link("tracker",INFO_LABELS.tracker,"","tracker")]},{id:"gather",title:"Let’s gather",links:[link("story",INFO_LABELS.story,"","story"),link("account","My account","/account"),link("contact",INFO_LABELS.contact,"","contact"),link("admin","Store workspace","/admin")]}],footerPages:true,
  copyright:richText("© {year} {storeName}. Made for the gathering."),disclaimer:richText("Magic: The Gathering is a trademark of Wizards of the Coast. We are an independent retailer."),
};
export function chromeTokens(doc: RichNode, storeName: string, year: number): RichNode {
  return {...doc,...(doc.text!==undefined ? {text:doc.text.replace(/\{storeName\}|\{year\}/g,t=>t==="{year}" ? String(year):storeName)}:{}),...(doc.content ? {content:doc.content.map(n=>chromeTokens(n,storeName,year))}:{})};
}
export function validateSiteChrome(input: unknown): SiteChrome {
  if(!input || typeof input!=="object" || Array.isArray(input) || JSON.stringify(input).length>100000)throw new Error("Send valid header/footer content (up to 100 KB).");
  const p=input as SiteChrome;
  const text=(v:unknown,max:number,required=false)=>{if(typeof v!=="string" || v.length>max || /[\u0000-\u001f\u007f]/.test(v) || (required&&!v.trim()))throw new Error(`Check header/footer text (up to ${max} characters).`);return v.trim();};
  const bool=(v:unknown)=>{if(typeof v!=="boolean")throw new Error("Check header/footer switches.");return v;};
  const id=(v:unknown)=>{const s=text(v,80,true);if(!/^[a-zA-Z0-9-]+$/.test(s))throw new Error("Invalid header/footer ID.");return s;};
  function links(v:unknown,header=false,max=12):ChromeLink[]{
    if(!Array.isArray(v)||v.length>max)throw new Error(`Keep at most ${max} links in this section.`);
    const seen=new Set<string>();let sets=0;
    return v.map(l=>{if(!l||typeof l!=="object"||Array.isArray(l))throw new Error("Invalid navigation link.");const key=id(l.id);if(seen.has(key))throw new Error("Duplicate navigation ID.");seen.add(key);
      const allowed=header ? ["link","sets","story"]:["link",...Object.keys(INFO_LABELS)];if(!allowed.includes(l.kind)|| (l.kind==="sets"&&++sets>1))throw new Error("Choose a supported navigation action (one set dropdown maximum).");
      const href=l.kind==="link" ? text(l.href,300,true):"";if(href&&!safePageLink(href))throw new Error("Links must be store paths or HTTPS URLs, without credentials.");
      return {id:key,label:text(l.label,60,true),kind:l.kind,href,enabled:bool(l.enabled)};
    });
  }
  const rich=(value:unknown,inline=false)=>{const doc=validateRichText(value);if(JSON.stringify(doc).length>24000)throw new Error("Keep header/footer rich text below 24 KB per section.");if(inline && (doc.content?.[0]?.content?.reduce((n,c)=>n+(c.text?.length||0),0)||0)>500)throw new Error("Keep the announcement below 500 characters.");if(inline && (doc.content?.length!==1||doc.content[0].type!=="paragraph"||doc.content[0].content?.some(n=>n.type!=="text")))throw new Error("Announcement must be a single paragraph of text and inline formatting.");return doc;};
  if(!["automatic","custom","hidden"].includes(p.announcementMode))throw new Error("Choose an announcement mode.");
  if(!Array.isArray(p.footerColumns)||p.footerColumns.length>4)throw new Error("Keep up to four footer columns.");
  const seen=new Set<string>();const footerColumns=p.footerColumns.map(c=>{if(!c||typeof c!=="object")throw new Error("Invalid footer column.");const key=id(c.id);if(seen.has(key))throw new Error("Duplicate footer column ID.");seen.add(key);return {id:key,title:text(c.title,60,true),links:links(c.links)};});
  return {announcementMode:p.announcementMode,announcement:rich(p.announcement,true),origin:text(p.origin,100),dashboardLabel:text(p.dashboardLabel,60,true),searchPlaceholder:text(p.searchPlaceholder,120,true),navTagline:text(p.navTagline,100),headerLinks:links(p.headerLinks,true),setLinks:links(p.setLinks,false,20).map(l=>{if(l.kind!=="link")throw new Error("Set dropdown entries must be links.");return l;}),setHeading:text(p.setHeading,80),headerPages:bool(p.headerPages),footerIntro:rich(p.footerIntro),footerOrigin:text(p.footerOrigin,160),footerColumns,footerPages:bool(p.footerPages),copyright:rich(p.copyright),disclaimer:rich(p.disclaimer)};
}
