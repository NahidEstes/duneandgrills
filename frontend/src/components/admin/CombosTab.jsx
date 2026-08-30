"use client";

import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Layers3,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createCombo,
  deleteCombo,
  fetchAllCombos,
  fetchAllMenuItems,
  updateCombo,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import { confirmDelete } from "./deleteToast.js";
import { formatAdminCurrency, formatAdminDate } from "./adminUi.js";

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-black/45 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber/60";
const PANEL_CLASS =
  "rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";
const COMMON_ITEM_FILTERS = [
  "All",
  "Burgers",
  "Shawarma",
  "Sandwiches",
  "Sides",
  "Drinks",
  "Appetizers",
];
const FILTER_TERMS = {
  Burgers: "burger",
  Shawarma: "shawarma",
  Sandwiches: "sandwich",
  Sides: "side",
  Drinks: "drink",
  Appetizers: "appetizer",
};

const emptyForm = () => ({
  name: "",
  description: "",
  image: "",
  comboPrice: "",
  isAvailable: true,
  isFeatured: false,
  featuredOrder: 0,
  status: "draft",
  items: [],
});

const slugify = (value = "") =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const itemId = (entry) => entry.menuItem?._id || entry.menuItem;

const Toggle = ({ checked, onChange, label }) => (
  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-300">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-dune-amber" : "bg-neutral-700"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
    {label}
  </label>
);

const SectionTitle = ({ number, children }) => (
  <h2 className="flex items-center gap-2 text-base font-semibold text-white">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dune-amber text-xs font-bold text-black">
      {number}
    </span>
    {children}
  </h2>
);

const ComboBuilder = ({ combo, menuItems, onCancel, onSaved }) => {
  const [form, setForm] = useState(() => {
    if (!combo) return emptyForm();
    return {
      name: combo.name || "",
      description: combo.description || "",
      image: combo.image || "",
      comboPrice: combo.comboPrice ?? "",
      isAvailable: combo.isAvailable !== false,
      isFeatured: Boolean(combo.isFeatured),
      featuredOrder: combo.featuredOrder || 0,
      status: combo.status || "draft",
      items: (combo.items || []).map((entry) => ({
        menuItem: itemId(entry),
        quantity: entry.quantity,
      })),
    };
  });
  const [saving, setSaving] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemFilter, setItemFilter] = useState("All");

  const itemMap = useMemo(
    () => new Map(menuItems.map((item) => [item._id, item])),
    [menuItems]
  );
  const selectedItems = useMemo(
    () =>
      form.items
        .map((entry) => ({ ...entry, menuItem: itemMap.get(entry.menuItem) }))
        .filter((entry) => entry.menuItem),
    [form.items, itemMap]
  );
  const regularPrice = Number(
    selectedItems
      .reduce(
        (sum, entry) => sum + entry.menuItem.price * entry.quantity,
        0
      )
      .toFixed(2)
  );
  const numericComboPrice = Number(form.comboPrice) || 0;
  const savings = Number(
    Math.max(0, regularPrice - numericComboPrice).toFixed(2)
  );
  const discount = regularPrice
    ? Number(((savings / regularPrice) * 100).toFixed(1))
    : 0;

  const filters = useMemo(() => {
    const values = new Set(COMMON_ITEM_FILTERS);
    menuItems.forEach((item) => {
      values.add(item.category);
      (item.tags || []).forEach((tag) => values.add(tag));
    });
    return [...values].slice(0, 12);
  }, [menuItems]);
  const availableItems = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      const filterTerm = (FILTER_TERMS[itemFilter] || itemFilter).toLowerCase();
      const filterText = [
        item.name,
        item.description,
        item.category,
        ...(item.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      const matchesFilter = itemFilter === "All" || filterText.includes(filterTerm);
      const matchesQuery =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [itemFilter, itemQuery, menuItems]);

  const addItem = (id) => {
    if (form.items.some((entry) => entry.menuItem === id)) return;
    if (form.items.length >= 10) {
      toast.error("A combo can contain up to 10 different items.");
      return;
    }
    setForm((current) => ({
      ...current,
      items: [...current.items, { menuItem: id, quantity: 1 }],
    }));
  };

  const updateQuantity = (id, direction) => {
    setForm((current) => ({
      ...current,
      items: current.items
        .map((entry) =>
          entry.menuItem === id
            ? {
                ...entry,
                quantity: Math.min(99, entry.quantity + direction),
              }
            : entry
        )
        .filter((entry) => entry.quantity > 0),
    }));
  };

  const removeItem = (id) =>
    setForm((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.menuItem !== id),
    }));

  const save = async (status) => {
    if (!form.name.trim() || !form.description.trim() || !form.image.trim()) {
      toast.error("Name, description and image are required.");
      return;
    }
    if (!form.items.length) {
      toast.error("Select at least one menu item for this combo.");
      return;
    }
    if (!numericComboPrice || numericComboPrice <= 0) {
      toast.error("Enter a valid combo price.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        comboPrice: numericComboPrice,
        featuredOrder: Number(form.featuredOrder) || 0,
        status,
      };
      const saved = combo
        ? await updateCombo(combo._id, payload)
        : await createCombo(payload);
      toast.success(
        `${saved.name} ${status === "published" ? "published" : "saved as draft"}.`
      );
      onSaved(saved);
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Unable to save combo."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to combos
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-neutral-300 hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save("draft")}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white hover:border-dune-amber/50 disabled:opacity-60"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save("published")}
            className="inline-flex items-center gap-2 rounded-lg bg-dune-amber px-5 py-2.5 text-sm font-semibold text-black hover:bg-dune-amberLight disabled:opacity-60"
          >
            {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
            {combo ? "Update Combo" : "Publish Combo"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <section className={`${PANEL_CLASS} p-4 sm:p-5`}>
            <SectionTitle number="1">Basic Information</SectionTitle>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-neutral-400">
                Combo Name
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Slug (auto-generated)
                <input
                  readOnly
                  value={slugify(form.name)}
                  className={`${FIELD_CLASS} cursor-not-allowed text-neutral-500`}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Category
                <input
                  readOnly
                  value="Combos"
                  className={`${FIELD_CLASS} cursor-not-allowed text-neutral-500`}
                />
              </label>
              <label className="text-xs text-neutral-400 md:col-span-2 xl:col-span-3">
                Short Description
                <textarea
                  required
                  rows={3}
                  maxLength={500}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className={`${FIELD_CLASS} resize-none`}
                />
              </label>
              <label className="text-xs text-neutral-400 md:col-span-2">
                Combo Image URL or local path
                <input
                  required
                  value={form.image}
                  onChange={(event) =>
                    setForm({ ...form, image: event.target.value })
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Featured Position
                <input
                  min="0"
                  step="1"
                  type="number"
                  disabled={!form.isFeatured}
                  value={form.featuredOrder}
                  onChange={(event) =>
                    setForm({ ...form, featuredOrder: event.target.value })
                  }
                  className={`${FIELD_CLASS} disabled:opacity-40`}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-6">
              <Toggle
                checked={form.isAvailable}
                onChange={(value) => setForm({ ...form, isAvailable: value })}
                label="Available"
              />
              <Toggle
                checked={form.isFeatured}
                onChange={(value) => setForm({ ...form, isFeatured: value })}
                label="Featured on Homepage"
              />
            </div>
          </section>

          <section className={`${PANEL_CLASS} p-4 sm:p-5`}>
            <SectionTitle number="2">Add Items to Combo</SectionTitle>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  type="search"
                  value={itemQuery}
                  onChange={(event) => setItemQuery(event.target.value)}
                  placeholder="Search existing menu items…"
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/35 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setItemFilter(filter)}
                    className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs transition-colors ${
                      itemFilter === filter
                        ? "border-dune-amber bg-dune-amber text-black"
                        : "border-white/10 text-neutral-400 hover:border-dune-amber/50 hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {availableItems.map((item) => {
                const selected = form.items.some(
                  (entry) => entry.menuItem === item._id
                );
                return (
                  <button
                    key={item._id}
                    type="button"
                    disabled={selected}
                    onClick={() => addItem(item._id)}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-black/25 p-2 text-left hover:border-dune-amber/40 disabled:cursor-default disabled:border-emerald-500/25 disabled:bg-emerald-500/[0.04]"
                  >
                    <SmartImage
                      src={item.image}
                      alt=""
                      width={80}
                      height={80}
                      sizes="40px"
                      className="h-10 w-10 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-white">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-dune-amber">
                        {formatAdminCurrency(item.price)}
                      </span>
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Plus className="h-4 w-4 text-neutral-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.08]">
              {!selectedItems.length ? (
                <p className="px-4 py-8 text-center text-sm text-neutral-500">
                  Select menu items to build this combo.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {selectedItems.map((entry) => (
                    <div
                      key={entry.menuItem._id}
                      className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap"
                    >
                      <SmartImage
                        src={entry.menuItem.image}
                        alt=""
                        width={80}
                        height={80}
                        sizes="40px"
                        className="h-10 w-10 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {entry.menuItem.name}
                        </p>
                        <p className="text-xs text-dune-amber">
                          {formatAdminCurrency(entry.menuItem.price)} each
                        </p>
                      </div>
                      <div className="flex items-center rounded-lg border border-white/10">
                        <button
                          type="button"
                          onClick={() => updateQuantity(entry.menuItem._id, -1)}
                          className="p-2 text-neutral-400 hover:text-white"
                          aria-label={`Decrease ${entry.menuItem.name}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm text-white">
                          {entry.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(entry.menuItem._id, 1)}
                          className="p-2 text-neutral-400 hover:text-white"
                          aria-label={`Increase ${entry.menuItem.name}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(entry.menuItem._id)}
                        className="rounded-lg border border-red-500/25 p-2 text-red-400 hover:bg-red-500/10"
                        aria-label={`Remove ${entry.menuItem.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={`${PANEL_CLASS} p-4 sm:p-5`}>
            <SectionTitle number="3">Pricing &amp; Discount</SectionTitle>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-500">Regular Total (Auto)</p>
                <p className="mt-2 text-xl font-semibold text-dune-amber">
                  {formatAdminCurrency(regularPrice)}
                </p>
              </div>
              <label className="text-xs text-neutral-400">
                Combo Price (SAR)
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={form.comboPrice}
                  onChange={(event) =>
                    setForm({ ...form, comboPrice: event.target.value })
                  }
                  className={FIELD_CLASS}
                />
              </label>
              <div>
                <p className="text-xs text-neutral-500">Customer Saves</p>
                <p className="mt-2 text-xl font-semibold text-emerald-400">
                  {formatAdminCurrency(savings)} ({discount}%)
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className={`${PANEL_CLASS} overflow-hidden 2xl:sticky 2xl:top-20`}>
          <div className="border-b border-white/[0.07] px-4 py-3.5">
            <h2 className="font-semibold text-white">Combo Preview</h2>
          </div>
          <div className="p-4">
            <div className="h-52 overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
              {form.image ? (
                <SmartImage
                  src={form.image}
                  alt={form.name || "Combo preview"}
                  width={780}
                  height={416}
                  sizes="390px"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-neutral-700">
                  <Layers3 className="h-10 w-10" />
                </div>
              )}
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">
              {form.name || "Your Combo Name"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-neutral-400">
              {form.description || "Your combo description will appear here."}
            </p>
            <div className="mt-4">
              <span className="rounded-full bg-dune-amber/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-dune-amber">
                Includes
              </span>
              <ul className="mt-3 space-y-2">
                {selectedItems.map((entry) => (
                  <li
                    key={entry.menuItem._id}
                    className="flex items-center justify-between gap-4 text-sm text-neutral-300"
                  >
                    <span className="truncate">• {entry.menuItem.name}</span>
                    <span className="shrink-0">× {entry.quantity}</span>
                  </li>
                ))}
                {!selectedItems.length && (
                  <li className="text-sm text-neutral-600">No items selected yet.</li>
                )}
              </ul>
            </div>
            <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-sm">
              <div className="flex justify-between text-neutral-400">
                <span>Regular Total</span>
                <span>{formatAdminCurrency(regularPrice)}</span>
              </div>
              <div className="flex justify-between font-semibold text-white">
                <span>Combo Price</span>
                <span className="text-dune-amber">
                  {formatAdminCurrency(numericComboPrice)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>You Save</span>
                <span>
                  {formatAdminCurrency(savings)} ({discount}%)
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const CombosTab = ({ onDataChanged }) => {
  const [combos, setCombos] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(undefined);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [comboData, itemData] = await Promise.all([
        fetchAllCombos(),
        fetchAllMenuItems(),
      ]);
      setCombos(comboData);
      setMenuItems(itemData);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load combos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return combos.filter(
      (combo) =>
        (status === "all" || combo.status === status) &&
        (!normalized ||
          combo.name.toLowerCase().includes(normalized) ||
          combo.description.toLowerCase().includes(normalized))
    );
  }, [combos, query, status]);

  const saveFinished = async () => {
    setEditing(undefined);
    await load(true);
    onDataChanged?.();
  };

  const toggleAvailability = async (combo) => {
    try {
      const updated = await updateCombo(combo._id, {
        isAvailable: !combo.isAvailable,
      });
      setCombos((current) =>
        current.map((entry) => (entry._id === combo._id ? updated : entry))
      );
      toast.success(
        updated.isAvailable ? "Combo is now available." : "Combo deactivated."
      );
      onDataChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.error || "Unable to update combo.");
    }
  };

  const remove = (combo) =>
    confirmDelete({
      title: `Delete “${combo.name}”?`,
      description: "This removes the combo package and cannot be undone.",
      onConfirm: async () => {
        await deleteCombo(combo._id);
        setCombos((current) =>
          current.filter((entry) => entry._id !== combo._id)
        );
        onDataChanged?.();
      },
      successMessage: "Combo deleted.",
      errorMessage: "Unable to delete combo.",
    });

  if (editing !== undefined) {
    return (
      <ComboBuilder
        combo={editing}
        menuItems={menuItems}
        onCancel={() => setEditing(undefined)}
        onSaved={saveFinished}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search combos…"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-lg border border-white/10 bg-[#0d1113] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-neutral-300 hover:border-dune-amber/40 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black hover:bg-dune-amberLight"
        >
          <Plus className="h-4 w-4" /> Create New Combo
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((combo) => (
          <article
            key={combo._id}
            className="overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]"
          >
            <div className="relative h-44">
              <SmartImage
                src={combo.image}
                alt={combo.name}
                width={720}
                height={352}
                sizes="(min-width: 1536px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1113] via-transparent to-transparent" />
              <div className="absolute left-3 top-3 flex gap-2">
                <span
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    combo.status === "published"
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {combo.status}
                </span>
                {combo.isFeatured && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-dune-amber/30 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-dune-amber">
                    <Sparkles className="h-3 w-3" /> Featured #{combo.featuredOrder}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">{combo.name}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
                    {combo.description}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-dune-amber">
                  {formatAdminCurrency(combo.comboPrice)}
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                {combo.items.length} included items · Regular {formatAdminCurrency(combo.regularPrice)}
              </p>
              {combo.discountAmount > 0 && (
                <p className="mt-1 text-xs font-medium text-emerald-400">
                  Saves {formatAdminCurrency(combo.discountAmount)} ({combo.discountPercentage}%)
                </p>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3">
                <button
                  type="button"
                  onClick={() => toggleAvailability(combo)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                    combo.isAvailable
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {combo.isAvailable ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {combo.isAvailable ? "Available" : "Inactive"}
                </button>
                <span className="text-[11px] text-neutral-600">
                  {formatAdminDate(combo.updatedAt)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(combo)}
                    aria-label={`Edit ${combo.name}`}
                    className="rounded-lg border border-white/10 p-2 text-neutral-300 hover:border-dune-amber/50 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(combo)}
                    aria-label={`Delete ${combo.name}`}
                    className="rounded-lg border border-white/10 p-2 text-neutral-300 hover:border-red-500/50 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {!loading && !filtered.length && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-16 text-center">
          <Layers3 className="mx-auto h-9 w-9 text-neutral-700" />
          <p className="mt-3 text-sm text-neutral-500">
            No combo packages match these filters.
          </p>
        </div>
      )}
      {loading && !combos.length && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-16 text-center text-sm text-neutral-500">
          <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-dune-amber" />
          Loading combo packages…
        </div>
      )}
    </div>
  );
};

export default CombosTab;
