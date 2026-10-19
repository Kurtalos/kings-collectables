import { requireOwner, apiError } from "@/lib/admin-auth";
import { dispatchRestockEvents } from "@/lib/restock";
export async function POST(request: Request) {
  try {
    await requireOwner(request);
    await dispatchRestockEvents();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
