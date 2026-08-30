import HomePageClient from "@/src/components/HomePageClient.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getCombos, getMenuItems, getOffers } from "@/src/api/server.js";

export const dynamic = "force-dynamic";

const offerUrl = (value) => {
  try {
    const url = new URL(value || "/menu", "https://duneandgrills.com");
    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : "https://duneandgrills.com/menu";
  } catch {
    return "https://duneandgrills.com/menu";
  }
};

export default async function HomePage() {
  const [menuItems, combos, offers] = await Promise.all([
    getMenuItems().catch(() => []),
    getCombos().catch(() => []),
    getOffers().catch(() => []),
  ]);

  const restaurantData = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: "Dune & Grills",
    url: "https://duneandgrills.com",
    image: "https://duneandgrills.com/logo2.jpeg",
    logo: "https://duneandgrills.com/logo.jpeg",
    description:
      "Fire-grilled burgers, shawarma and appetizers inspired by desert flavors.",
    servesCuisine: ["Grill", "Burgers", "Shawarma", "Middle Eastern"],
    priceRange: "SAR",
    telephone: "+9665082140327",
    email: "hello@duneandgrills.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Wadi As Sarh, Al Wadi",
      addressLocality: "Riyadh",
      postalCode: "18738",
      addressCountry: "SA",
    },
    hasMenu: "https://duneandgrills.com/menu",
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
      />
    </>
  );
}
