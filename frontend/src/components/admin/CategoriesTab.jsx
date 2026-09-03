"use client";

import {
  Check,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createContentCategory,
  deleteContentCategory,
  fetchManagedCategories,
  updateContentCategory,
} from "../../api/api.js";
import { confirmDelete } from "./deleteToast.js";

const EMPTY_FORM = {
  name: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-black/50 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60";

const categoryCopy = {
  menu: {
    tab: "Menu Categories",
    singular: "menu category",
    content: "menu items",
    empty: "Create categories for dishes, drinks, sides, and other menu items.",
    Icon: UtensilsCrossed,
  },
  blog: {
    tab: "Blog Categories",
    singular: "blog category",
    content: "blog posts",
    empty: "Create categories for recipes, news, tips, and restaurant stories.",
    Icon: FileText,
  },
};

const CategoriesTab = ({ onDataChanged }) => {
  const [type, setType] = useState("menu");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const requestId = useRef(0);

  const copy = categoryCopy[type];
  const CategoryIcon = copy.Icon;

  const loadCategories = useCallback(async (categoryType = type, silent = false) => {
    const currentRequest = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const data = await fetchManagedCategories(categoryType);
      if (currentRequest === requestId.current) setCategories(data);
    } catch (error) {
      if (currentRequest === requestId.current) {
        toast.error(error.response?.data?.message || "Unable to load categories.");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    setQuery("");
    setVisibility("all");
    setCategories([]);
    loadCategories(type);
  }, [loadCategories, type]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesSearch =
        !normalized ||
        category.name.toLowerCase().includes(normalized) ||
        category.description?.toLowerCase().includes(normalized);
      const matchesVisibility =
        visibility === "all" ||
        (visibility === "active" ? category.isActive : !category.isActive);
      return matchesSearch && matchesVisibility;
    });
  }, [categories, query, visibility]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sortOrder: categories.length });
    setShowForm(true);
  };

  const openEdit = (category) => {
    setEditingId(category._id);
    setForm({
      name: category.name || "",
      description: category.description || "",
      sortOrder: category.sortOrder ?? 0,
      isActive: category.isActive !== false,
    });
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      type,
      name: form.name.trim(),
      description: form.description.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (editingId) {
        await updateContentCategory(editingId, payload);
        toast.success("Category updated successfully.");
      } else {
        await createContentCategory(payload);
        toast.success("Category created successfully.");
      }
      setShowForm(false);
      await loadCategories(type, true);
      onDataChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save category.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = async (category) => {
    try {
      const updated = await updateContentCategory(category._id, {
        type,
        isActive: !category.isActive,
      });
      setCategories((current) =>
        current.map((entry) => (entry._id === updated._id ? updated : entry))
      );
      toast.success(updated.isActive ? "Category activated." : "Category hidden from visitors.");
      onDataChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to change category status.");
    }
  };

  const removeCategory = (category) => {
    confirmDelete({
      title: `Delete “${category.name}”?`,
      description:
        category.itemCount > 0
          ? `This category is used by ${category.itemCount} ${copy.content}. Reassign them before deleting.`
          : "This category will be permanently removed.",
      onConfirm: async () => {
        await deleteContentCategory(category._id, type);
        setCategories((current) => current.filter((entry) => entry._id !== category._id));
        onDataChanged?.();
      },
      successMessage: "Category deleted.",
      errorMessage: "Unable to delete category.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 rounded-lg bg-black/35 p-1">
          {Object.entries(categoryCopy).map(([key, entry]) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                type === key ? "bg-dune-amber text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              {entry.tab}
            </button>
          ))}
        </div>
        <button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 text-sm font-semibold text-black hover:bg-dune-amberLight">
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {categories.slice(0, 5).map((category) => {
          const visibilityRate = category.itemCount
            ? Math.round((category.visibleCount / category.itemCount) * 100)
            : category.isActive ? 100 : 0;
          return (
            <article key={category._id} className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018] p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-dune-amber/10 text-dune-amber"><CategoryIcon className="h-5 w-5" /></span>
                <span className={`rounded-full px-2 py-1 text-[11px] ${category.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-500/10 text-neutral-500"}`}>{category.isActive ? "Active" : "Inactive"}</span>
              </div>
              <h2 className="mt-4 truncate font-body text-lg font-semibold text-white">{category.name}</h2>
              <p className="mt-1 text-sm text-neutral-400">{category.itemCount} {type === "menu" ? "items" : "posts"}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-dune-amber" style={{ width: `${visibilityRate}%` }} /></div>
              <p className="mt-2 text-xs text-neutral-600">{visibilityRate}% content visible</p>
            </article>
          );
        })}
        {!loading && categories.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-neutral-500">{copy.empty}</div>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-body text-base font-semibold text-white">Manage {copy.tab}</h2>
            <p className="mt-1 text-xs text-neutral-500">Names and visibility update every connected selector and public filter.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search categories…" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60 sm:w-64" />
            </div>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#0d1113] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="button" onClick={() => loadCategories(type)} aria-label="Refresh categories" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-neutral-400 hover:border-dune-amber/40 hover:text-white"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3 font-medium">Category</th><th className="px-3 py-3 font-medium">Content</th><th className="px-3 py-3 font-medium">Visible</th><th className="px-3 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
            <tbody className="divide-y divide-white/[0.055]">
              {filtered.map((category) => (
                <tr key={category._id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dune-amber/10 text-dune-amber"><FolderOpen className="h-4 w-4" /></span><span><span className="block font-medium text-white">{category.name}</span><span className="block max-w-md truncate text-xs text-neutral-500">{category.description || "No description"}</span></span></div></td>
                  <td className="px-3 py-3 text-neutral-300">{category.itemCount} {type === "menu" ? "items" : "posts"}</td>
                  <td className="px-3 py-3 text-neutral-400">{category.visibleCount}</td>
                  <td className="px-3 py-3"><button type="button" onClick={() => toggleCategory(category)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${category.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-500/10 text-neutral-500"}`}>{category.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{category.isActive ? "Active" : "Inactive"}</button></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEdit(category)} aria-label={`Edit ${category.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:border-dune-amber/50 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeCategory(category)} aria-label={`Delete ${category.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:border-red-500/50 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="px-4 py-12 text-center text-sm text-neutral-500">Loading categories…</p>}
        {!loading && filtered.length === 0 && categories.length > 0 && <p className="px-4 py-12 text-center text-sm text-neutral-500">No categories match these filters.</p>}
        <div className="border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-600">Showing {filtered.length} of {categories.length} categories</div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()} className="my-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-body text-xl font-semibold text-white">{editingId ? "Edit" : "Add"} {copy.singular}</h2><p className="mt-1 text-xs text-neutral-500">This category is independent from the other content system.</p></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close form" className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="space-y-4">
              <label className="block text-xs text-neutral-400">Category name<input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="block text-xs text-neutral-400">Description<textarea rows={3} maxLength={240} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${FIELD_CLASS} resize-none`} /></label>
              <label className="block text-xs text-neutral-400">Display order<input min="0" step="1" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} className={FIELD_CLASS} /></label>
              <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-600" /> Active and visible to visitors</label>
            </div>
            <button type="submit" disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-dune-amber px-5 font-semibold text-black hover:bg-dune-amberLight disabled:opacity-60">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : editingId ? "Update Category" : "Create Category"}</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default CategoriesTab;
