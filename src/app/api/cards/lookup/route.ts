import { requireOwner, apiError } from "@/lib/admin-auth";
import { lookupCard } from "@/lib/scryfall";
import { getCatalog } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const params = new URL(request.url).searchParams;
    const name = params.get("name")?.trim() || "", set = params.get("set")?.trim().toLowerCase();
    if (!name || name.length > 200 || (set && !/^[a-z0-9]{2,8}$/.test(set))) throw new Error("Enter a card name and, optionally, a set code.");
    const { products } = await getCatalog();
    const local = products.find(card => card.name.toLowerCase() === name.toLowerCase() && (!set || card.setCode === set));
    return Response.json({ card: local || await lookupCard(name, set) });
  } catch (error) { return apiError(error); }
}
