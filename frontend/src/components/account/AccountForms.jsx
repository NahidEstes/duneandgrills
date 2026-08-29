"use client";

import { useState } from "react";
import { LoaderCircle, MapPin, Package, RefreshCw, Star } from "lucide-react";
import AccountModal from "./AccountModal.jsx";
import SmartImage from "../SmartImage.jsx";
import {
  addAddress,
  addPaymentMethod,
  createReview,
  updateAddress,
  updateMe,
  updatePaymentMethod,
} from "../../api/api.js";
import { formatPrice } from "../../utils/currency.js";
import { formatOrderType, getOrderSubtotal } from "../../utils/order.js";
import OrderStatusBadge from "./OrderStatusBadge.jsx";

export const inputClass = "w-full rounded-lg border border-dune-border bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber";
export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-dune-border px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-dune-amber hover:text-dune-amber";

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
    {children}
  </label>
);

const Actions = ({ saving, onCancel, label }) => (
  <div className="mt-6 flex justify-end gap-3">
    <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
    <button type="submit" disabled={saving} className={primaryButton}>
      {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {saving ? "Saving..." : label}
    </button>
  </div>
);

const useFormRequest = () => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async (request) => {
    setSaving(true);
    setError("");
    try {
      return await request();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save your changes.");
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run };
};

export const ProfileForm = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: user.name || "", bio: user.bio || "", avatar: user.avatar || "" });
  const { saving, error, run } = useFormRequest();
  const submit = async (event) => {
    event.preventDefault();
    const updated = await run(() => updateMe(form));
    if (updated) { onSaved(updated); onClose(); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full Name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Short Bio"><textarea rows={3} maxLength={240} className={`${inputClass} resize-none`} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></Field>
      <Field label="Avatar Image URL"><input type="url" className={inputClass} value={form.avatar} onChange={(event) => setForm({ ...form, avatar: event.target.value })} placeholder="https://images.example.com/avatar.jpg" /></Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Actions saving={saving} onCancel={onClose} label="Save Changes" />
    </form>
  );
};

export const PersonalForm = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", phone: user.phone || "", address: user.address || "" });
  const { saving, error, run } = useFormRequest();
  const submit = async (event) => {
    event.preventDefault();
    const updated = await run(() => updateMe(form));
    if (updated) { onSaved(updated); onClose(); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full Name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Email"><input required type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
      <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <Field label="Location"><input className={inputClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
      {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Actions saving={saving} onCancel={onClose} label="Save Information" /></div>
    </form>
  );
};

export const AddressForm = ({ address, onClose, onSaved }) => {
  const [form, setForm] = useState({ label: address?.label || "", fullAddress: address?.fullAddress || "", phone: address?.phone || "", isDefault: address?.isDefault || false });
  const { saving, error, run } = useFormRequest();
  const submit = async (event) => {
    event.preventDefault();
    const values = await run(() => address ? updateAddress(address._id, form) : addAddress(form));
    if (values) { onSaved(values); onClose(); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Label"><input required className={inputClass} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Home or Work" /></Field>
      <Field label="Full Delivery Address"><textarea required rows={3} className={`${inputClass} resize-none`} value={form.fullAddress} onChange={(event) => setForm({ ...form, fullAddress: event.target.value })} /></Field>
      <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} className="accent-amber-500" />Make this my default delivery address</label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Actions saving={saving} onCancel={onClose} label={address ? "Update Address" : "Add Address"} />
    </form>
  );
};

export const PaymentForm = ({ method, onClose, onSaved }) => {
  const [form, setForm] = useState({ cardBrand: method?.cardBrand || "Visa", lastFourDigits: method?.lastFourDigits || "", expiryMonth: method?.expiryMonth || "", expiryYear: method?.expiryYear || "", cardholderName: method?.cardholderName || "", isDefault: method?.isDefault || false });
  const { saving, error, run } = useFormRequest();
  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, expiryMonth: Number(form.expiryMonth), expiryYear: Number(form.expiryYear) };
    const values = await run(() => method ? updatePaymentMethod(method._id, payload) : addPaymentMethod(payload));
    if (values) { onSaved(values); onClose(); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Card Brand"><select className={inputClass} value={form.cardBrand} onChange={(event) => setForm({ ...form, cardBrand: event.target.value })}>{["Visa", "Mastercard", "Mada", "American Express"].map((brand) => <option key={brand}>{brand}</option>)}</select></Field>
      <Field label="Last 4 Digits"><input required inputMode="numeric" pattern="\d{4}" maxLength={4} className={inputClass} value={form.lastFourDigits} onChange={(event) => setForm({ ...form, lastFourDigits: event.target.value.replace(/\D/g, "") })} placeholder="4242" /></Field>
      <Field label="Expiry Month"><input required type="number" min="1" max="12" className={inputClass} value={form.expiryMonth} onChange={(event) => setForm({ ...form, expiryMonth: event.target.value })} /></Field>
      <Field label="Expiry Year"><input required type="number" min="2026" max="2200" className={inputClass} value={form.expiryYear} onChange={(event) => setForm({ ...form, expiryYear: event.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Cardholder Name"><input required className={inputClass} value={form.cardholderName} onChange={(event) => setForm({ ...form, cardholderName: event.target.value })} /></Field></div>
      <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} className="accent-amber-500" />Make this my default demo payment method</label>
      <p className="text-xs leading-relaxed text-neutral-500 sm:col-span-2">Demo display only. Only the brand, last four digits, expiry, and cardholder name are stored—never a full card number or CVV.</p>
      {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Actions saving={saving} onCancel={onClose} label={method ? "Update Method" : "Add Demo Card"} /></div>
    </form>
  );
};

export const ReviewForm = ({ options, onClose, onSaved }) => {
  const [selection, setSelection] = useState(options[0]?.value || "");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const { saving, error, run } = useFormRequest();
  const submit = async (event) => {
    event.preventDefault();
    const selected = options.find((option) => option.value === selection);
    if (!selected) return;
    const review = await run(() => createReview({ order: selected.orderId, menuItem: selected.menuItemId, rating, comment }));
    if (review) { onSaved(review); onClose(); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Delivered Item"><select required className={inputClass} value={selection} onChange={(event) => setSelection(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
      <Field label="Rating"><div className="flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className="text-dune-amber"><Star className="h-7 w-7" fill={value <= rating ? "currentColor" : "none"} /></button>)}</div></Field>
      <Field label="Comment"><textarea required rows={4} maxLength={1000} className={`${inputClass} resize-none`} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Actions saving={saving} onCancel={onClose} label="Submit Review" />
    </form>
  );
};

export const OrderDetails = ({
  order,
  onClose,
  onReorder,
  showReorder = false,
}) => (
  <AccountModal title={`Order #${order.orderNumber}`} description={new Date(order.createdAt).toLocaleString()} onClose={onClose}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <OrderStatusBadge status={order.status} />
      <span className="text-xs font-medium text-neutral-400">
        {formatOrderType(order.orderType)}
      </span>
    </div>
    <div className="my-5 space-y-3 border-y border-dune-border py-4">
      {order.items.map((item, index) => <div key={item.menuItem?._id || index} className="flex items-center gap-3">{item.menuItem?.image ? <SmartImage src={item.menuItem.image} alt={item.name} width={80} height={80} sizes="48px" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black text-neutral-500"><Package className="h-5 w-5" /></div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{item.name}</p><p className="text-xs text-neutral-500">Quantity {item.quantity}</p></div><p className="text-sm font-semibold text-dune-amber">{formatPrice(item.price * item.quantity)}</p></div>)}
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between text-neutral-400">
        <span>Subtotal</span>
        <span>{formatPrice(getOrderSubtotal(order))}</span>
      </div>
      {Number(order.deliveryFee) > 0 && (
        <div className="flex items-center justify-between text-neutral-400">
          <span>Delivery fee</span>
          <span>{formatPrice(order.deliveryFee)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-dune-border pt-3">
        <span className="text-neutral-300">Order total</span>
        <span className="font-display text-2xl text-dune-amber">{formatPrice(order.totalAmount)}</span>
      </div>
    </div>
    {order.customer?.address && <p className="mt-4 flex items-start gap-2 text-sm text-neutral-400"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-dune-amber" />{order.customer.address}</p>}
    {showReorder && (
      <button type="button" onClick={() => onReorder(order)} className={`${primaryButton} mt-5 w-full`}><RefreshCw className="h-4 w-4" />Reorder These Items</button>
    )}
  </AccountModal>
);
