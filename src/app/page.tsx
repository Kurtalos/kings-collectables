import type { Metadata } from "next";
import { readPublishedPage, pageCatalog } from "@/lib/pages-server";
import { Storefront } from "@/components/storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await readPublishedPage("home");
  return page ? { title: page.title, description: page.description || undefined } : {};
}

export default async function HomePage() {
  const page = await readPublishedPage("home");
  const catalog = await pageCatalog(page);
  return <Storefront initialProducts={catalog.products} collections={catalog.collections} contentPage={page}/>;
}
