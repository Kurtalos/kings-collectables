import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { readStoreSettings, saveStoreSettings } from "@/lib/store-settings-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { await requireOwner(request); return Response.json({ settings: await readStoreSettings() }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try { await requireOwner(request); const settings = await saveStoreSettings(await readBody(request)); return Response.json({ settings }, { headers }); }
  catch (error) { return apiError(error); }
}
