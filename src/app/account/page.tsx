import { getCatalog } from "@/lib/catalog";
import { getCustomer } from "@/lib/customer-auth";
import { getAccountData } from "@/lib/account-data";
import { Storefront } from "@/components/storefront";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const customer = await getCustomer();
  const [catalog, account] = await Promise.all([getCatalog({ limit: 48 }), getAccountData(customer)]);
  return <Storefront initialProducts={catalog.products} collections={catalog.collections} mode="account" initialAccount={account}/>;
}
