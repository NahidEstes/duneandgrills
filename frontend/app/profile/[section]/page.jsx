import { notFound } from "next/navigation";

const SECTION_TITLES = {
  orders: "My Orders",
  favorites: "Favorites",
  rewards: "Dune Rewards",
  addresses: "Addresses",
  "payment-methods": "Payment Methods",
  reviews: "Reviews",
  settings: "Settings",
};

export function generateStaticParams() {
  return Object.keys(SECTION_TITLES).map((section) => ({ section }));
}

export async function generateMetadata({ params }) {
  const { section } = await params;
  const title = SECTION_TITLES[section];

  return title
    ? { title, robots: { index: false, follow: false } }
    : { title: "Account Page Not Found", robots: { index: false, follow: false } };
}

export default async function AccountSectionPage({ params }) {
  const { section } = await params;
  if (!SECTION_TITLES[section]) notFound();

  return null;
}
