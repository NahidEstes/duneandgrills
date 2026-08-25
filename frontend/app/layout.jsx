import { Bebas_Neue, Inter } from "next/font/google";
import Providers from "./providers.jsx";
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
  metadataBase: new URL("https://duneandgrills.com"),
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
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo-png.png", type: "image/png", sizes: "32x32" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
