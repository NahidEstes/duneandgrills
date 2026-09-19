"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Heart, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../context/CartContext.jsx";
import { useFavorites } from "../context/FavoritesContext.jsx";
import { formatPrice } from "../utils/currency.js";
import SmartImage from "./SmartImage.jsx";

const SPICE_LABELS = { "no-spice": "No Spice", mild: "Mild", medium: "Medium", hot: "Hot" };

const ItemModal = ({ item, onClose }) => {
  const { addToCart } = useCart();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState([]);
  const [spiceLevel, setSpiceLevel] = useState("");
  const [note, setNote] = useState("");

  const isCombo = item?.productType === "combo";
  const customizationEnabled = !isCombo && Boolean(item?.customization?.enabled);
  const spice = item?.customization?.spice || {};

  useEffect(() => {
    if (!item) return undefined;
    setQuantity(1);
    setSelectedAddOnIds([]);
    setSpiceLevel(customizationEnabled && spice.enabled ? spice.default || spice.options?.[0] || "" : "");
    setNote("");
    const previousOverflow = document.body.style.overflow;
    const onEsc = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [customizationEnabled, item, onClose, spice.default, spice.enabled, spice.options]);

  const selectedAddOns = useMemo(
    () => (item?.addOns || []).filter((addOn) => selectedAddOnIds.includes(String(addOn._id))),
    [item?.addOns, selectedAddOnIds]
  );
  const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + Number(addOn.price || 0), 0);
  const unitPrice = Number((Number(item?.price || 0) + addOnTotal).toFixed(2));
  const total = Number((unitPrice * quantity).toFixed(2));

  if (!item) return null;
  const isFavorite = favoriteIds.has(item._id);

  const handleFavorite = async () => {
    const result = await toggleFavorite(item);
    if (result?.requiresLogin) {
      onClose();
      router.push("/login");
    }
  };

  const toggleAddOn = (id) => {
    const normalized = String(id);
    setSelectedAddOnIds((current) => current.includes(normalized) ? current.filter((entry) => entry !== normalized) : [...current, normalized]);
  };

  const handleAdd = () => {
    const selectedSpice = customizationEnabled && spice.enabled ? spiceLevel : "";
    const trimmedNote = customizationEnabled ? note.trim() : "";
    const customizationKey = customizationEnabled && (selectedAddOnIds.length || selectedSpice || trimmedNote)
      ? JSON.stringify({ addOns: [...selectedAddOnIds].sort(), spiceLevel: selectedSpice, note: trimmedNote })
      : "";
    const added = addToCart({
      ...item,
      quantity,
      basePrice: Number(item.price),
      price: unitPrice,
      selectedAddOns,
      spiceLevel: selectedSpice,
      note: trimmedNote,
      customizationKey,
    });
    if (!added) {
      toast.error("This configured item has reached the cart quantity limit.");
      return;
    }
    toast.success(`${quantity} × ${item.name} added to cart`);
    onClose();
  };

  return (
    <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/85 backdrop-blur-md sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="customization-title" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0c1012] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-white/10 lg:grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-64 overflow-hidden bg-black lg:min-h-[680px]">
          <SmartImage src={item.image} alt={item.name} width={1100} height={1300} sizes="(min-width: 1024px) 42vw, 100vw" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
          {item.calories > 0 && <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full border border-dune-amber/40 bg-black/75 px-3 py-1.5 text-xs font-medium text-dune-amber backdrop-blur"><Flame className="h-3.5 w-3.5" /> {item.calories} kcal</span>}
        </div>

        <div className="relative flex min-h-0 flex-col">
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <button type="button" onClick={handleFavorite} aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} aria-pressed={isFavorite} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/75 text-white hover:border-dune-amber hover:text-dune-amber"><Heart className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} /></button>
            <button type="button" onClick={onClose} aria-label="Close item customization" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/75 text-white hover:border-dune-amber hover:text-dune-amber"><X className="h-5 w-5" /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-2 sm:p-7 lg:p-9">
            <p className="eyebrow">{item.category || (isCombo ? "Combo" : "Menu Item")}</p>
            <div className="mt-2 flex items-start justify-between gap-4 pr-24">
              <h2 id="customization-title" className="text-2xl font-semibold text-white sm:text-3xl">{item.name}</h2>
              <span className="shrink-0 font-display text-2xl text-dune-amber">{formatPrice(item.price)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-400">{item.description}</p>

            {isCombo && item.includedItems?.length > 0 && <div className="mt-5 rounded-2xl border border-dune-border bg-black/25 p-4"><p className="eyebrow mb-3">Package Includes</p><div className="space-y-2">{item.includedItems.map((entry) => <div key={entry.menuItem?._id || entry.menuItem} className="flex justify-between gap-4 text-sm"><span className="text-neutral-300">{entry.menuItem?.name || "Menu item"}</span><span className="text-dune-amber">×{entry.quantity}</span></div>)}</div></div>}

            <div className="mt-5"><p className="mb-2 text-xs font-semibold text-neutral-300">Quantity</p><div className="inline-flex items-center rounded-xl border border-white/10 bg-black/30"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-11 w-11 place-items-center text-neutral-300 hover:text-dune-amber" aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button><span className="w-12 text-center text-sm font-semibold text-white">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} className="grid h-11 w-11 place-items-center text-neutral-300 hover:text-dune-amber" aria-label="Increase quantity"><Plus className="h-4 w-4" /></button></div></div>

            {customizationEnabled && item.addOns?.length > 0 && <fieldset className="mt-6"><legend className="text-sm font-semibold text-white">Add-ons <span className="font-normal text-neutral-600">(Optional)</span></legend><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{item.addOns.map((addOn) => { const selected = selectedAddOnIds.includes(String(addOn._id)); return <button key={addOn._id} type="button" aria-pressed={selected} onClick={() => toggleAddOn(addOn._id)} className={`relative flex min-h-24 items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-dune-amber bg-dune-amber/10" : "border-white/10 bg-black/20 hover:border-dune-amber/45"}`}>{addOn.image ? <SmartImage src={addOn.image} alt="" width={96} height={96} sizes="56px" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/5 text-dune-amber"><Plus className="h-5 w-5" /></span>}<span className="min-w-0"><span className="block text-sm font-medium text-white">{addOn.name}</span><span className="mt-1 block text-xs font-semibold text-dune-amber">+ {formatPrice(addOn.price)}</span></span>{selected && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-dune-amber text-black"><Check className="h-3 w-3" /></span>}</button>; })}</div></fieldset>}

            {customizationEnabled && spice.enabled && spice.options?.length > 0 && <fieldset className="mt-6"><legend className="text-sm font-semibold text-white">Spice Level</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{spice.options.map((option) => <button key={option} type="button" aria-pressed={spiceLevel === option} onClick={() => setSpiceLevel(option)} className={`min-h-11 rounded-xl border px-3 text-xs font-medium transition ${spiceLevel === option ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 bg-black/20 text-neutral-400 hover:border-dune-amber/45"}`}>{SPICE_LABELS[option] || option}</button>)}</div></fieldset>}

            {customizationEnabled && <label className="mt-6 block text-sm font-semibold text-white">Special instructions <span className="font-normal text-neutral-600">(Optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 240))} rows={3} placeholder="E.g. no onions, sauce on the side…" className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-normal text-white outline-none placeholder:text-neutral-700 focus:border-dune-amber/60" /><span className="mt-1 block text-right text-[11px] font-normal text-neutral-700">{note.length}/240</span></label>}

            {item.ingredients?.length > 0 && <div className="mt-6"><p className="eyebrow mb-2">Ingredients</p><div className="flex flex-wrap gap-2">{item.ingredients.map((ingredient) => <span key={ingredient} className="rounded-full border border-dune-border px-3 py-1 text-xs text-neutral-300">{ingredient}</span>)}</div></div>}
          </div>

          <div className="border-t border-white/10 bg-[#0c1012]/95 p-4 sm:px-7 sm:py-5 lg:px-9"><button type="button" onClick={handleAdd} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-dune-amber px-5 font-semibold text-black transition hover:bg-dune-amberLight"><ShoppingCart className="h-4 w-4" /> Add to Cart · {formatPrice(total)}</button></div>
        </div>
      </section>
    </div>
  );
};

export default ItemModal;
