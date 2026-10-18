import { requireOwner, apiError } from "@/lib/admin-auth";
import { runPriceUpdate } from "@/lib/pricing";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const limited = limitPublicRequests(request, "pricing-run", 4); if (limited) return limited;
    const run = await runPriceUpdate("manual");
    return Response.json({ run });
  } catch (error) { return apiError(error); }
}
