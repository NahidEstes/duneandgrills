import HomePageClient from "@/src/components/HomePageClient.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getMenuItems } from "@/src/api/server.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const menuItems = await getMenuItems().catch(() => []);

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
  };

  return (
    <>
      <JsonLd data={restaurantData} />
      <HomePageClient initialMenuItems={menuItems} />
    </>
  );
}
