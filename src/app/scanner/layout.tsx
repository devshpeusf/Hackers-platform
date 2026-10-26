import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/** Scoped to the staff scanner; the hacker portal keeps its existing metadata. */
export const metadata: Metadata = {
  title: "HackJam Scanner",
  description: "Volunteer badge verification for HackJam.",
  applicationName: "HackJam Scanner",
  manifest: "/scanner.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HackJam Scanner",
    statusBarStyle: "default",
  },
  // Next emits mobile-web-app-capable; retain Apple's explicit capability tag too.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/scanner-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/scanner-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/scanner-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#07060d", colorScheme: "dark" };

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return children;
}
