import { getProductsByIds } from "@/lib/catalog";
import { apiError } from "@/lib/admin-auth";
import { isUUID, readBody } from "@/lib/validation";
import { limitPublicRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Resolve saved cart and guest-wishlist cards without fetching the whole catalogue. */
export async function POST(request: Request) {
  try {
    const limited = limitPublicRequests(request, "card-id-lookup", 30);
    if (limited) return limited;
    const body = await readBody(request);
    if (!Array.isArray(body.ids) || body.ids.length > 250 || !body.ids.every(isUUID)) {
      throw new Error("Choose up to 250 valid card IDs.");
    }
    const products = await getProductsByIds(body.ids);
    return Response.json({ products }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
