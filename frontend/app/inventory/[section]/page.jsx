import { notFound } from "next/navigation";
import InventorySectionPage from "@/src/components/inventory/InventorySectionPage.jsx";

const sections = new Set([
  "stock-items",
  "batches",
  "categories",
  "suppliers",
  "purchase-orders",
  "supplier-invoices",
  "purchase-prices",
  "reorder-suggestions",
  "purchasing-actions",
  "stock-in",
  "stock-out",
  "stock-movements",
  "recipes",
  "waste-damaged",
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

export default async function InventorySectionRoute({ params, searchParams }) {
  const { section } = await params;
  const query = await searchParams;
  if (!sections.has(section)) notFound();
  return <InventorySectionPage section={section} initialStatus={typeof query?.status === "string" ? query.status : ""} initialState={typeof query?.state === "string" ? query.state : ""} initialSearch={typeof query?.search === "string" ? query.search.slice(0, 120) : ""} />;
}
