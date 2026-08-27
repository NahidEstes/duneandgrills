"use client";

import {
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createMenuItem,
  deleteMenuItem,
  fetchAllMenuItems,
  updateMenuItem,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import { formatAdminCurrency, formatAdminDate } from "./adminUi.js";
import { confirmDelete } from "./deleteToast.js";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  category: "Food",
  image: "",
  tags: "",
  calories: "",
  ingredients: "",
  isFeatured: false,
  isAvailable: true,
};

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-black/50 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber/60";

const MenuItemsTab = ({ onDataChanged }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedIds, setSelectedIds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadItems = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await fetchAllMenuItems());
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load menu items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(items.map((item) => item.category))],
    [items]
  );
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesSearch =
        !normalized ||
        item.name.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized);
      return matchesCategory && matchesSearch;
    });
  }, [category, items, query]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingId(item._id);
    setForm({
      name: item.name || "",
      description: item.description || "",
      price: item.price ?? "",
      category: item.category || "Food",
      image: item.image || "",
      tags: (item.tags || []).join(", "),
      calories: item.calories || "",
      ingredients: (item.ingredients || []).join(", "),
      isFeatured: Boolean(item.isFeatured),
      isAvailable: Boolean(item.isAvailable),
    });
    setShowForm(true);
  };

  const toList = (value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price),
      calories: Number(form.calories) || 0,
      tags: toList(form.tags),
      ingredients: toList(form.ingredients),
    };

    try {
      if (editingId) {
        await updateMenuItem(editingId, payload);
        toast.success("Menu item updated successfully.");
      } else {
        await createMenuItem(payload);
        toast.success("Menu item created successfully.");
      }
      setShowForm(false);
      await loadItems(true);
      onDataChanged?.();
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Unable to save menu item."
      );
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (item) => {
    confirmDelete({
      title: `Delete “${item.name}”?`,
      description: "This removes the item from the public menu and cannot be undone.",
      onConfirm: async () => {
        await deleteMenuItem(item._id);
        setItems((current) => current.filter((entry) => entry._id !== item._id));
        setSelectedIds((current) => current.filter((id) => id !== item._id));
        onDataChanged?.();
      },
      successMessage: "Menu item deleted.",
      errorMessage: "Unable to delete menu item.",
    });
  };

  const removeSelected = () => {
    confirmDelete({
      title: `Delete ${selectedIds.length} selected items?`,
      description: "All selected items will be removed from the public menu.",
      onConfirm: async () => {
        await Promise.all(selectedIds.map((id) => deleteMenuItem(id)));
        setItems((current) => current.filter((item) => !selectedIds.includes(item._id)));
        setSelectedIds([]);
        onDataChanged?.();
      },
      successMessage: "Selected menu items deleted.",
      errorMessage: "Unable to delete all selected items.",
    });
  };

  const toggleAvailability = async (item) => {
    try {
      const updated = await updateMenuItem(item._id, {
        isAvailable: !item.isAvailable,
      });
      setItems((current) =>
        current.map((entry) => (entry._id === item._id ? updated : entry))
      );
      toast.success(updated.isAvailable ? "Item is now available." : "Item hidden from the public menu.");
      onDataChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update availability.");
    }
  };

  const visibleIds = filteredItems.map((item) => item._id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menu items…"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
          />
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#0d1113] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60">
          {categories.map((entry) => <option key={entry}>{entry}</option>)}
        </select>
        <button type="button" onClick={() => loadItems()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-neutral-300 hover:border-dune-amber/40 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        {selectedIds.length > 0 && (
          <button type="button" onClick={removeSelected} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm text-red-300 hover:bg-red-500/15">
            <Trash2 className="h-4 w-4" /> Delete ({selectedIds.length})
          </button>
        )}
        <button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black hover:bg-dune-amberLight">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/[0.07] text-xs text-neutral-500">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])])} className="h-4 w-4 accent-amber-600" aria-label="Select visible items" />
                </th>
                <th className="px-3 py-3 font-medium">Item</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Price</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Last Updated</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.055]">
              {filteredItems.map((item) => (
                <tr key={item._id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(item._id)} onChange={() => setSelectedIds((current) => current.includes(item._id) ? current.filter((id) => id !== item._id) : [...current, item._id])} className="h-4 w-4 accent-amber-600" aria-label={`Select ${item.name}`} /></td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => openEdit(item)} className="flex max-w-sm items-center gap-3 text-left">
                      <SmartImage src={item.image} alt="" width={96} height={96} sizes="44px" className="h-11 w-11 rounded-lg object-cover" />
                      <span className="min-w-0"><span className="block truncate font-medium text-white">{item.name}</span><span className="block max-w-xs truncate text-xs text-neutral-500">{item.description}</span></span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-neutral-300">{item.category}</td>
                  <td className="px-3 py-3 font-medium text-white">{formatAdminCurrency(item.price)}</td>
                  <td className="px-3 py-3"><button type="button" onClick={() => toggleAvailability(item)} className={`rounded-md px-2 py-1 text-xs ${item.isAvailable ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{item.isAvailable ? "Available" : "Hidden"}</button></td>
                  <td className="px-3 py-3 text-xs text-neutral-500">{formatAdminDate(item.updatedAt)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:border-dune-amber/50 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeItem(item)} aria-label={`Delete ${item.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:border-red-500/50 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !filteredItems.length && <p className="px-4 py-12 text-center text-sm text-neutral-500">No menu items match these filters.</p>}
        {loading && <p className="px-4 py-12 text-center text-sm text-neutral-500">Loading menu items…</p>}
        <div className="border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-600">Showing {filteredItems.length} of {items.length} menu items</div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()} className="my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-body text-xl font-semibold text-white">{editingId ? "Edit Menu Item" : "Add Menu Item"}</h2><p className="mt-1 text-xs text-neutral-500">Updates are reflected on the public menu immediately.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close form" className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral-400 sm:col-span-2">Item name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="text-xs text-neutral-400 sm:col-span-2">Description<textarea required rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${FIELD_CLASS} resize-none`} /></label>
              <label className="text-xs text-neutral-400">Price (SAR)<input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="text-xs text-neutral-400">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={FIELD_CLASS}><option>Food</option><option>Drinks</option><option>Appetizers</option></select></label>
              <label className="text-xs text-neutral-400 sm:col-span-2">Image URL or local path<input required value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="text-xs text-neutral-400">Tags (comma separated)<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="text-xs text-neutral-400">Calories<input min="0" type="number" value={form.calories} onChange={(event) => setForm({ ...form, calories: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="text-xs text-neutral-400 sm:col-span-2">Ingredients (comma separated)<input value={form.ingredients} onChange={(event) => setForm({ ...form, ingredients: event.target.value })} className={FIELD_CLASS} /></label>
            </div>
            <div className="mt-5 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={form.isAvailable} onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })} className="h-4 w-4 accent-amber-600" /> Available on public menu</label><label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })} className="h-4 w-4 accent-amber-600" /> Featured on homepage</label></div>
            <button type="submit" disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-dune-amber px-5 font-semibold text-black hover:bg-dune-amberLight disabled:opacity-60">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : editingId ? "Update Item" : "Create Item"}</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default MenuItemsTab;
