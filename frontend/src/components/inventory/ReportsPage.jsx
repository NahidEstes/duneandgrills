"use client";
import RecordId from "@/src/components/ui/RecordId.jsx";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarRange, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { fetchInventoryReport, fetchSuppliers } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, InventoryLoadError, LoadingState, Money, PageHeader, Pagination, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, daysUntil, downloadCsv, formatDate, formatQuantity, getStockStatus, humanize } from "./inventoryUtils.js";
import { collectInventoryReport, inventoryReportCsvHeaders } from "./inventoryReportExport.js";
import useInventoryResource from "./useInventoryResource.js";

const reports = [
  ["valuation", "Inventory Valuation"], ["movement", "Stock Movement"], ["purchases", "Purchases"],
  ["waste", "Waste / Loss"], ["low_stock", "Low Stock"], ["expiry", "Expiry"], ["supplier", "Supplier Purchase History"],
];

export default function ReportsPage() {
  const [type, setType] = useState("valuation"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [supplier, setSupplier] = useState(""); const [suppliers, setSuppliers] = useState([]); const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const exportRef = useRef(null);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { fetchSuppliers().then(setSuppliers).catch(() => undefined); if (typeof window !== "undefined") { const requested = new URLSearchParams(window.location.search).get("type"); if (reports.some(([value]) => value === requested)) setType(requested); } }, []);
  const { data, loading, error, reload } = useInventoryResource(() => fetchInventoryReport({ type, from: from || undefined, to: to || undefined, supplier: supplier || undefined, page, limit: 50 }), [type, from, to, supplier, page]);
  const columns = useMemo(() => {
    if (type === "valuation") return [
      { key: "item", label: "Item", render: (row) => <div><p className="font-medium text-white">{row.name}</p><p className="text-[0.65rem] text-neutral-600">{row.sku}</p></div> },
      { key: "category", label: "Category", render: (row) => row.category?.name || "—" }, { key: "stock", label: "Stock", render: (row) => formatQuantity(row.currentStock, row.unit) },
      { key: "method", label: "Method", render: (row) => <Badge tone={row.valuationMethod === "batch" ? "success" : "neutral"}>{row.valuationMethod === "batch" ? "Batch" : "Fallback"}</Badge> },
      { key: "coverage", label: "Coverage", render: (row) => row.missingCost ? <Badge tone="danger">Missing cost</Badge> : row.stockMismatch ? <Badge tone="warning">Qty mismatch</Badge> : <Badge tone="success">Complete</Badge> },
      { key: "unitCost", label: "Item unit cost", render: (row) => <Money value={row.unitCost} /> }, { key: "value", label: "Inventory value", render: (row) => <span className="font-semibold text-white"><Money value={row.inventoryValue} /></span> },
    ];
    if (["movement", "waste"].includes(type)) return [
      { key: "transactionNumber", label: "Transaction ID", render: (row) => <RecordId value={row.transactionNumber} /> },
      { key: "date", label: "Date", render: (row) => formatDate(row.occurredAt, true) }, { key: "item", label: "Item", render: (row) => row.item?.name || "Archived item" },
      { key: "movement", label: "Movement", render: (row) => <Badge tone={row.stockAfter >= row.stockBefore ? "success" : "danger"}>{humanize(row.movementType)}</Badge> },
      { key: "quantity", label: "Quantity", render: (row) => formatQuantity(row.quantity, row.item?.unit) }, { key: "balance", label: "Balance", render: (row) => `${row.stockBefore} → ${row.stockAfter}` },
      { key: "reason", label: "Reason" }, { key: "user", label: "User", render: (row) => row.user?.name || "—" },
    ];
    if (["purchases", "supplier"].includes(type)) return [
      { key: "number", label: "PO number", render: (row) => <span className="font-semibold text-white">{row.orderNumber}</span> }, { key: "supplier", label: "Supplier", render: (row) => row.supplier?.name || "—" },
      { key: "date", label: "Date", render: (row) => formatDate(row.createdAt) }, { key: "status", label: "Status", render: (row) => <Badge>{humanize(row.status)}</Badge> },
      { key: "items", label: "Items", render: (row) => row.items.length }, { key: "total", label: "Total", render: (row) => <Money value={row.total} /> },
    ];
    if (type === "expiry") return [
      { key: "item", label: "Item", render: (row) => <div><p className="font-medium text-white">{row.name}</p><p className="text-[0.65rem] text-neutral-600">{row.sku}</p></div> }, { key: "stock", label: "Stock", render: (row) => formatQuantity(row.currentStock, row.unit) },
      { key: "lot", label: "Batch / Lot", render: (row) => row.lotNumber || "—" }, { key: "expiry", label: "Expiry date", render: (row) => formatDate(row.expiryDate) }, { key: "days", label: "Status", render: (row) => { const days = daysUntil(row.expiryDate); return <Badge tone={days < 0 ? "danger" : "warning"}>{days < 0 ? "Expired" : `${days} days`}</Badge>; } }, { key: "location", label: "Location", render: (row) => row.storageLocation || "—" },
    ];
    return [
      { key: "item", label: "Item", render: (row) => <div><p className="font-medium text-white">{row.name}</p><p className="text-[0.65rem] text-neutral-600">{row.sku}</p></div> }, { key: "stock", label: "Current stock", render: (row) => formatQuantity(row.currentStock, row.unit) },
      { key: "reorder", label: "Reorder level", render: (row) => formatQuantity(row.reorderLevel, row.unit) }, { key: "supplier", label: "Supplier", render: (row) => row.supplier?.name || "—" }, { key: "status", label: "Status", render: (row) => { const status = getStockStatus(row); return <Badge tone={status.tone}>{status.label}</Badge>; } },
    ];
  }, [type]);
  const exportCsv = async (all = false) => {
    if (loading || error || exportRef.current) return;
    if (!data?.data?.length) return toast.error("There is no report data to export.");
    const controller = new AbortController();
    exportRef.current = controller;
    setExporting(true);
    setExportProgress(null);
    const filters = { type, from: from || undefined, to: to || undefined, supplier: supplier || undefined };
    try {
      const rows = all ? await collectInventoryReport(params => fetchInventoryReport(params, { signal: controller.signal }), filters, setExportProgress) : data.data;
      if (controller.signal.aborted) return;
      downloadCsv(`inventory-${filters.type}-${all ? "all" : `page-${page}`}-${new Date().toISOString().slice(0, 10)}.csv`, inventoryReportCsvHeaders(rows), rows);
    } catch (failure) {
      if (!controller.signal.aborted) toast.error(apiErrorMessage(failure, "Unable to export the complete report."));
    } finally {
      if (!controller.signal.aborted) { setExporting(false); setExportProgress(null); }
      if (exportRef.current === controller) exportRef.current = null;
    }
  };
  const dateUseful = ["movement", "purchases", "waste", "supplier"].includes(type);
  return <div className="mx-auto max-w-[1600px]"><PageHeader title="Inventory Reports" description="Operational and financial inventory reporting. All monetary values are SAR." actions={<><Button variant="secondary" disabled={loading || exporting} onClick={() => reload().catch(() => undefined)}><RefreshCw className="h-4 w-4" />Refresh</Button><Button disabled={loading || Boolean(error) || exporting || !data?.data?.length} onClick={() => exportCsv(false)} variant="secondary"><Download className="h-4 w-4" />Export current page</Button><Button disabled={loading || Boolean(error) || exporting || !data?.data?.length} onClick={() => exportCsv(true)}><Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export all filtered"}</Button></>} /><InventoryLoadError error={error} onRetry={reload} label="report" retained={Boolean(data)} />{exportProgress && <p role="status" className="mb-3 text-xs text-neutral-400">Exporting {exportProgress.loaded} of {exportProgress.total} records…</p>}<div className="mb-4 flex gap-2 overflow-x-auto pb-1">{reports.map(([value, label]) => <button key={value} type="button" onClick={() => { setType(value); setPage(1); }} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition ${type === value ? "border-dune-amber/40 bg-dune-amber/10 text-dune-amberLight" : "border-white/10 bg-white/[0.025] text-neutral-500 hover:text-white"}`}>{label}</button>)}</div><section className={cardClass}><div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 className="h-4 w-4 text-dune-amber" />{reports.find(([value]) => value === type)?.[1]}</p><p className="mt-1 text-xs text-neutral-600">Live database report · SAR</p></div><div className="flex flex-wrap gap-2">{dateUseful && <><label className="text-[0.65rem] text-neutral-600">From<DarkDatePicker className={`${inputClass} mt-1 w-40`} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label className="text-[0.65rem] text-neutral-600">To<DarkDatePicker className={`${inputClass} mt-1 w-40`} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label></>}{type === "supplier" && <label className="text-[0.65rem] text-neutral-600">Supplier<DarkSelect className={`${inputClass} mt-1 w-56`} value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1); }}><option value="">All suppliers</option>{suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></label>}</div></div>{loading ? <LoadingState /> : (!error || data) && <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No report data" description="No records match the selected report and filters." />} />}<Pagination pagination={data?.pagination} onPageChange={setPage} /></section></div>;
}
