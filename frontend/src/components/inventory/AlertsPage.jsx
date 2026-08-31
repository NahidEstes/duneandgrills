"use client";

import { AlertTriangle, CalendarClock, PackageX, RefreshCw, TimerOff } from "lucide-react";
import { fetchInventoryAlerts } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, PageHeader, StatCard, cardClass } from "./InventoryUI.jsx";
import { daysUntil, formatDate, formatQuantity, getStockStatus } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

export default function AlertsPage({ type }) {
  const { data, loading, reload } = useInventoryResource(fetchInventoryAlerts, []);
  const stock = data?.stock || []; const expiry = data?.expiry || [];
  const lowCount = stock.filter((item) => item.currentStock > 0).length;
  const outCount = stock.filter((item) => item.currentStock <= 0).length;
  const expiredCount = expiry.filter((item) => daysUntil(item.expiryDate) < 0).length;
  const stockColumns = [
    { key: "name", label: "Item", render: (item) => <div><p className="font-medium text-white">{item.name}</p><p className="text-[0.65rem] text-neutral-600">{item.sku}</p></div> },
    { key: "category", label: "Category", render: (item) => item.category?.name || "—" },
    { key: "stock", label: "Current stock", render: (item) => formatQuantity(item.currentStock, item.unit) },
    { key: "reorder", label: "Reorder level", render: (item) => formatQuantity(item.reorderLevel, item.unit) },
    { key: "shortage", label: "Reorder quantity", render: (item) => formatQuantity(Math.max(item.reorderLevel - item.currentStock, 0), item.unit) },
    { key: "supplier", label: "Supplier", render: (item) => item.supplier?.name || "—" },
    { key: "status", label: "Status", render: (item) => { const row = getStockStatus(item); return <Badge tone={row.tone}>{row.label}</Badge>; } },
  ];
  const expiryColumns = [
    { key: "name", label: "Item", render: (item) => <div><p className="font-medium text-white">{item.name}</p><p className="text-[0.65rem] text-neutral-600">{item.sku}</p></div> },
    { key: "category", label: "Category", render: (item) => item.category?.name || "—" },
    { key: "stock", label: "Stock affected", render: (item) => formatQuantity(item.currentStock, item.unit) },
    { key: "date", label: "Expiry date", render: (item) => formatDate(item.expiryDate) },
    { key: "days", label: "Status", render: (item) => { const days = daysUntil(item.expiryDate); return <Badge tone={days < 0 ? "danger" : days <= 3 ? "warning" : "violet"}>{days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `${days} days left`}</Badge>; } },
    { key: "location", label: "Location", render: (item) => item.storageLocation || "—" },
    { key: "supplier", label: "Supplier", render: (item) => item.supplier?.name || "—" },
  ];
  const isExpiry = type === "expiry-tracking";
  return <div className="mx-auto max-w-[1500px]"><PageHeader title={isExpiry ? "Expiry Tracking" : "Low Stock Alerts"} description={isExpiry ? `Items expired or expiring within the configured ${data?.expiryAlertDays || 7}-day alert window.` : "Items at or below their reorder level, including all out-of-stock records."} actions={<Button variant="secondary" onClick={() => reload()}><RefreshCw className="h-4 w-4" />Refresh</Button>} /><section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{isExpiry ? <><StatCard label="Tracked alerts" value={expiry.length} icon={CalendarClock} tone="violet" caption="Within alert window" /><StatCard label="Expired" value={expiredCount} icon={TimerOff} tone="red" caption="Requires immediate action" /></> : <><StatCard label="Low stock" value={lowCount} icon={AlertTriangle} tone="amber" caption="At or below reorder level" /><StatCard label="Out of stock" value={outCount} icon={PackageX} tone="red" caption="Zero or negative balance" /></>}</section><section className={cardClass}>{loading ? <LoadingState /> : <DataTable columns={isExpiry ? expiryColumns : stockColumns} rows={isExpiry ? expiry : stock} empty={<EmptyState title={isExpiry ? "No expiry alerts" : "Stock levels look healthy"} description={isExpiry ? "No tracked item is inside the expiry alert window." : "No active item is at or below its reorder level."} />} />}</section></div>;
}
