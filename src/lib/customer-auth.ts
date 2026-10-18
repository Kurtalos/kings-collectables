import { createHmac, timingSafeEqual, scrypt, randomBytes } from "node:crypto";
import { requestIsHttps } from "@/lib/admin-auth";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";

const cookieName = "kings-customer";
const scryptAsync = promisify(scrypt);
const sessionDays = 30;

function secret() { return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "preview-only"; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) throw new Error("Choose a password between 8 and 72 characters.");
  if (/\s/.test(password)) throw new Error("Passwords cannot contain spaces.");
  return password;
}
export async function getCustomer() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const [expiry, id, supplied] = token.split(".");
  if (!expiry || !id || !supplied || Number(expiry) < Date.now()) return null;
  const expected = sign(`${expiry}.${id}`);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  const [customer] = await db.select({ id: customers.id, name: customers.name, email: customers.email }).from(customers).where(eq(customers.id, id)).limit(1);
  return customer || null;
}
export async function setCustomerSession(id: string, request: Request) {
  const expiry = String(Date.now() + 1000 * 60 * 60 * 24 * sessionDays);
  (await cookies()).set(cookieName, `${expiry}.${id}.${sign(`${expiry}.${id}`)}`, { httpOnly: true, sameSite: "lax", secure: requestIsHttps(request), path: "/", maxAge: 60 * 60 * 24 * sessionDays });
}
export async function clearCustomerSession() { (await cookies()).delete(cookieName); }
export async function requireCustomer() {
  const customer = await getCustomer();
  if (!customer) throw new Error("Please sign in to your account.");
  return customer;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) throw new Error("This request must come from your store.");
}
