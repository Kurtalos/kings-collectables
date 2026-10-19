export const STORE_THEMES = {
  classic: { name: "Kings classic", description: "Black, orange & gold", accent: "#f26b0a", hover: "#ff8a2a", highlight: "#f5c518", soft: "#fff1e0", paper: "#f6f3ee", text: "#111111", motif: "" },
  ocean: { name: "Ocean blue", description: "Blue, sky & charcoal", accent: "#2563eb", hover: "#1d4ed8", highlight: "#93c5fd", soft: "#eff6ff", paper: "#f3f6fa", text: "#ffffff", motif: "" },
  forest: { name: "Forest green", description: "Emerald, mint & charcoal", accent: "#047857", hover: "#065f46", highlight: "#6ee7b7", soft: "#ecfdf5", paper: "#f2f7f4", text: "#ffffff", motif: "" },
  violet: { name: "Arcane violet", description: "Purple, lilac & charcoal", accent: "#7c3aed", hover: "#6d28d9", highlight: "#c4b5fd", soft: "#f5f3ff", paper: "#f6f3fa", text: "#ffffff", motif: "" },
  christmas: { name: "Christmas", description: "Festive red, evergreen & gold", accent: "#b91c1c", hover: "#991b1b", highlight: "#f5d97e", soft: "#fdf2ed", paper: "#f7f5ef", text: "#ffffff", motif: "❄" },
  halloween: { name: "Halloween", description: "Pumpkin orange, purple & midnight", accent: "#f97316", hover: "#fb923c", highlight: "#d8b4fe", soft: "#faf0ff", paper: "#f6f2f8", text: "#111111", motif: "✦" },
} as const;
export type StoreTheme = keyof typeof STORE_THEMES;
export type StoreSettings = {
  storeName: string; legalName: string; abn: string; address: string;
  email: string; phone: string; openingHours: string;
  shippingFlat: number; freeShippingThreshold: number | null; theme: StoreTheme;
};
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: "Kings Collectables", legalName: "", abn: "", address: "", email: "", phone: "", openingHours: "",
  shippingFlat: 895, freeShippingThreshold: 10000, theme: "classic",
};
export function validateStoreSettings(input: unknown): StoreSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send valid store settings.");
  const data = input as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    if (typeof data[key] !== "string") throw new Error(`Check ${key}.`);
    const value = data[key].trim();
    if ((required && !value) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Check ${key} (maximum ${max} characters).`);
    return value;
  };
  const storeName = text("storeName", 80, true), legalName = text("legalName", 160);
  const abn = text("abn", 20).replace(/\s/g, "");
  if (abn && !/^\d{11}$/.test(abn)) throw new Error("ABN must contain 11 digits, or be left blank.");
  const phone = text("phone", 40);
  if (phone && !/^[0-9+()\- .]{6,40}$/.test(phone)) throw new Error("Enter a valid contact phone number, or leave it blank.");
  const email = text("email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid contact email.");
  const cents = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
  if (!cents(data.shippingFlat)) throw new Error("Shipping must be between $0 and $10,000 AUD, in whole cents.");
  if (data.freeShippingThreshold !== null && !cents(data.freeShippingThreshold)) throw new Error("Free shipping threshold must be between $0 and $10,000 AUD, or disabled.");
  if (typeof data.theme !== "string" || !Object.hasOwn(STORE_THEMES, data.theme)) throw new Error("Choose a supported store theme.");
  return { storeName, legalName, abn, email, address: text("address", 500), phone, openingHours: text("openingHours", 300), shippingFlat: data.shippingFlat as number, freeShippingThreshold: data.freeShippingThreshold as number | null, theme: data.theme as StoreTheme };
}
export function shippingCost(subtotal: number, settings: Pick<StoreSettings, "shippingFlat" | "freeShippingThreshold">) {
  return settings.freeShippingThreshold !== null && subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFlat;
}
export function shippingMessage(settings: StoreSettings) {
  const dollars = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  if (settings.shippingFlat === 0 || settings.freeShippingThreshold === 0) return "Free tracked shipping across Australia";
  return settings.freeShippingThreshold === null ? `Tracked shipping ${dollars(settings.shippingFlat)}` : `Free shipping on orders ${dollars(settings.freeShippingThreshold)}+`;
}
export function themeVariables(theme: StoreTheme): Record<string, string> {
  const colors = STORE_THEMES[theme];
  return { "--wine": colors.accent, "--wine-dark": colors.hover, "--gold": colors.highlight, "--rose": colors.soft, "--paper": colors.paper, "--accent-text": colors.text, "--theme-muted-accent": theme === "classic" ? "#b84700" : theme === "halloween" ? "#a63e00" : colors.accent, "--black": theme === "christmas" ? "#102b20" : theme === "halloween" ? "#171022" : "#0c0c0d" };
}
