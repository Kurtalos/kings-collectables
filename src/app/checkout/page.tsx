import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { getCustomer } from "@/lib/customer-auth";
import { listAddresses } from "@/app/api/addresses/route";
import { stripeAvailable, stripePublishableKey } from "@/lib/payments";
import { Checkout } from "@/components/checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const [catalog, customer] = await Promise.all([getCatalog(), getCustomer()]);
  const addresses = customer ? await listAddresses(customer.id) : [];
  return (
    <Checkout
      initialProducts={catalog.products}
      customer={customer}
      addresses={addresses}
      cardAvailable={stripeAvailable() && Boolean(stripePublishableKey())}
      publishableKey={stripePublishableKey()}
    />
  );
}
