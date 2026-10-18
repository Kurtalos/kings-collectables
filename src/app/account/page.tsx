import { getCatalog } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const catalog = await getCatalog({ limit: 48 });
  return <Storefront initialProducts={catalog.products} collections={catalog.collections} mode="account"/>;
}
