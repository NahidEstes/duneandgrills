"use client";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, Eye, MapPin, Phone, Printer, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { bulkUpdateOrderStatus, fetchOrdersPage, fetchOrderStats, updateOrderStatus } from "../api/api.js";
import { formatAdminCurrency } from "./admin/adminUi.js";
import { printOrderInvoice } from "../utils/adminExports.js";
import { formatOrderType, getOrderSubtotal } from "../utils/order.js";

const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/40",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/40",
  preparing: "bg-purple-500/10 text-purple-400 border-purple-500/40",
  ready: "bg-cyan-500/10 text-cyan-400 border-cyan-500/40",
  "out-for-delivery": "bg-purple-500/10 text-purple-400 border-purple-500/40",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/40",
  refunded: "bg-red-500/10 text-red-400 border-red-500/40",
  failed: "bg-red-500/10 text-red-400 border-red-500/40",
};

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Order Accepted",
  preparing: "Preparing",
  ready: "Ready",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const FILTER_TABS = ["all", ...STATUS_OPTIONS];
const SOURCE_OPTIONS = ["all", "website", "pos", "phone", "jahez", "hungerstation"];
const ORDER_TYPE_OPTIONS = ["all", "dine-in", "pickup", "takeaway", "delivery"];
const PAYMENT_OPTIONS = ["all", "cash", "card", "other", "unrecorded"];

const needsReason = (status) => status === "cancelled" || status === "refunded";

const labelSource = (value = "website") => value === "pos" ? "POS / Counter" : value.charAt(0).toUpperCase() + value.slice(1);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
      STATUS_STYLES[status] ||
      "bg-neutral-500/10 text-neutral-400 border-neutral-500/40"
    }`}
  >
    {STATUS_LABELS[status] || status}
  </span>
);

const StatCard = ({ label, value, sub }) => (
  <div className="rounded-2xl border border-dune-border bg-dune-surface p-5">
    <p className="text-neutral-400 text-sm">{label}</p>
    <p className="font-display text-3xl text-white mt-1">{value}</p>
    {sub && <p className="text-dune-amber text-xs mt-1">{sub}</p>}
  </div>
);

// ---- Order details modal with inline status control ----
const OrderRowModal = ({ order, onClose, onSaved }) => {
  const [status, setStatus] = useState(order.status);
  const [reason, setReason] = useState(order.cancellationReason || order.refundReason || "");
  const [estimatedPreparationMinutes, setEstimatedPreparationMinutes] = useState(order.estimatedPreparationMinutes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (needsReason(status) && !reason.trim()) {
      toast.error(`${status === "cancelled" ? "Cancellation" : "Refund"} reason is required.`);
      return;
    }
    if (needsReason(status) && status !== order.status && !window.confirm(`Mark Order #${order.orderNumber} as ${STATUS_LABELS[status]}? This can restore inventory and rewards.`)) return;
    setSaving(true);
    try {
      const updated = await updateOrderStatus(order._id, status, {
        reason: reason.trim(),
        estimatedPreparationMinutes,
      });
      onSaved(updated);
      toast.success(`Order #${order.orderNumber} updated.`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update order status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-dune-border bg-dune-surface p-6 my-8"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-white">
              ORDER #{order.orderNumber}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              {new Date(order.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}{" "}
              at{" "}
              {new Date(order.createdAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="eyebrow mb-2 block">Order Status</span>
          <DarkSelect
            value={status}
            disabled={saving}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </DarkSelect>
          </label>
          <label>
            <span className="eyebrow mb-2 block">Preparation time</span>
            <div className="relative">
              <input type="number" min="1" max="240" value={estimatedPreparationMinutes} onChange={(event) => setEstimatedPreparationMinutes(event.target.value)} placeholder="Minutes" className="w-full rounded-lg border border-dune-border bg-black px-4 py-2.5 pr-16 text-white outline-none focus:border-dune-amber" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">min</span>
            </div>
          </label>
        </div>

        {needsReason(status) && (
          <label className="mt-3 block">
            <span className="eyebrow mb-2 block">{status === "cancelled" ? "Cancellation" : "Refund"} reason</span>
            <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-dune-border bg-black px-4 py-2.5 text-white outline-none focus:border-dune-amber" placeholder="Required for the permanent order record" />
          </label>
        )}

        {order.isOverdue && <p className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"><AlertTriangle className="h-4 w-4" />Preparation estimate is overdue.</p>}

        <div className="mt-4 rounded-lg border border-dune-border bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Order Type
          </p>
          <p className="mt-1 text-sm font-medium text-white">
            {formatOrderType(order.orderType)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {labelSource(order.source)} · {order.paymentMethod === "unrecorded" || !order.paymentMethod ? "Payment not recorded" : `${formatOrderType(order.paymentMethod)} · ${formatOrderType(order.paymentStatus)}`}
          </p>
        </div>

        {/* Customer info */}
        <div className="mt-5 border-t border-dune-border pt-4 space-y-2 text-sm">
          <p className="text-white font-medium">{order.customer?.name}</p>
          <p className="text-neutral-400 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-dune-amber" />{" "}
            {order.customer?.phone}
          </p>
          {order.customer?.address && (
            <p className="text-neutral-400 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-dune-amber shrink-0 mt-0.5" />
              {order.customer.address}
            </p>
          )}
        </div>

        {/* Items */}
        <div className="mt-5 border-t border-dune-border pt-4 space-y-3">
          {order.items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <div>
                <p className="text-white">{item.name}</p>
                <p className="text-neutral-500 text-xs">Qty: {item.quantity}</p>
              </div>
              <p className="text-dune-amber font-medium">
                {formatAdminCurrency(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t border-dune-border pt-4 text-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span>Subtotal</span>
            <span>{formatAdminCurrency(getOrderSubtotal(order))}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <div className="flex items-center justify-between text-emerald-400">
              <span>
                Discount{order.couponCode ? ` (${order.couponCode})` : ""}
              </span>
              <span>-{formatAdminCurrency(order.discountAmount)}</span>
            </div>
          )}
          {Number(order.deliveryFee) > 0 && (
            <div className="flex items-center justify-between text-neutral-400">
              <span>Delivery fee</span>
              <span>{formatAdminCurrency(order.deliveryFee)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-dune-border pt-3">
            <span className="text-neutral-300">Total</span>
            <span className="font-display text-2xl text-dune-amber">
              {formatAdminCurrency(order.totalAmount)}
            </span>
          </div>
        </div>

        {order.statusHistory?.length > 0 && (
          <div className="mt-5 border-t border-dune-border pt-4">
            <p className="eyebrow mb-2">Status history</p>
            <div className="max-h-28 space-y-2 overflow-y-auto text-xs text-neutral-400">
              {[...order.statusHistory].reverse().map((entry, index) => <p key={`${entry.changedAt}-${index}`}><span className="text-white">{STATUS_LABELS[entry.status] || entry.status}</span> · {new Date(entry.changedAt).toLocaleString()}{entry.reason ? ` · ${entry.reason}` : ""}</p>)}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-dune-border pt-4">
          <button type="button" onClick={() => printOrderInvoice(order)} className="inline-flex items-center gap-2 rounded-lg border border-dune-border px-4 py-2 text-sm text-neutral-300 hover:border-dune-amber hover:text-dune-amber"><Printer className="h-4 w-4" />Print / PDF invoice</button>
          <button type="button" disabled={saving} onClick={handleSave} className="rounded-lg bg-dune-amber px-5 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
};

const OrdersTab = ({ onDataChanged, onOrderStatusChanged, refreshKey = 0 }) => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [viewOrder, setViewOrder] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [selected, setSelected] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("confirmed");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkPrep, setBulkPrep] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const requestFilters = useMemo(() => ({
    status: activeFilter,
    source: sourceFilter,
    orderType: orderTypeFilter,
    paymentMethod: paymentFilter,
    search: debouncedQuery,
    from,
    to,
    page,
    limit: 20,
  }), [activeFilter, sourceFilter, orderTypeFilter, paymentFilter, debouncedQuery, from, to, page]);

  const load = async () => {
    setLoading(true);
    try {
      const [orderResult, statData] = await Promise.all([
        fetchOrdersPage(requestFilters),
        fetchOrderStats(requestFilters),
      ]);
      setOrders(orderResult.data);
      setPagination(orderResult.pagination || { page: 1, pages: 1, total: orderResult.data.length });
      setStats(statData);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFilters, refreshKey]);

  const handleStatusChange = (orderId, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o))
    );
    setStats((prev) => prev); // stats will refresh on next load()
    onOrderStatusChanged?.(orderId, newStatus);
  };

  const toggleSelected = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const togglePage = () => setSelected((current) => current.size === orders.length
    ? new Set()
    : new Set(orders.map((order) => order._id)));

  const handleBulkUpdate = async () => {
    if (!selected.size) return toast.error("Select at least one order.");
    if (needsReason(bulkStatus) && !bulkReason.trim()) return toast.error("A cancellation/refund reason is required.");
    if (needsReason(bulkStatus) && !window.confirm(`Mark ${selected.size} selected orders as ${STATUS_LABELS[bulkStatus]}? This can restore inventory and rewards.`)) return;
    const selectedIds = [...selected];
    setBulkSaving(true);
    try {
      await bulkUpdateOrderStatus(selectedIds, bulkStatus, { reason: bulkReason.trim(), estimatedPreparationMinutes: bulkPrep });
      toast.success(`${selectedIds.length} orders updated.`);
      selectedIds.forEach((id) => onOrderStatusChanged?.(id, bulkStatus));
      onDataChanged?.();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update selected orders.");
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div>
      {/* Stats overview for bookkeeping */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Revenue"
            value={formatAdminCurrency(stats.totalRevenue)}
          />
          <StatCard label="Total Orders" value={stats.totalOrders} />
          <StatCard
            label="Today's Revenue"
            value={formatAdminCurrency(stats.todayRevenue)}
            sub={`${stats.todayOrders} orders today`}
          />
          <StatCard
            label="Pending"
            value={stats.statusCounts?.pending || 0}
            sub="Needs attention"
          />
        </div>
      )}

      {/* Filter tabs + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveFilter(tab); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === tab
                  ? "bg-dune-amber text-black border-dune-amber"
                  : "border-dune-border text-neutral-300 hover:border-dune-amber hover:text-dune-amber"
              }`}
            >
              {tab === "all" ? "All" : STATUS_LABELS[tab]}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-dune-amber"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.35fr)_repeat(5,minmax(135px,1fr))]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer or phone…" className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.025] pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60" /></label>
        <DarkSelect value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60">{SOURCE_OPTIONS.map((value) => <option key={value} value={value}>{value === "all" ? "All sales sources" : labelSource(value)}</option>)}</DarkSelect>
        <DarkSelect value={orderTypeFilter} onChange={(event) => { setOrderTypeFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60">{ORDER_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{value === "all" ? "All order types" : formatOrderType(value)}</option>)}</DarkSelect>
        <DarkSelect value={paymentFilter} onChange={(event) => { setPaymentFilter(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60">{PAYMENT_OPTIONS.map((value) => <option key={value} value={value}>{value === "all" ? "All payments" : value === "unrecorded" ? "Not recorded" : formatOrderType(value)}</option>)}</DarkSelect>
        <DarkDatePicker aria-label="Orders from date" className="h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} placeholder="From date" />
        <DarkDatePicker aria-label="Orders to date" className="h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} placeholder="To date" />
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-dune-amber/25 bg-dune-amber/[0.06] p-3">
          <p className="mr-auto self-center text-sm font-semibold text-dune-amber">{selected.size} selected</p>
          <DarkSelect value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="h-10 min-w-44 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-white">{STATUS_OPTIONS.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</DarkSelect>
          <input type="number" min="1" max="240" value={bulkPrep} onChange={(event) => setBulkPrep(event.target.value)} placeholder="Prep minutes" className="h-10 w-32 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-dune-amber" />
          {needsReason(bulkStatus) && <input value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder="Required reason" className="h-10 min-w-56 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-dune-amber" />}
          <button type="button" disabled={bulkSaving} onClick={handleBulkUpdate} className="h-10 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black disabled:opacity-50">{bulkSaving ? "Updating…" : "Update selected"}</button>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <p className="text-neutral-500">Loading orders...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dune-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dune-border text-left text-neutral-400">
                <th className="p-4"><input aria-label="Select all orders on this page" type="checkbox" checked={orders.length > 0 && selected.size === orders.length} onChange={togglePage} className="accent-orange-500" /></th>
                <th className="p-4">Order #</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Date &amp; Time</th>
                <th className="p-4">Items</th>
                <th className="p-4">Type</th>
                <th className="p-4">Source</th>
                <th className="p-4">Payment</th>
                <th className="p-4">Total</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order._id}
                  onClick={() => setViewOrder(order)}
                  className="border-b border-dune-border last:border-0 cursor-pointer hover:bg-black/40 transition-colors"
                >
                  <td className="p-4" onClick={(event) => event.stopPropagation()}><input aria-label={`Select order ${order.orderNumber}`} type="checkbox" checked={selected.has(order._id)} onChange={() => toggleSelected(order._id)} className="accent-orange-500" /></td>
                  <td className="p-4 text-white font-medium">
                    <span className="flex items-center gap-2">#{order.orderNumber}{order.isOverdue && <span title="Preparation overdue" className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[0.65rem] text-red-300"><Clock className="h-3 w-3" />Overdue</span>}</span>
                  </td>
                  <td className="p-4">{order.customer?.name}</td>
                  <td className="p-4 text-neutral-400 text-xs">
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {new Date(order.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="p-4">{order.items.length}</td>
                  <td className="p-4 text-xs text-neutral-300">
                    {formatOrderType(order.orderType)}
                  </td>
                  <td className="p-4 text-xs text-neutral-300">{labelSource(order.source)}</td>
                  <td className="p-4 text-xs text-neutral-300">{order.paymentMethod && order.paymentMethod !== "unrecorded" ? formatOrderType(order.paymentMethod) : "—"}</td>
                  <td className="p-4 text-dune-amber font-medium">
                    {formatAdminCurrency(order.totalAmount)}
                  </td>
                  <td className="p-4">
                    <StatusBadge status={order.status} />
                  </td>
                  <td
                    className="p-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => printOrderInvoice(order)}
                      title="Print or save invoice as PDF"
                      className="mr-2 w-8 h-8 inline-flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewOrder(order)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-neutral-500">
                    No orders found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
          <span>Showing page {pagination.page} of {pagination.pages} · {pagination.total} orders</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-dune-border px-3 py-2 text-neutral-300 disabled:opacity-30">Previous</button>
            <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-dune-border px-3 py-2 text-neutral-300 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {viewOrder && (
        <OrderRowModal
          order={viewOrder}
          onClose={() => {
            setViewOrder(null);
          }}
          onSaved={(updated) => {
            setViewOrder(updated);
            handleStatusChange(updated._id, updated.status);
            onDataChanged?.();
            load();
          }}
        />
      )}
    </div>
  );
};

export default OrdersTab;
