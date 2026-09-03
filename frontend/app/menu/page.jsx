import FullMenuPage from "@/src/components/FullMenuPage.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getCategories, getCombos, getMenuItems } from "@/src/api/server.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Menu",
  description:
    "Explore the full Dune & Grills menu of fire-grilled burgers, shawarma, appetizers and drinks in Riyadh.",
  alternates: { canonical: "/menu" },
  openGraph: {
    url: "/menu",
    title: "Menu | Dune & Grills",
    description:
      "Explore fire-grilled burgers, shawarma, appetizers and drinks from Dune & Grills.",
  },
};

export default async function MenuPage() {
  const [items, combos, categories] = await Promise.all([
    getMenuItems().catch(() => []),
    getCombos().catch(() => []),
    getCategories("menu").catch(() => []),
  ]);
  const groupedItems = [...items, ...combos].reduce((groups, item) => {
    groups[item.category] = [...(groups[item.category] || []), item];
    return groups;
  }, {});

  const menuData = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "Dune & Grills Menu",
    url: "https://duneandgrills.com/menu",
    hasMenuSection: Object.entries(groupedItems).map(
      ([category, categoryItems]) => ({
        "@type": "MenuSection",
        name: category,
        hasMenuItem: categoryItems.map((item) => ({
          "@type": "MenuItem",
          name: item.name,
          description: item.description,
          image: item.image,
          offers: {
            "@type": "Offer",
            price: Number(item.price).toFixed(2),
            priceCurrency: "SAR",
            availability: "https://schema.org/InStock",
          },
        })),
      })
    ),
  };

  return (
    <>
      <JsonLd data={menuData} />
      <FullMenuPage
        initialItems={items}
        initialCombos={combos}
        initialCategories={categories}
      />
    </>
  );
}
