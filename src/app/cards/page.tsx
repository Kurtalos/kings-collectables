import { getCatalog } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop Magic singles" };
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ q?: string; set?: string; category?: string }> }) { const [catalog, filters] = await Promise.all([getCatalog(), searchParams]); return <Storefront initialProducts={catalog.products} collections={catalog.collections} mode="catalog" initialFilters={filters}/>; }
