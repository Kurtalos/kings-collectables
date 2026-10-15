import { getCatalog } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deck builder", description: "Paste your Magic: The Gathering decklist and we'll match every card against our live stock in one go." };
export default async function DeckBuilderPage() {
  const catalog = await getCatalog();
  return <Storefront initialProducts={catalog.products} collections={catalog.collections} mode="deckbuilder"/>;
}
