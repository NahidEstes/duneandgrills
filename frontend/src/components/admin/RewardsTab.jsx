"use client";

import { useEffect, useState } from "react";
import { Gift, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createReward,
  deleteReward,
  fetchAllMenuItems,
  fetchAllRewards,
  updateReward,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import { confirmDelete } from "./deleteToast.js";

const emptyForm = () => ({
  title: "",
  description: "",
  image: "",
  pointsRequired: "",
  menuItem: "",
  isActive: true,
  sortOrder: "0",
});

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-dune-border bg-black px-4 py-2.5 text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber";

const RewardsTab = ({ onDataChanged }) => {
  const [rewards, setRewards] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const [rewardRows, menuRows] = await Promise.all([
        fetchAllRewards(),
        fetchAllMenuItems(),
      ]);
      setRewards(rewardRows);
      setMenuItems(menuRows);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load rewards.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (reward) => {
    setEditingId(reward._id);
    setForm({
      title: reward.title,
      description: reward.description,
      image: reward.image,
      pointsRequired: String(reward.pointsRequired),
      menuItem: reward.menuItem?._id || "",
      isActive: Boolean(reward.isActive),
      sortOrder: String(reward.sortOrder ?? 0),
    });
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      pointsRequired: Number(form.pointsRequired),
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (editingId) {
        await updateReward(editingId, payload);
        toast.success("Reward updated successfully.");
      } else {
        await createReward(payload);
        toast.success("Reward created successfully.");
      }
      setShowForm(false);
      await load();
      onDataChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Reward could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (reward) =>
    confirmDelete({
      title: `Delete “${reward.title}”?`,
      description:
        "It will disappear from available rewards, while existing order and points history remain intact.",
      onConfirm: async () => {
        await deleteReward(reward._id);
        setRewards((current) =>
          current.filter((entry) => entry._id !== reward._id)
        );
        onDataChanged?.();
      },
      successMessage: "Reward deleted successfully.",
      errorMessage: "Unable to delete reward.",
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          Manage point-based rewards separately from Exclusive Offers.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-dune-amber px-4 py-2 text-sm font-semibold text-black hover:bg-dune-amberLight"
        >
          <Plus className="h-4 w-4" /> Add Reward
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading rewards…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dune-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-dune-border text-left text-neutral-400">
                <th className="p-4">Reward</th>
                <th className="p-4">Linked Menu Item</th>
                <th className="p-4">Points</th>
                <th className="p-4">Sort</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((reward) => (
                <tr
                  key={reward._id}
                  className="border-b border-dune-border last:border-0 hover:bg-white/[0.025]"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <SmartImage
                        src={reward.image}
                        alt=""
                        width={96}
                        height={96}
                        sizes="48px"
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="max-w-64 truncate font-medium text-white">
                          {reward.title}
                        </p>
                        <p className="mt-1 max-w-64 truncate text-xs text-neutral-500">
                          {reward.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-neutral-300">
                    {reward.menuItem?.name || "Unavailable item"}
                  </td>
                  <td className="p-4 font-semibold text-dune-amber">
                    {reward.pointsRequired.toLocaleString()} pts
                  </td>
                  <td className="p-4 text-neutral-400">{reward.sortOrder}</td>
                  <td className="p-4">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        reward.isActive
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                          : "border-neutral-500/35 bg-neutral-500/10 text-neutral-400"
                      }`}
                    >
                      {reward.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(reward)}
                        aria-label={`Edit ${reward.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-dune-border text-white hover:border-dune-amber"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(reward)}
                        aria-label={`Delete ${reward.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-dune-border text-white hover:border-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rewards.length && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-neutral-500">
                    <Gift className="mx-auto mb-3 h-7 w-7 text-neutral-700" />
                    No rewards yet. Create the first points reward.
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
            className="my-8 w-full max-w-2xl rounded-2xl border border-dune-border bg-dune-surface p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl text-white">
                  {editingId ? "Edit Reward" : "Add New Reward"}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Reward points are verified only by the backend.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close reward form"
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Reward name
                <input
                  required
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  className={fieldClass}
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
                  className={`${fieldClass} resize-none`}
                />
              </label>
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Reward image URL
                <input
                  required
                  type="url"
                  value={form.image}
                  onChange={(event) => updateField("image", event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-xs text-neutral-400">
                Required points
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.pointsRequired}
                  onChange={(event) =>
                    updateField("pointsRequired", event.target.value)
                  }
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </label>
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Linked menu item
                <select
                  required
                  value={form.menuItem}
                  onChange={(event) =>
                    updateField("menuItem", event.target.value)
                  }
                  className={fieldClass}
                >
                  <option value="">Select a menu item</option>
                  {menuItems.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} {item.isAvailable ? "" : "(Unavailable)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    updateField("isActive", event.target.checked)
                  }
                  className="h-4 w-4 accent-amber-600"
                />
                Active and available to customers
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-full bg-dune-amber py-3 font-semibold text-black hover:bg-dune-amberLight disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : editingId
                  ? "Update Reward"
                  : "Create Reward"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default RewardsTab;
