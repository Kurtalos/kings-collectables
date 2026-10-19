import { getPageNavigation } from "@/lib/pages-server";
import { getHomepageCarousel } from "@/lib/homepage-carousel-server";
import type { Metadata } from "next";
import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { getStoreSettings } from "@/lib/store-settings-server";
import { themeVariables } from "@/lib/store-settings";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await getStoreSettings();
  return {
    title: { default: `${storeName} — Your next great deck starts here`, template: `%s | ${storeName}` },
    description: "An independent Australian Magic: The Gathering card store. Discover singles, Commander staples, and your next favourite set. Real cards, carefully packed.",
    icons: { icon: "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, slides, pageNavigation] = await Promise.all([getStoreSettings(), getHomepageCarousel(), getPageNavigation()]);
  return (
    <html lang="en" data-store-theme={settings.theme} style={themeVariables(settings.theme) as CSSProperties}>
      <body><StoreSettingsProvider settings={settings} pageNavigation={pageNavigation} slides={slides.filter(slide => slide.enabled)}>{children}</StoreSettingsProvider></body>
    </html>
  );
}
