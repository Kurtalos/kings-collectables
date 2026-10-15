import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "kings-owner";
export const ownerProtectionEnabled = () => Boolean(process.env.ADMIN_PASSWORD);
function signature(value: string) { return createHmac("sha256", process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "preview-only").update(value).digest("hex"); }
export function validPassword(password: string) {
  const actual = process.env.ADMIN_PASSWORD;
  if (!actual) return false;
  return timingSafeEqual(createHash("sha256").update(password).digest(), createHash("sha256").update(actual).digest());
}
export async function hasOwnerAccess() {
  if (!ownerProtectionEnabled()) return true;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  const [expiry, supplied] = token.split(".");
  if (!expiry || !supplied || Number(expiry) < Date.now()) return false;
  const expected = signature(expiry);
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export async function setOwnerSession() {
  const expiry = String(Date.now() + 1000 * 60 * 60 * 12);
  (await cookies()).set(cookieName, `${expiry}.${signature(expiry)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}
export async function clearOwnerSession() { (await cookies()).delete(cookieName); }
export async function requireOwner(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) throw new Error("This request must come from your store.");
  if (!(await hasOwnerAccess())) throw new Error("Please sign in to the owner workspace.");
}
export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  return Response.json({ error: message }, { status: message.includes("sign in") ? 401 : status });
}
