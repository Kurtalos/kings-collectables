import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPublishedPage, pageCatalog } from "@/lib/pages-server";
import { Storefront } from "@/components/storefront";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await readPublishedPage((await params).slug);
  return page ? { title: page.title, description: page.description || undefined } : { title: "Page not found", robots: { index: false } };
}
export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (slug === "home") notFound();
  const page = await readPublishedPage(slug);
  if (!page) notFound();
  const catalog = await pageCatalog(page);
  return <Storefront initialProducts={catalog.products} collections={catalog.collections} contentPage={page}/>;
}
