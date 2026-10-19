import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { readHomepageCarousel, saveHomepageCarousel } from "@/lib/homepage-carousel-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { await requireOwner(request); return Response.json({ slides: await readHomepageCarousel() }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try { await requireOwner(request); return Response.json({ slides: await saveHomepageCarousel((await readBody(request)).slides) }, { headers }); }
  catch (error) { return apiError(error); }
}
