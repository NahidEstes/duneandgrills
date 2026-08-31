"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createOffer,
  deleteOffer,
  fetchAllCombos,
  fetchAllMenuItems,
  fetchAllOffers,
  updateOffer,
} from "../api/api.js";
import SmartImage from "./SmartImage.jsx";
import { formatAdminCurrency } from "./admin/adminUi.js";
import { confirmDelete } from "./admin/deleteToast.js";

const toDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const newOfferForm = () => {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    title: "",
    subtitle: "",
    description: "",
    image: "",
    badge: "Limited Time",
    discountText: "",
    originalPrice: "",
    offerPrice: "",
    promoCode: "",
    orderProduct: "",
    orderQuantity: "1",
    discountType: "fixed",
    discountValue: "",
    couponScope: "order",
    applicableCategory: "",
    minimumOrderAmount: "0",
    maximumDiscount: "",
    usageLimit: "",
    startDate: toDateTimeInput(now),
    expiresAt: toDateTimeInput(nextWeek),
    isFeatured: false,
    isActive: true,
    ctaText: "Order Now",
    ctaLink: "/menu",
    sortOrder: "0",
  };
};

const fieldClass =
  "w-full rounded-lg border border-dune-border bg-black px-4 py-2.5 text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber";

const getOfferStatus = (offer) => {
  const now = Date.now();
  if (!offer.isActive) return ["Inactive", "text-neutral-400 border-neutral-500/40"];
  if (new Date(offer.startDate).getTime() > now) {
    return ["Upcoming", "text-blue-400 border-blue-500/40"];
  }
  if (new Date(offer.expiresAt).getTime() <= now) {
    return ["Expired", "text-red-400 border-red-500/40"];
  }
  return ["Active", "text-emerald-400 border-emerald-500/40"];
};

const OffersTab = ({ onDataChanged }) => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(newOfferForm);
  const [catalog, setCatalog] = useState([]);

  const loadOffers = async () => {
    setLoading(true);
    setError("");
    try {
      const [offerData, menuItems, combos] = await Promise.all([
        fetchAllOffers(),
        fetchAllMenuItems(),
        fetchAllCombos(),
      ]);
      setOffers(offerData);
      setCatalog([
        ...menuItems.filter((item) => item.isAvailable).map((item) => ({
          _id: item._id,
          name: item.name,
          category: item.category,
          productType: "menuItem",
        })),
        ...combos
          .filter(
            (combo) => combo.isAvailable && combo.status === "published"
          )
          .map((combo) => ({
          _id: combo._id,
          name: combo.name,
          category: "Combos",
          productType: "combo",
        })),
      ]);
    } catch (requestError) {
      const message =
        requestError.response?.data?.message || "Failed to load offers.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setForm(newOfferForm());
    setShowForm(true);
  };

  const openEditForm = (offer) => {
    setEditingId(offer._id);
    setForm({
      title: offer.title || "",
      subtitle: offer.subtitle || "",
      description: offer.description || "",
      image: offer.image || "",
      badge: offer.badge || "",
      discountText: offer.discountText || "",
      originalPrice: offer.originalPrice ?? "",
      offerPrice: offer.offerPrice ?? "",
      promoCode: offer.promoCode || "",
      orderProduct:
        offer.orderProduct?.product?._id
          ? `${offer.orderProduct.productType}:${offer.orderProduct.product._id}`
          : "",
      orderQuantity: String(offer.orderQuantity || 1),
      discountType: offer.discountType || "fixed",
      discountValue: String(offer.discountValue || ""),
      couponScope: offer.couponScope || "order",
      applicableCategory: offer.applicableCategory || "",
      minimumOrderAmount: String(offer.minimumOrderAmount || 0),
      maximumDiscount:
        offer.maximumDiscount === null || offer.maximumDiscount === undefined
          ? ""
          : String(offer.maximumDiscount),
      usageLimit:
        offer.usageLimit === null || offer.usageLimit === undefined
          ? ""
          : String(offer.usageLimit),
      startDate: toDateTimeInput(offer.startDate),
      expiresAt: toDateTimeInput(offer.expiresAt),
      isFeatured: Boolean(offer.isFeatured),
      isActive: Boolean(offer.isActive),
      ctaText: offer.ctaText || "Order Now",
      ctaLink: offer.ctaLink || "/menu",
      sortOrder: String(offer.sortOrder ?? 0),
    });
    setShowForm(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      originalPrice:
        form.originalPrice === "" ? null : Number(form.originalPrice),
      offerPrice: form.offerPrice === "" ? null : Number(form.offerPrice),
      startDate: new Date(form.startDate).toISOString(),
      expiresAt: new Date(form.expiresAt).toISOString(),
      sortOrder: Number(form.sortOrder) || 0,
      orderProductType: form.orderProduct.split(":")[0] || "menuItem",
      menuItem:
        form.orderProduct.startsWith("menuItem:")
          ? form.orderProduct.split(":")[1]
          : null,
      combo:
        form.orderProduct.startsWith("combo:")
          ? form.orderProduct.split(":")[1]
          : null,
      orderQuantity: Math.max(1, Number(form.orderQuantity) || 1),
      discountValue: Number(form.discountValue) || 0,
      minimumOrderAmount: Number(form.minimumOrderAmount) || 0,
      maximumDiscount:
        form.maximumDiscount === "" ? null : Number(form.maximumDiscount),
      usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
    };
    delete payload.orderProduct;

    try {
      if (editingId) {
        await updateOffer(editingId, payload);
        toast.success("Offer updated successfully.");
      } else {
        await createOffer(payload);
        toast.success("Offer created successfully.");
      }
      setShowForm(false);
      await loadOffers();
      onDataChanged?.();
    } catch (requestError) {
      const message =
        requestError.response?.data?.error ||
          requestError.response?.data?.message ||
          "Offer could not be saved.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (offer) => {
    confirmDelete({
      title: `Delete “${offer.title}”?`,
      description: "The promotion will be removed from the Exclusive Offers section.",
      onConfirm: async () => {
        await deleteOffer(offer._id);
        setOffers((current) =>
          current.filter((entry) => entry._id !== offer._id)
        );
        onDataChanged?.();
      },
      successMessage: "Offer deleted.",
      errorMessage: "Unable to delete offer.",
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          Create and schedule the offers shown below the homepage menu.
        </p>
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-dune-amber px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight"
        >
          <Plus className="h-4 w-4" /> Add Offer
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-neutral-500">Loading offers...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dune-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-dune-border text-left text-neutral-400">
                <th className="p-4">Image</th>
                <th className="p-4">Offer</th>
                <th className="p-4">Price</th>
                <th className="p-4">Schedule</th>
                <th className="p-4">Status</th>
                <th className="p-4">Featured</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const [statusLabel, statusClass] = getOfferStatus(offer);
                return (
                  <tr
                    key={offer._id}
                    className="border-b border-dune-border last:border-0 hover:bg-dune-surface"
                  >
                    <td className="p-4">
                      <SmartImage
                        src={offer.image}
                        alt=""
                        width={96}
                        height={96}
                        sizes="48px"
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    </td>
                    <td className="max-w-xs p-4">
                      <p className="truncate font-medium text-white">
                        {offer.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {offer.badge} · {offer.promoCode || "No promo code"}
                      </p>
                    </td>
                    <td className="p-4 text-dune-amber">
                      {offer.offerPrice !== null
                        ? formatAdminCurrency(offer.offerPrice)
                        : "—"}
                    </td>
                    <td className="p-4 text-xs text-neutral-400">
                      <p>{new Date(offer.startDate).toLocaleString()}</p>
                      <p className="mt-1">
                        to {new Date(offer.expiresAt).toLocaleString()}
                      </p>
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="p-4 text-neutral-300">
                      {offer.isFeatured ? "Yes" : "No"}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(offer)}
                          aria-label={`Edit ${offer.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-dune-border text-white hover:border-dune-amber"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(offer)}
                          aria-label={`Delete ${offer.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-dune-border text-white hover:border-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-neutral-500">
                    No offers yet. Add one to publish it on the homepage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
        >
          <form
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            className="my-8 w-full max-w-3xl rounded-2xl border border-dune-border bg-dune-surface p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl text-white">
                  {editingId ? "Edit Offer" : "Add New Offer"}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Public visibility is controlled by the active dates and status.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close offer form"
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral-400">
                Offer title
                <input
                  required
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Subtitle
                <input
                  value={form.subtitle}
                  onChange={(event) =>
                    updateField("subtitle", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Description
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5 resize-none`}
                />
              </label>
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Image URL
                <input
                  required
                  type="url"
                  value={form.image}
                  onChange={(event) => updateField("image", event.target.value)}
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Badge
                <input
                  value={form.badge}
                  onChange={(event) => updateField("badge", event.target.value)}
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Discount text
                <input
                  value={form.discountText}
                  onChange={(event) =>
                    updateField("discountText", event.target.value)
                  }
                  placeholder="Save 20%"
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Original price (SAR)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.originalPrice}
                  onChange={(event) =>
                    updateField("originalPrice", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Offer price (SAR)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.offerPrice}
                  onChange={(event) =>
                    updateField("offerPrice", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Promo code
                <input
                  value={form.promoCode}
                  onChange={(event) =>
                    updateField("promoCode", event.target.value.toUpperCase())
                  }
                  className={`${fieldClass} mt-1.5 uppercase`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Order Now product
                <select
                  required
                  value={form.orderProduct}
                  onChange={(event) =>
                    updateField("orderProduct", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                >
                  <option value="">Select a menu item or combo</option>
                  <optgroup label="Menu items">
                    {catalog
                      .filter((item) => item.productType === "menuItem")
                      .map((item) => (
                        <option
                          key={`menuItem:${item._id}`}
                          value={`menuItem:${item._id}`}
                        >
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Combos">
                    {catalog
                      .filter((item) => item.productType === "combo")
                      .map((item) => (
                        <option
                          key={`combo:${item._id}`}
                          value={`combo:${item._id}`}
                        >
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                Quantity added
                <input
                  required
                  type="number"
                  min="1"
                  max="99"
                  value={form.orderQuantity}
                  onChange={(event) =>
                    updateField("orderQuantity", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Discount type
                <select
                  value={form.discountType}
                  onChange={(event) =>
                    updateField("discountType", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                >
                  <option value="fixed">Fixed amount (SAR)</option>
                  <option value="percentage">Percentage</option>
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                Discount value
                <input
                  required={Boolean(form.promoCode)}
                  type="number"
                  min="0"
                  max={form.discountType === "percentage" ? "100" : undefined}
                  step="0.01"
                  value={form.discountValue}
                  onChange={(event) =>
                    updateField("discountValue", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Coupon applies to
                <select
                  value={form.couponScope}
                  onChange={(event) =>
                    updateField("couponScope", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                >
                  <option value="order">Entire order</option>
                  <option value="product">Order Now product only</option>
                  <option value="category">A category</option>
                </select>
              </label>
              {form.couponScope === "category" && (
                <label className="text-xs text-neutral-400">
                  Applicable category
                  <select
                    required
                    value={form.applicableCategory}
                    onChange={(event) =>
                      updateField("applicableCategory", event.target.value)
                    }
                    className={`${fieldClass} mt-1.5`}
                  >
                    <option value="">Select a category</option>
                    {[...new Set(catalog.map((item) => item.category))].map(
                      (category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}
              <label className="text-xs text-neutral-400">
                Minimum order (SAR)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumOrderAmount}
                  onChange={(event) =>
                    updateField("minimumOrderAmount", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Maximum discount (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maximumDiscount}
                  onChange={(event) =>
                    updateField("maximumDiscount", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Total usage limit (optional)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.usageLimit}
                  onChange={(event) =>
                    updateField("usageLimit", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Sort order
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) =>
                    updateField("sortOrder", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Starts at
                <input
                  required
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(event) =>
                    updateField("startDate", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Expires at
                <input
                  required
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) =>
                    updateField("expiresAt", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                CTA label
                <input
                  required
                  value={form.ctaText}
                  onChange={(event) =>
                    updateField("ctaText", event.target.value)
                  }
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                CTA link
                <input
                  required
                  value={form.ctaLink}
                  onChange={(event) =>
                    updateField("ctaLink", event.target.value)
                  }
                  placeholder="/menu"
                  className={`${fieldClass} mt-1.5`}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(event) =>
                    updateField("isFeatured", event.target.checked)
                  }
                  className="h-4 w-4 accent-amber-600"
                />
                Featured offer
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    updateField("isActive", event.target.checked)
                  }
                  className="h-4 w-4 accent-amber-600"
                />
                Active and publicly visible during its schedule
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-full bg-dune-amber py-3 font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Offer"
                  : "Create Offer"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default OffersTab;
