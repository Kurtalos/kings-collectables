import { timingSafeEqual } from "node:crypto";
import { runPriceUpdate } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function keysMatch(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**GET /api/cron/prices?key=CRON_SECRET — call from crontab on the VPS:
 *   0 3 * * * curl -fsS "http://127.0.0.1:3000/api/cron/prices?key=YOUR_SECRET" >> /var/log/kings-pricing.log 2>&1 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return Response.json({ error: "Set CRON_SECRET in the server environment to enable scheduled pricing." }, { status: 503 });
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key || !keysMatch(key, expected)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const run = await runPriceUpdate("daily");
    console.log("[cron] price update", JSON.stringify(run));
    return Response.json({ ok: true, run });
  } catch (error) {
    console.error("[cron] price update failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "The price update failed." }, { status: 500 });
  }
}
