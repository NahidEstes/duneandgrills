import InventoryDashboard from "@/src/components/inventory/InventoryDashboard.jsx";

export const metadata = {
  title: "Inventory Management",
  description: "Dune & Grills inventory operations dashboard.",
  robots: { index: false, follow: false },
};

export default function InventoryPage() {
  return <InventoryDashboard />;
}
