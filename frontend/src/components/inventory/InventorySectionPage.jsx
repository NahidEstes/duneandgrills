"use client";

import AlertsPage from "./AlertsPage.jsx";
import CategoriesPage from "./CategoriesPage.jsx";
import InventoryCountPage from "./InventoryCountPage.jsx";
import InventorySettingsPage from "./InventorySettingsPage.jsx";
import PurchaseOrdersPage from "./PurchaseOrdersPage.jsx";
import ReportsPage from "./ReportsPage.jsx";
import StockItemsPage from "./StockItemsPage.jsx";
import StockMovementPage from "./StockMovementPage.jsx";
import SuppliersPage from "./SuppliersPage.jsx";

export default function InventorySectionPage({ section }) {
  if (section === "stock-items") return <StockItemsPage />;
  if (section === "categories") return <CategoriesPage />;
  if (section === "suppliers") return <SuppliersPage />;
  if (section === "purchase-orders") return <PurchaseOrdersPage />;
  if (section === "stock-in" || section === "stock-out") return <StockMovementPage pageType={section} />;
  if (section === "inventory-count") return <InventoryCountPage />;
  if (section === "expiry-tracking" || section === "low-stock-alerts") return <AlertsPage type={section} />;
  if (section === "reports") return <ReportsPage />;
  if (section === "settings") return <InventorySettingsPage />;
  return null;
}
