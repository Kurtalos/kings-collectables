import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { listPageRecords, updatePage, pageCatalog } from "@/lib/pages-server";
import { validatePage } from "@/lib/pages";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { await requireOwner(request); return Response.json({ pages: await listPageRecords() }, { headers }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await requireOwner(request); const body = await readBody(request);
    if (body.action === "preview") return Response.json({ catalog: await pageCatalog(validatePage(body.page)) }, { headers });
    return Response.json({ record: await updatePage(body.page, body.revision, body.action) }, { headers });
  } catch (error) { return apiError(error, error instanceof Error && error.message.includes("another tab") ? 409 : 400); }
}
