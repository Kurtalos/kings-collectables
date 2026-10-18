import { setOwnerSession, clearOwnerSession, validPassword, apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
const attempts = new Map<string, { count: number; time: number }>();
export async function POST(request: Request) {
  try {
    const key = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    const previous = attempts.get(key);
    if (previous && Date.now() - previous.time < 60000 && previous.count >= 5) return Response.json({ error: "Too many attempts. Please wait one minute." }, { status: 429 });
    const body = await readBody(request);
    if (typeof body.password !== "string" || !validPassword(body.password)) { attempts.set(key, { count: previous && Date.now() - previous.time < 60000 ? previous.count + 1 : 1, time: previous && Date.now() - previous.time < 60000 ? previous.time : Date.now() }); return Response.json({ error: "That password wasn't correct." }, { status: 401 }); }
    await setOwnerSession(request); attempts.delete(key); return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE() { await clearOwnerSession(); return Response.json({ ok: true }); }
