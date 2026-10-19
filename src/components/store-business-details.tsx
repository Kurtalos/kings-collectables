"use client";
import { useStoreSettings } from "./store-settings-provider";
export function StoreBusinessDetails() {
  const settings = useStoreSettings();
  if (![settings.legalName, settings.abn, settings.address, settings.email, settings.phone, settings.openingHours].some(Boolean)) return null;
  return <address className="store-business-details" aria-label="Store business and contact details">
    {settings.legalName && <strong>{settings.legalName}</strong>}
    {settings.abn && <span>ABN: {settings.abn}</span>}
    {settings.address && <span>{settings.address}</span>}
    {settings.email && <a href={`mailto:${encodeURIComponent(settings.email)}`}>{settings.email}</a>}
    {settings.phone && <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>{settings.phone}</a>}
    {settings.openingHours && <span>{settings.openingHours}</span>}
  </address>;
}
