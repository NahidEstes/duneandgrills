"use client";

import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createMenuAddOn,
  deleteMenuAddOn,
  fetchMenuAddOns,
  updateMenuAddOn,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import { formatAdminCurrency } from "./adminUi.js";

const EMPTY_ADD_ON = { name: "", price: "", image: "", isActive: true, menuItems: [] };
const INPUT = "mt-1.5 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-700 focus:border-dune-amber/60";
const menuItemIds = (addOn) => (addOn.menuItems || []).map((item) => String(item?._id || item));
const payloadFrom = (addOn, overrides = {}) => ({
  name: addOn.name,
  price: Number(addOn.price),
  image: addOn.image || "",
  isActive: addOn.isActive !== false,
  menuItems: menuItemIds(addOn),
  ...overrides,
});

export default function MenuCustomizationEditor({ currentItemId, menuItems }) {
  const [addOns, setAddOns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [editor, setEditor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAddOns(await fetchMenuAddOns());
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load add-ons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sortedItems = useMemo(
    () => [...menuItems].sort((a, b) => a.name.localeCompare(b.name)),
    [menuItems]
  );

  const toggleCurrentItem = async (addOn) => {
    if (!currentItemId || savingId) return;
    const currentIds = menuItemIds(addOn);
    const applied = currentIds.includes(String(currentItemId));
    setSavingId(addOn._id);
    try {
      const updated = await updateMenuAddOn(
        addOn._id,
        payloadFrom(addOn, {
          menuItems: applied
            ? currentIds.filter((id) => id !== String(currentItemId))
            : [...currentIds, String(currentItemId)],
        })
      );
      setAddOns((rows) => rows.map((row) => row._id === updated._id ? updated : row));
      toast.success(applied ? "Add-on removed from this item." : "Add-on applied to this item.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update add-on applicability.");
    } finally {
      setSavingId("");
    }
  };

  const saveEditor = async () => {
    if (!editor?.name.trim() || editor.price === "") return;
    setSavingId(editor._id || "new");
    try {
      const payload = { ...editor, price: Number(editor.price) };
      const saved = editor._id
        ? await updateMenuAddOn(editor._id, payload)
        : await createMenuAddOn(payload);
      setAddOns((rows) => editor._id
        ? rows.map((row) => row._id === saved._id ? saved : row)
        : [saved, ...rows]);
      setEditor(null);
      toast.success(editor._id ? "Add-on updated." : "Add-on created.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || "Unable to save add-on.");
    } finally {
      setSavingId("");
    }
  };

  const remove = async (addOn) => {
    if (!window.confirm(`Delete “${addOn.name}”? Existing order snapshots will be preserved.`)) return;
    setSavingId(addOn._id);
    try {
      await deleteMenuAddOn(addOn._id);
      setAddOns((rows) => rows.filter((row) => row._id !== addOn._id));
      toast.success("Add-on deleted.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete add-on.");
    } finally {
      setSavingId("");
    }
  };

  const openCreate = () => setEditor({
    ...EMPTY_ADD_ON,
    menuItems: currentItemId ? [String(currentItemId)] : [],
  });

  return (
    <section className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-white">Available add-ons</h3><p className="mt-1 text-xs text-neutral-600">Shared add-ons can be applied to one or more menu items.</p></div>
        <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-lg border border-dune-amber/40 px-3 text-xs font-semibold text-dune-amber hover:bg-dune-amber/10"><Plus className="h-3.5 w-3.5" />New add-on</button>
      </div>

      {!currentItemId && <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/70">Create this menu item first, then edit it to assign shared add-ons.</p>}
      {loading ? <div className="grid min-h-24 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-dune-amber" /></div> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{addOns.map((addOn) => {
        const applied = menuItemIds(addOn).includes(String(currentItemId));
        return <article key={addOn._id} className={`flex items-center gap-3 rounded-xl border p-3 ${applied ? "border-dune-amber/40 bg-dune-amber/[0.06]" : "border-white/[0.08] bg-white/[0.02]"}`}>
          {addOn.image ? <SmartImage src={addOn.image} alt="" width={72} height={72} sizes="40px" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-dune-amber"><Plus className="h-4 w-4" /></span>}
          <button type="button" disabled={!currentItemId || savingId === addOn._id} onClick={() => toggleCurrentItem(addOn)} className="min-w-0 flex-1 text-left disabled:opacity-50"><span className="block truncate text-sm font-medium text-white">{addOn.name}</span><span className="mt-0.5 block text-xs text-dune-amber">+ {formatAdminCurrency(addOn.price)} · {addOn.isActive ? "Active" : "Inactive"}</span><span className="mt-1 block text-[10px] text-neutral-600">{applied ? "Applied to this item" : "Click to apply"}</span></button>
          {savingId === addOn._id ? <LoaderCircle className="h-4 w-4 animate-spin text-neutral-500" /> : <div className="flex"><button type="button" onClick={() => setEditor({ ...payloadFrom(addOn), _id: addOn._id, price: String(addOn.price) })} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-dune-amber" aria-label={`Edit ${addOn.name}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => remove(addOn)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${addOn.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>}
        </article>;
      })}{!addOns.length && <p className="py-6 text-center text-xs text-neutral-600 sm:col-span-2">No add-ons created yet.</p>}</div>}

      {editor && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4" onMouseDown={(event) => event.target === event.currentTarget && setEditor(null)}><div role="dialog" aria-modal="true" aria-label={editor._id ? "Edit add-on" : "Create add-on"} className="my-8 w-full max-w-xl rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold text-white">{editor._id ? "Edit Add-on" : "New Add-on"}</h3><p className="mt-1 text-xs text-neutral-600">Price is added per menu item unit and validated by the server.</p></div><button type="button" onClick={() => setEditor(null)} className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs text-neutral-400 sm:col-span-2">Add-on name<input value={editor.name} maxLength={80} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className={INPUT} /></label><label className="text-xs text-neutral-400">Price (SAR)<input type="number" min="0" step="0.01" value={editor.price} onChange={(event) => setEditor({ ...editor, price: event.target.value })} className={INPUT} /></label><label className="text-xs text-neutral-400">Image URL or local path<input value={editor.image} onChange={(event) => setEditor({ ...editor, image: event.target.value })} className={INPUT} /></label></div>
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} className="h-4 w-4 accent-amber-600" />Active and selectable</label>
        <div className="mt-5"><p className="text-xs font-semibold text-neutral-300">Applies to menu items</p><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2">{sortedItems.map((item) => { const selected = editor.menuItems.includes(String(item._id)); return <label key={item._id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-neutral-300 hover:bg-white/5"><input type="checkbox" checked={selected} onChange={() => setEditor({ ...editor, menuItems: selected ? editor.menuItems.filter((id) => id !== String(item._id)) : [...editor.menuItems, String(item._id)] })} className="h-4 w-4 accent-amber-600" /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-neutral-700">{item.category}</span></label>; })}</div></div>
        <button type="button" onClick={saveEditor} disabled={Boolean(savingId) || !editor.name.trim() || editor.price === ""} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 font-semibold text-black disabled:opacity-50">{savingId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{editor._id ? "Update Add-on" : "Create Add-on"}</button></div></div>}
    </section>
  );
}
