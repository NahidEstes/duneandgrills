"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Pencil,
  X,
  Eye,
  MapPin,
  Phone,
  User as UserIcon,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchMyOrders, updateMe } from "../api/api.js";
import { formatPrice } from "../utils/currency.js";

// ---- Status badge styles ----
const STATUS_STYLES = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/40",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/40",
  preparing: "bg-purple-500/10 text-purple-400 border-purple-500/40",
  "out-for-delivery": "bg-purple-500/10 text-purple-400 border-purple-500/40",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/40",
};

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Order Accepted",
  preparing: "Preparing",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

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

// ---- Edit Profile Modal ----
const EditProfileModal = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    address: user?.address || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await updateMe(form);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-dune-border bg-dune-surface p-6 animate-fadeUp"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl tracking-wide text-white">
            EDIT PROFILE
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">
              Full Name
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">
              Phone
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">
              Address
            </label>
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none transition-colors resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-dune-border hover:border-neutral-500 text-neutral-300 font-medium py-2.5 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-dune-amber hover:bg-dune-amberLight disabled:opacity-60 text-black font-semibold py-2.5 rounded-full transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
};

// ---- Order Details Modal ----
const OrderDetailsModal = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-dune-border bg-dune-surface p-6 my-8 animate-fadeUp"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-white">
              ORDER DETAILS
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              #{order.orderNumber} ·{" "}
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
            </p>{" "}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <StatusBadge status={order.status} />

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
              {/* <p className="text-dune-amber font-medium">
                ${(item.price * item.quantity).toFixed(2)}
              </p> */}
              <p className="text-dune-amber font-medium">
                {formatPrice(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {order.customer?.address && (
          <div className="mt-5 border-t border-dune-border pt-4">
            <p className="eyebrow mb-1.5">Delivery Address</p>
            <p className="text-sm text-neutral-300 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-dune-amber shrink-0 mt-0.5" />
              {order.customer.address}
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-dune-border pt-4 flex items-center justify-between">
          <span className="text-neutral-400">Total</span>
          {/* <span className="font-display text-2xl text-dune-amber">
            ${order.totalAmount.toFixed(2)}
          </span> */}
          <span className="font-display text-2xl text-dune-amber">
            {formatPrice(order.totalAmount)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ---- Main Profile Page ----
const ProfilePage = () => {
  const { user, setUser, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);

  useEffect(() => {
    fetchMyOrders()
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
  }, []);

  return (
    <div className="min-h-screen bg-black text-neutral-200 font-body">
      {/* Top bar */}
      <div className="border-b border-dune-border">
        <div className="max-w-5xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
          <button
            onClick={logout}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 md:px-8 py-10">
        <h1 className="font-display text-4xl md:text-5xl text-white mb-8">
          MY <span className="text-gradient-amber">ACCOUNT</span>
        </h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile card */}
          <div className="rounded-2xl border border-dune-border bg-dune-surface p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl tracking-wide text-white">
                MY PROFILE
              </h2>
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-2 border border-dune-amber/60 text-dune-amber hover:bg-dune-amber hover:text-black text-sm font-medium px-4 py-2 rounded-full transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-dune-amber" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Full Name
                  </p>
                  <p className="text-white mt-0.5">{user?.name || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-dune-amber" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Phone
                  </p>
                  <p className="text-white mt-0.5">
                    {user?.phone || "Not provided"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-dune-amber" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    Address
                  </p>
                  <p className="text-white mt-0.5">
                    {user?.address || "Not provided"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order history */}
          <div className="rounded-2xl border border-dune-border bg-dune-surface p-6">
            <h2 className="font-display text-xl tracking-wide text-white mb-6">
              ORDER HISTORY
            </h2>

            {loadingOrders ? (
              <p className="text-neutral-500 text-sm">Loading orders...</p>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
                <div className="w-14 h-14 rounded-full bg-dune-amber/10 border border-dune-amber/30 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-dune-amber" />
                </div>
                <p className="text-white font-medium">No orders yet</p>
                <p className="text-neutral-500 text-sm max-w-xs">
                  When you place an order, it will show up here with full
                  details.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div
                    key={order._id}
                    className="border border-dune-border rounded-xl p-4 hover:border-dune-amber/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-white font-medium">
                          Order #{order.orderNumber}
                        </p>
                        <p className="text-neutral-500 text-xs mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}{" "}
                          at{" "}
                          {new Date(order.createdAt).toLocaleTimeString(
                            undefined,
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}{" "}
                          · {order.items.length} item(s)
                        </p>
                        <p className="text-dune-amber font-display text-lg mt-1">
                          {formatPrice(order.totalAmount)}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    <button
                      onClick={() => setViewOrder(order)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-dune-amber hover:text-dune-amberLight transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEditModal(false)}
          onSaved={setUser}
        />
      )}

      {viewOrder && (
        <OrderDetailsModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
        />
      )}
    </div>
  );
};

export default ProfilePage;
