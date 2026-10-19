"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings";
import { DEFAULT_CAROUSEL, type CarouselSlide } from "@/lib/homepage-carousel";
import type { PageNav } from "@/lib/pages";
const PageNavigationContext = createContext<PageNav[]>([]);
export const usePageNavigation = () => useContext(PageNavigationContext);
const CarouselContext = createContext<CarouselSlide[]>(DEFAULT_CAROUSEL);
export const useHomepageCarousel = () => useContext(CarouselContext);
const StoreSettingsContext = createContext<StoreSettings>(DEFAULT_STORE_SETTINGS);
export const useStoreSettings = () => useContext(StoreSettingsContext);
export function StoreSettingsProvider({ settings, slides = DEFAULT_CAROUSEL, pageNavigation = [], children }: { settings: StoreSettings; slides?: CarouselSlide[]; pageNavigation?: PageNav[]; children: ReactNode }) {
  return <StoreSettingsContext.Provider value={settings}><CarouselContext.Provider value={slides}><PageNavigationContext.Provider value={pageNavigation}>{children}</PageNavigationContext.Provider></CarouselContext.Provider></StoreSettingsContext.Provider>;
}
