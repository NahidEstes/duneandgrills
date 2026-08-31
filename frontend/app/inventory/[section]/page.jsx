import { notFound } from "next/navigation";
import InventorySectionPage from "@/src/components/inventory/InventorySectionPage.jsx";

const sections = new Set([
  "stock-items",
  "categories",
  "suppliers",
  "purchase-orders",
  "stock-in",
  "stock-out",
  "inventory-count",
  "expiry-tracking",
  "low-stock-alerts",
  "reports",
  "settings",
]);

export async function generateMetadata({ params }) {
  const { section } = await params;
  const title = section.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return { title: `${title} · Inventory`, robots: { index: false, follow: false } };
}

export default async function InventorySectionRoute({ params }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <InventorySectionPage section={section} />;
}
