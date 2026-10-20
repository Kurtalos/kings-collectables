export type AdminTab = "stocktake" | "settings" | "chrome" | "branding" | "pages" | "carousel" | "inventory" | "imports" | "collections" | "pricing" | "demand" | "customers" | "inbox" | "newsletter" | "orders" | "picklist";
export type AdminSectionId = "store" | "inventory" | "customers" | "orders";
export const ADMIN_SECTIONS: { id: AdminSectionId; label: string; description: string; defaultTab: AdminTab; tabs: AdminTab[] }[] = [
  { id: "store", label: "Store", description: "Settings & website", defaultTab: "settings", tabs: ["settings", "branding", "chrome", "pages", "carousel"] },
  { id: "inventory", label: "Inventory", description: "Stock & purchasing", defaultTab: "inventory", tabs: ["inventory", "stocktake", "imports", "collections", "pricing", "demand"] },
  { id: "customers", label: "Customers", description: "People & engagement", defaultTab: "customers", tabs: ["customers", "inbox", "newsletter"] },
  { id: "orders", label: "Orders", description: "Sales & fulfilment", defaultTab: "orders", tabs: ["orders", "picklist"] },
];
export function adminSectionFor(tab: AdminTab) { return ADMIN_SECTIONS.find(section => section.tabs.includes(tab))!; }
