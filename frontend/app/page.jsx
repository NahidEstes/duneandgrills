import { siteOrigin } from "@/src/config/site.js";
const siteUrl = siteOrigin();
import HomePageClient from "@/src/components/HomePageClient.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getCombos, getMenuItems, getOffers, getPublicRestaurantSettings } from "@/src/api/server.js";

export const dynamic = "force-dynamic";

const offerUrl = (value) => {
  try {
    const url = new URL(value || "/menu", siteUrl);
    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : `${siteUrl}/menu`;
  } catch {
    return `${siteUrl}/menu`;
  }
};

export default async function HomePage() {
  const [menuItems, combos, offers, restaurantSettings] = await Promise.all([
    getMenuItems().catch(() => []),
    getCombos().catch(() => []),
    getOffers().catch(() => []),
    getPublicRestaurantSettings().catch(() => null),
  ]);

  const location = restaurantSettings?.location || {};
  const receipt = restaurantSettings?.receipt || {};

  const restaurantData = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: receipt.displayName || "Dune & Grills",
    url: receipt.websiteUrl || siteUrl,
    image: `${siteUrl}/logo2.jpeg`,
    logo: `${siteUrl}/logo.jpeg`,
    description:
      "Fire-grilled burgers, shawarma and appetizers inspired by desert flavors.",
    servesCuisine: ["Grill", "Burgers", "Shawarma", "Middle Eastern"],
    priceRange: "SAR",
    telephone: location.phone || "+9665082140327",
    email: location.email || "hello@duneandgrills.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: location.address || "Wadi As Sarh, Al Wadi",
      addressLocality: location.city || "Riyadh",
      postalCode: "18738",
      addressCountry: location.country || "Saudi Arabia",
    },
    hasMenu: `${siteUrl}/menu`,
    makesOffer: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.title,
      description: offer.description,
      url: offerUrl(offer.ctaLink),
      image: offer.image,
      validFrom: offer.startDate,
      priceValidUntil: offer.expiresAt,
      priceCurrency: "SAR",
      ...(offer.offerPrice !== null ? { price: offer.offerPrice } : {}),
      availability: "https://schema.org/InStock",
    })),
  };

  return (
    <>
      <JsonLd data={restaurantData} />
      <HomePageClient
        initialMenuItems={menuItems}
        initialCombos={combos}
        initialOffers={offers}
        restaurantSettings={restaurantSettings}
      />
    </>
  );
}
