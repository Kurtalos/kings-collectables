import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kings Collectables — Your next great deck starts here", template: "%s | Kings Collectables" },
  description: "An independent Australian Magic: The Gathering card store. Discover singles, Commander staples, and your next favourite set. Real cards, carefully packed.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
