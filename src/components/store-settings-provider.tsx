"use client";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings";
import { DEFAULT_CAROUSEL, type CarouselSlide } from "@/lib/homepage-carousel";
import type { PageNav } from "@/lib/pages";
const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);
export const useBranding = () => useContext(BrandingContext);
const PageNavigationContext = createContext<PageNav[]>([]);
export const usePageNavigation = () => useContext(PageNavigationContext);
const CarouselContext = createContext<CarouselSlide[]>(DEFAULT_CAROUSEL);
export const useHomepageCarousel = () => useContext(CarouselContext);
const StoreSettingsContext = createContext<StoreSettings>(DEFAULT_STORE_SETTINGS);
export const useStoreSettings = () => useContext(StoreSettingsContext);
export function StoreSettingsProvider({ settings, branding = DEFAULT_BRANDING, slides = DEFAULT_CAROUSEL, pageNavigation = [], children }: { settings: StoreSettings; branding?: Branding; slides?: CarouselSlide[]; pageNavigation?: PageNav[]; children: ReactNode }) {
  return <BrandingContext.Provider value={branding}><StoreSettingsContext.Provider value={settings}><CarouselContext.Provider value={slides}><PageNavigationContext.Provider value={pageNavigation}>{children}</PageNavigationContext.Provider></CarouselContext.Provider></StoreSettingsContext.Provider></BrandingContext.Provider>;
}
