import { requireOwner, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { readBranding, saveBranding } from "@/lib/branding-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request: Request) {
  try { await requireOwner(request); return Response.json(await readBranding(),{headers}); } catch(error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try { await requireOwner(request); const body=await readBody(request); return Response.json(await saveBranding(body.settings,body.revision),{headers}); }
  catch(error) { return apiError(error,error instanceof Error && error.message.includes("another session") ? 409 : 400); }
}
