import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { getPricingSettings, savePricingSettings, getLastRun, getPriceEvents, getPriceFollowCounts } from "@/lib/pricing";
import { tcgplayerConfigured } from "@/lib/tcgplayer";
import { CONDITIONS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const [settings, lastRun, events, follow] = await Promise.all([
      getPricingSettings(), getLastRun(), getPriceEvents(), getPriceFollowCounts(),
    ]);
    return Response.json({ settings, lastRun, events, follow, conditions: CONDITIONS, tcgplayerConfigured: tcgplayerConfigured() });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await readBody(request);
    if (body.priceSource !== undefined && !["auto", "tcgplayer", "scryfall"].includes(String(body.priceSource))) throw new Error("Choose a valid market price source: automatic, TCGplayer, or Scryfall.");
    const settings = await savePricingSettings({
      autoFx: body.autoFx === true,
      rate: typeof body.rate === "number" && body.rate > 0 ? body.rate : undefined,
      markupPct: typeof body.markupPct === "number" ? body.markupPct : undefined,
      roundingCents: typeof body.roundingCents === "number" ? body.roundingCents : undefined,
      priceSource: ["auto", "tcgplayer", "scryfall"].includes(String(body.priceSource)) ? body.priceSource as "auto" | "tcgplayer" | "scryfall" : undefined,
      conditionMultipliers: body.conditionMultipliers && typeof body.conditionMultipliers === "object" && !Array.isArray(body.conditionMultipliers)
        ? body.conditionMultipliers as Record<string, number> : undefined,
    });
    return Response.json({ settings });
  } catch (error) { return apiError(error); }
}
