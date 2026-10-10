import { Bebas_Neue, Inter } from "next/font/google";
import Providers from "./providers.jsx";
import { headers } from "next/headers";
import { siteOrigin, indexable } from "@/src/config/site.js";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas-neue",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(siteOrigin()),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dune & Grills", statusBarStyle: "black-translucent" },
  robots: { index: indexable(), follow: indexable() },
  title: {
    default: "Dune & Grills | Fire-Grilled, Desert-Inspired",
    template: "%s | Dune & Grills",
  },
  description:
    "Dune & Grills serves fire-grilled burgers, shawarma and appetizers in Riyadh. Order online for pickup or delivery.",
  applicationName: "Dune & Grills",
  authors: [{ name: "Dune & Grills" }],
  creator: "Dune & Grills",
  publisher: "Dune & Grills",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_SA",
    url: "/",
    siteName: "Dune & Grills",
    title: "Dune & Grills | Fire-Grilled, Desert-Inspired",
    description:
      "Fire-grilled burgers, shawarma and appetizers in Riyadh. Order online for pickup or delivery.",
    images: [
      {
        url: "/logo2.jpeg",
        width: 1248,
        height: 862,
        alt: "Dune & Grills",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dune & Grills | Fire-Grilled, Desert-Inspired",
    description:
      "Fire-grilled burgers, shawarma and appetizers in Riyadh. Order online for pickup or delivery.",
    images: ["/logo2.jpeg"],
  },
  icons: {
    apple: [{ url: "/pwa/apple-180.png", sizes: "180x180", type: "image/png" }],
    icon: [
      { url: "/pwa/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/pwa/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
  },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#09090b", viewportFit: "cover" };

export default async function RootLayout({ children }) {
  await headers(); // Per-request rendering is required for nonce-based CSP.
  return (
    <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
