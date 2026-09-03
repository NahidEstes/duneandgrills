"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Eye, X, MapPin, Phone, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { fetchOrders, fetchOrderStats, updateOrderStatus } from "../api/api.js";
import { formatAdminCurrency } from "./admin/adminUi.js";
import { formatOrderType, getOrderSubtotal } from "../utils/order.js";

const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/40",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/40",
  preparing: "bg-purple-500/10 text-purple-400 border-purple-500/40",
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
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const FILTER_TABS = ["all", ...STATUS_OPTIONS];

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
const OrderRowModal = ({ order, onClose, onStatusChange, onDataChanged }) => {
  const [status, setStatus] = useState(order.status);
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    try {
      await updateOrderStatus(order._id, newStatus);
      setStatus(newStatus);
      onStatusChange(order._id, newStatus);
      onDataChanged?.();
      toast.success(`Order #${order.orderNumber} marked ${STATUS_LABELS[newStatus]}.`);
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

        {/* Status control */}
        <div>
          <p className="eyebrow mb-2">Order Status</p>
          <select
            value={status}
            disabled={saving}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-lg border border-dune-border bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Order Type
          </p>
          <p className="mt-1 text-sm font-medium text-white">
            {formatOrderType(order.orderType)}
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

  const load = async () => {
    setLoading(true);
    try {
      const [orderData, statData] = await Promise.all([
        fetchOrders(activeFilter),
        fetchOrderStats(),
      ]);
      setOrders(orderData);
      setStats(statData);
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, refreshKey]);

  const handleStatusChange = (orderId, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o))
    );
    setStats((prev) => prev); // stats will refresh on next load()
    onOrderStatusChanged?.(orderId, newStatus);
  };

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orders;
    return orders.filter(
      (order) =>
        order.orderNumber?.toLowerCase().includes(normalized) ||
        order.customer?.name?.toLowerCase().includes(normalized) ||
        order.customer?.phone?.toLowerCase().includes(normalized)
    );
  }, [orders, query]);

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
              onClick={() => setActiveFilter(tab)}
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

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search order, customer or phone…"
          className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.025] pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
        />
      </div>

      {/* Orders table */}
      {loading ? (
        <p className="text-neutral-500">Loading orders...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dune-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dune-border text-left text-neutral-400">
                <th className="p-4">Order #</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Date &amp; Time</th>
                <th className="p-4">Items</th>
                <th className="p-4">Type</th>
                <th className="p-4">Total</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order._id}
                  onClick={() => setViewOrder(order)}
                  className="border-b border-dune-border last:border-0 cursor-pointer hover:bg-black/40 transition-colors"
                >
                  <td className="p-4 text-white font-medium">
                    #{order.orderNumber}
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
                      onClick={() => setViewOrder(order)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-500">
                    No orders found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewOrder && (
        <OrderRowModal
          order={viewOrder}
          onClose={() => {
            setViewOrder(null);
            load(); // refresh list + stats after any status change
          }}
          onStatusChange={handleStatusChange}
          onDataChanged={onDataChanged}
        />
      )}
    </div>
  );
};

export default OrdersTab;
