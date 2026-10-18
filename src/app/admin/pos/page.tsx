import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { hasOwnerAccess } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin-login";
import { PosRegister } from "@/components/pos-register";
import "./pos.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register", robots: { index: false, follow: false } };

export default async function PosPage() {
  if (!(await hasOwnerAccess())) return <AdminLogin/>;
  const catalog = await getCatalog({ inStockOnly: true, limit: 100 });
  return <PosRegister products={catalog.products}/>;
}
