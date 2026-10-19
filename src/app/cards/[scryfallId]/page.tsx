import { getStoreSettings } from "@/lib/store-settings-server";
import { getCardPrintings } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ scryfallId: string }> }): Promise<Metadata> {
  const { scryfallId } = await params;
  const { card } = await getCardPrintings(scryfallId);
  if (!card) return { title: "Card not found" };
  return { title: card.name, description: `${card.name} — every printing available at ${(await getStoreSettings()).storeName}.` };
}

export default async function CardDetailPage({ params }: { params: Promise<{ scryfallId: string }> }) {
  const { scryfallId } = await params;
  const { card, printings, collections } = await getCardPrintings(scryfallId);
  if (!card) notFound();
  return (
    <Storefront
      initialProducts={printings}
      collections={collections}
      mode="carddetail"
      initialCard={card}
      initialPrintings={printings}
    />
  );
}
