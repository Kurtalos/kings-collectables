import { getCatalog } from "@/lib/catalog";
import { Storefront } from "@/components/storefront";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await getCatalog({ limit: 48 });
  return <Storefront initialProducts={catalog.products} collections={catalog.collections}/>;
}
