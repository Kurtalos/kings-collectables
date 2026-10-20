"use client";
import { DEFAULT_SITE_CHROME, type SiteChrome } from "@/lib/site-chrome";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings";
import { DEFAULT_CAROUSEL, type CarouselSlide } from "@/lib/homepage-carousel";
import type { PageNav } from "@/lib/pages";
const SiteChromeContext = createContext<SiteChrome>(DEFAULT_SITE_CHROME);
export const SiteChromePreviewProvider = SiteChromeContext.Provider;
export const useSiteChrome = () => useContext(SiteChromeContext);
const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);
export const useBranding = () => useContext(BrandingContext);
const PageNavigationContext = createContext<PageNav[]>([]);
export const usePageNavigation = () => useContext(PageNavigationContext);
const CarouselContext = createContext<CarouselSlide[]>(DEFAULT_CAROUSEL);
export const useHomepageCarousel = () => useContext(CarouselContext);
const StoreSettingsContext = createContext<StoreSettings>(DEFAULT_STORE_SETTINGS);
export const useStoreSettings = () => useContext(StoreSettingsContext);
export function StoreSettingsProvider({ settings, chrome = DEFAULT_SITE_CHROME, branding = DEFAULT_BRANDING, slides = DEFAULT_CAROUSEL, pageNavigation = [], children }: { settings: StoreSettings; chrome?: SiteChrome; branding?: Branding; slides?: CarouselSlide[]; pageNavigation?: PageNav[]; children: ReactNode }) {
  return <SiteChromeContext.Provider value={chrome}><BrandingContext.Provider value={branding}><StoreSettingsContext.Provider value={settings}><CarouselContext.Provider value={slides}><PageNavigationContext.Provider value={pageNavigation}>{children}</PageNavigationContext.Provider></CarouselContext.Provider></StoreSettingsContext.Provider></BrandingContext.Provider></SiteChromeContext.Provider>;
}
