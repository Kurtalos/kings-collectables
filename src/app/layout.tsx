import { getPageNavigation } from "@/lib/pages-server";
import { getHomepageCarousel } from "@/lib/homepage-carousel-server";
import type { Metadata } from "next";
import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { getStoreSettings } from "@/lib/store-settings-server";
import { brandingVariables } from "@/lib/branding";
import { getBranding } from "@/lib/branding-server";
import { StoreSettingsProvider } from "@/components/store-settings-provider";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [{ storeName }, { settings: branding }] = await Promise.all([getStoreSettings(), getBranding()]);
  return {
    title: { default: `${storeName} — ${branding.tagline || "Your next great deck starts here"}`, template: `%s | ${storeName}` },
    description: branding.description || "An independent Australian Magic: The Gathering card store. Discover singles, Commander staples, and your next favourite set. Real cards, carefully packed.",
    icons: branding.favicon ? { icon: [{ url: branding.favicon, type: "image/png", sizes: "512x512" }], apple: [{ url: branding.favicon, sizes: "512x512", type: "image/png" }] } : { icon: "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, slides, pageNavigation, branding] = await Promise.all([getStoreSettings(), getHomepageCarousel(), getPageNavigation(), getBranding()]);
  return (
    <html lang="en" data-store-theme={branding.settings.preset ?? settings.theme} data-custom-colors={branding.settings.customColors ? "true" : undefined} style={brandingVariables(branding.settings, settings.theme) as CSSProperties}>
      <body><StoreSettingsProvider settings={settings} branding={branding.settings} pageNavigation={pageNavigation} slides={slides.filter(slide => slide.enabled)}>{children}</StoreSettingsProvider></body>
    </html>
  );
}
