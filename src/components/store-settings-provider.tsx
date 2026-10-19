"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings";
const StoreSettingsContext = createContext<StoreSettings>(DEFAULT_STORE_SETTINGS);
export const useStoreSettings = () => useContext(StoreSettingsContext);
export function StoreSettingsProvider({ settings, children }: { settings: StoreSettings; children: ReactNode }) {
  return <StoreSettingsContext.Provider value={settings}>{children}</StoreSettingsContext.Provider>;
}
