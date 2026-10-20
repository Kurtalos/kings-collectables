import { csvCell } from "./picklist";
export function insightPaging(params: URLSearchParams) {
  const query = (params.get("q") || "").trim();
  if (query.length > 120) throw new Error("Search up to 120 characters.");
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Choose a valid page.");
  const format = params.get("format") || "json";
  if (!["json", "csv"].includes(format)) throw new Error("Choose JSON or CSV format.");
  return { query, page, size: 25, exportCSV: format === "csv", pattern: `%${query.replace(/[\\%_]/g, "\\$&")}%` };
}
export type DemandRow = { productId: string; name: string; setName: string; setCode: string; collectorNumber: string; condition: string; finish: string; quantity: number; interested: number; oldest: string; newest: string };
export type DemandData = { rows: DemandRow[]; page: number; size: number; total: number; stats: { variants: number; customers: number; interests: number; outOfStock: number } };
export type Subscriber = { email: string; joinedAt: string };
export type SubscriberData = { rows: Subscriber[]; page: number; size: number; total: number; stats: { total: number; recent: number; withAccount: number } };
export function insightsCSV(headers: string[], rows: (string | number | null)[][]) { return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
export function demandCSV(rows: DemandRow[]) { return insightsCSV(["card", "set", "collector_number", "condition", "finish", "available_copies", "interested_customers", "first_watched", "last_watched"], rows.map(row => [row.name, row.setCode, row.collectorNumber, row.condition, row.finish, row.quantity, row.interested, new Date(row.oldest).toISOString(), new Date(row.newest).toISOString()])); }
