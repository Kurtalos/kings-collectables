"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings";
import { DEFAULT_CAROUSEL, type CarouselSlide } from "@/lib/homepage-carousel";
const CarouselContext = createContext<CarouselSlide[]>(DEFAULT_CAROUSEL);
export const useHomepageCarousel = () => useContext(CarouselContext);
const StoreSettingsContext = createContext<StoreSettings>(DEFAULT_STORE_SETTINGS);
export const useStoreSettings = () => useContext(StoreSettingsContext);
export function StoreSettingsProvider({ settings, slides = DEFAULT_CAROUSEL, children }: { settings: StoreSettings; slides?: CarouselSlide[]; children: ReactNode }) {
  return <StoreSettingsContext.Provider value={settings}><CarouselContext.Provider value={slides}>{children}</CarouselContext.Provider></StoreSettingsContext.Provider>;
}
