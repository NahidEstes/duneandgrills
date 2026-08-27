"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ArrowLeft,
  LayoutDashboard,
  ClipboardList,
  Newspaper,
  UtensilsCrossed,
  Settings,
  LogOut,
  Flame,
  Tag,
} from "lucide-react";
import {
  fetchMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../api/api.js";
import { formatPrice } from "../utils/currency.js";
import OrdersTab from "./OrdersTab.jsx";
import BlogTab from "./BlogTab.jsx";
import OffersTab from "./OffersTab.jsx";
import SmartImage from "./SmartImage.jsx";

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
};

// const NAV_ITEMS = [
//   { id: "overview", label: "Overview", icon: LayoutDashboard },
//   { id: "menu", label: "Menu Items", icon: UtensilsCrossed },
//   { id: "settings", label: "Website Settings", icon: Settings },
// ];

// const NAV_ITEMS = [
//   { id: "overview", label: "Overview", icon: LayoutDashboard },
//   { id: "menu", label: "Menu Items", icon: UtensilsCrossed },
//   { id: "orders", label: "Orders", icon: ClipboardList },
//   { id: "settings", label: "Website Settings", icon: Settings },
// ];

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "menu", label: "Menu Items", icon: UtensilsCrossed },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "blog", label: "Blog", icon: Newspaper },
  { id: "offers", label: "Offers", icon: Tag },
  { id: "settings", label: "Website Settings", icon: Settings },
];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await fetchMenuItems();
      setItems(data);
    } catch (err) {
      setError("Failed to load menu items. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (item) => {
    setForm({
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      image: item.image,
      tags: (item.tags || []).join(", "),
      calories: item.calories || "",
      ingredients: (item.ingredients || []).join(", "),
      isFeatured: item.isFeatured || false,
    });
    setEditingId(item._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category: form.category,
      image: form.image,
      tags: form.tags
        ? form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      calories: form.calories ? Number(form.calories) : 0,
      ingredients: form.ingredients
        ? form.ingredients
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      isFeatured: form.isFeatured,
    };

    try {
      if (editingId) {
        await updateMenuItem(editingId, payload);
      } else {
        await createMenuItem(payload);
      }
      setShowForm(false);
      loadItems();
    } catch (err) {
      setError(
        "Save failed. Check that all required fields are filled correctly."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      await deleteMenuItem(id);
      setItems((prev) => prev.filter((i) => i._id !== id));
    } catch (err) {
      alert("Delete failed.");
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (allIds) => {
    setSelectedIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const handleBulkDelete = async () => {
    if (
      !window.confirm(
        `Delete ${selectedIds.length} selected item(s)? This can't be undone.`
      )
    )
      return;
    try {
      await Promise.all(selectedIds.map((id) => deleteMenuItem(id)));
      setItems((prev) => prev.filter((i) => !selectedIds.includes(i._id)));
      setSelectedIds([]);
    } catch (err) {
      alert("Bulk delete failed.");
    }
  };

  const featuredCount = items.filter((i) => i.isFeatured).length;
  const categoriesPreview =
    [...new Set(items.map((i) => i.category))].join(", ") || "—";

  return (
    <div className="min-h-screen bg-black text-neutral-200 font-body flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-dune-border p-6">
        <Link href="/" className="flex items-center gap-2 mb-10">
          <Flame className="w-5 h-5 text-dune-amber" />
          <span className="font-display text-xl tracking-widest text-white leading-tight">
            DUNE &amp; <br /> GRILLS
          </span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-dune-amber/10 text-dune-amber border border-dune-amber/40"
                  : "text-neutral-400 hover:text-white hover:bg-dune-surface"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Back to Site
        </Link>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="border-b border-dune-border">
          <div className="px-6 md:px-10 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="md:hidden text-neutral-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-lg font-semibold text-white">
                {/* {activeTab === "overview" && "Menu & Catalog Control"}
                {activeTab === "menu" && "Menu Items"}
                {activeTab === "settings" && "Website Settings"} */}
                {activeTab === "overview" && "Menu & Catalog Control"}
                {activeTab === "menu" && "Menu Items"}
                {activeTab === "orders" && "Order Management"}
                {activeTab === "blog" && "Blog Management"}
                {activeTab === "offers" && "Offer Management"}
                {activeTab === "settings" && "Website Settings"}
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Live
            </div>
          </div>
        </div>

        <div className="p-6 md:p-10">
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          {/* Overview tab */}
          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
                <div className="rounded-2xl border border-dune-border bg-dune-surface p-6">
                  <p className="text-neutral-400 text-sm">Active Menu Items</p>
                  <p className="font-display text-4xl text-white mt-2">
                    {items.length} Items
                  </p>
                  <p className="text-dune-amber text-sm mt-1">
                    {categoriesPreview}
                  </p>
                </div>
                <div className="rounded-2xl border border-dune-border bg-dune-surface p-6">
                  <p className="text-neutral-400 text-sm">Featured Items</p>
                  <p className="font-display text-4xl text-dune-amber mt-2">
                    {featuredCount} Dishes
                  </p>
                  <p className="text-neutral-400 text-sm mt-1">
                    Shown on Home Page
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  Recent Items
                </h2>
                <button
                  onClick={openAddForm}
                  className="inline-flex items-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-4 py-2 rounded-full text-sm"
                >
                  <Plus className="w-4 h-4" /> Add New Item
                </button>
              </div>

              <MenuTable
                items={items.slice(0, 5)}
                loading={loading}
                onEdit={openEditForm}
                onDelete={handleDelete}
              />
            </>
          )}

          {/* Menu Items tab */}
          {/* {activeTab === "menu" && (
            <>
              <div className="flex justify-end mb-4">
                <button
                  onClick={openAddForm}
                  className="inline-flex items-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-4 py-2 rounded-full text-sm"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>
              <MenuTable
                items={items}
                loading={loading}
                onEdit={openEditForm}
                onDelete={handleDelete}
              />
            </>
          )} */}

          {activeTab === "menu" && (
            <>
              <div className="flex justify-end gap-3 mb-4">
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="inline-flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-400/50 text-red-400 font-semibold px-4 py-2 rounded-full text-sm"
                  >
                    <Trash2 className="w-4 h-4" /> Delete ({selectedIds.length})
                  </button>
                )}
                <button
                  onClick={openAddForm}
                  className="inline-flex items-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-4 py-2 rounded-full text-sm"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>
              <MenuTable
                items={items}
                loading={loading}
                onEdit={openEditForm}
                onDelete={handleDelete}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
              />
            </>
          )}
          {/* Orders tab */}
          {activeTab === "orders" && <OrdersTab />}
          {/* Blog tab */}
          {activeTab === "blog" && <BlogTab />}
          {/* Offers tab */}
          {activeTab === "offers" && <OffersTab />}
          {/* Settings tab */}
          {activeTab === "settings" && (
            <div className="rounded-2xl border border-dune-border bg-dune-surface p-10 text-center text-neutral-400">
              Website settings are coming soon.
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-2xl border border-dune-border bg-dune-surface p-6 my-8"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-white">
                {editingId ? "Edit Item" : "Add New Item"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-neutral-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                required
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <textarea
                required
                rows={2}
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
                />
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
                >
                  <option value="Food">Food</option>
                  <option value="Drinks">Drinks</option>
                  <option value="Appetizers">Appetizers</option>
                </select>
              </div>
              <input
                required
                placeholder="Image URL"
                value={form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <input
                placeholder="Tags (comma separated, e.g. bestseller, spicy)"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Calories"
                  value={form.calories}
                  onChange={(e) =>
                    setForm({ ...form, calories: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(e) =>
                      setForm({ ...form, isFeatured: e.target.checked })
                    }
                    className="w-4 h-4 accent-amber-600"
                  />
                  Featured item
                </label>
              </div>
              <input
                placeholder="Ingredients (comma separated)"
                value={form.ingredients}
                onChange={(e) =>
                  setForm({ ...form, ingredients: e.target.value })
                }
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-6 bg-dune-amber hover:bg-dune-amberLight disabled:opacity-60 text-black font-semibold py-3 rounded-full"
            >
              {saving ? "Saving..." : editingId ? "Update Item" : "Create Item"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// Reusable menu table used by both the Overview and Menu Items tabs
// const MenuTable = ({ items, loading, onEdit, onDelete }) => {
//   if (loading) return <p className="text-neutral-500">Loading menu items...</p>;

//   return (
//     <div className="overflow-x-auto rounded-xl border border-dune-border">
//       <table className="w-full text-sm">
//         <thead>
//           <tr className="border-b border-dune-border text-left text-neutral-400">
//             <th className="p-4">Image</th>
//             <th className="p-4">Name</th>
//             <th className="p-4">Category</th>
//             <th className="p-4">Price</th>
//             <th className="p-4">Available</th>
//             <th className="p-4 text-right">Actions</th>
//           </tr>
//         </thead>
//         <tbody>
//           {items.map((item) => (
//             <tr
//               key={item._id}
//               className="border-b border-dune-border last:border-0"
//             >
//               <td className="p-4">
//                 <img
//                   src={item.image}
//                   alt={item.name}
//                   className="w-12 h-12 rounded-lg object-cover"
//                 />
//               </td>
//               <td className="p-4 text-white font-medium">{item.name}</td>
//               <td className="p-4">{item.category}</td>
//               <td className="p-4 text-dune-amber">${item.price.toFixed(2)}</td>
//               <td className="p-4">{item.isAvailable ? "Yes" : "No"}</td>
//               <td className="p-4">
//                 <div className="flex justify-end gap-2">
//                   <button
//                     onClick={() => onEdit(item)}
//                     className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
//                   >
//                     <Pencil className="w-3.5 h-3.5" />
//                   </button>
//                   <button
//                     onClick={() => onDelete(item._id, item.name)}
//                     className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-red-400 text-white"
//                   >
//                     <Trash2 className="w-3.5 h-3.5" />
//                   </button>
//                 </div>
//               </td>
//             </tr>
//           ))}
//           {items.length === 0 && (
//             <tr>
//               <td colSpan={6} className="p-8 text-center text-neutral-500">
//                 No menu items yet. Click "Add Item" to create one.
//               </td>
//             </tr>
//           )}
//         </tbody>
//       </table>
//     </div>
//   );
// };
// Reusable menu table used by both the Overview and Menu Items tabs
const MenuTable = ({
  items,
  loading,
  onEdit,
  onDelete,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
}) => {
  if (loading) return <p className="text-neutral-500">Loading menu items...</p>;

  const allIds = items.map((i) => i._id);
  const allSelected =
    selectable && items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-dune-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dune-border text-left text-neutral-400">
            {selectable && (
              <th className="p-4 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll(allIds)}
                  className="w-4 h-4 accent-amber-600"
                />
              </th>
            )}
            <th className="p-4">Image</th>
            <th className="p-4">Name</th>
            <th className="p-4">Category</th>
            <th className="p-4">Price</th>
            <th className="p-4">Available</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item._id}
              onClick={() => onEdit(item)}
              className="border-b border-dune-border last:border-0 cursor-pointer hover:bg-dune-surface transition-colors"
            >
              {selectable && (
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item._id)}
                    onChange={() => onToggleSelect(item._id)}
                    className="w-4 h-4 accent-amber-600"
                  />
                </td>
              )}
              <td className="p-4">
                <SmartImage
                  src={item.image}
                  alt={item.name}
                  width={96}
                  height={96}
                  sizes="48px"
                  className="w-12 h-12 rounded-lg object-cover"
                />
              </td>
              <td className="p-4 text-white font-medium">{item.name}</td>
              <td className="p-4">{item.category}</td>
              {/* <td className="p-4 text-dune-amber">${item.price.toFixed(2)}</td> */}
              <td className="p-4 text-dune-amber">{formatPrice(item.price)}</td>
              <td className="p-4">{item.isAvailable ? "Yes" : "No"}</td>
              <td className="p-4">
                <div
                  className="flex justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onEdit(item)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(item._id, item.name)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-red-400 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={selectable ? 7 : 6}
                className="p-8 text-center text-neutral-500"
              >
                No menu items yet. Click &quot;Add Item&quot; to create one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminDashboard;
