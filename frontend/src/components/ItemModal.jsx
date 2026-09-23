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
  const [activeImage, setActiveImage] = useState("");

  const isCombo = item?.productType === "combo";
  const customizationEnabled = !isCombo && Boolean(item?.customization?.enabled);
  const spice = item?.customization?.spice || {};

  useEffect(() => {
    if (!item) return undefined;
    setQuantity(1);
    setSelectedAddOnIds([]);
    setSpiceLevel(customizationEnabled && spice.enabled ? spice.default || spice.options?.[0] || "" : "");
    setNote("");
    setActiveImage(item.image || "");
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
  const gallery = [...new Set([item?.image, ...(item?.gallery || []), ...(item?.images || [])].filter(Boolean))].slice(0, 4);

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
    <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/90 backdrop-blur-md sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="customization-title" className="flex h-[100dvh] w-full flex-col overflow-y-auto bg-[#0c0f10] shadow-2xl sm:h-[calc(100dvh-2rem)] sm:max-h-[760px] sm:max-w-[1120px] sm:rounded-2xl sm:border sm:border-white/10 lg:grid lg:grid-cols-[47%_53%] lg:overflow-hidden">
        <div className="shrink-0 border-white/10 bg-[#090b0c] p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto lg:border-r">
          <div className="relative h-[250px] overflow-hidden rounded-xl bg-black sm:h-[340px] lg:h-[410px]">
            <SmartImage src={activeImage || item.image} alt={item.name} width={1000} height={820} sizes="(min-width: 1024px) 500px, 100vw" className="h-full w-full object-cover" priority />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5" />
          </div>
          {gallery.length > 1 && <div className="mt-3 grid grid-cols-4 gap-2">{gallery.map((image) => <button key={image} type="button" onClick={() => setActiveImage(image)} aria-label="Show product image" aria-pressed={(activeImage || item.image) === image} className={`relative h-16 overflow-hidden rounded-lg border transition sm:h-20 ${(activeImage || item.image) === image ? "border-dune-amber" : "border-white/10 hover:border-dune-amber/50"}`}><SmartImage src={image} alt="" fill sizes="100px" className="object-cover" /></button>)}</div>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {item.calories > 0 && <span className="inline-flex items-center gap-2 rounded-full border border-dune-amber/45 bg-dune-amber/[0.06] px-3 py-1.5 text-xs font-medium text-dune-amber"><Flame className="h-3.5 w-3.5" />{item.calories} kcal</span>}
          </div>
          {item.ingredients?.length > 0 && <div className="mt-4"><p className="eyebrow mb-2">Ingredients</p><div className="flex flex-wrap gap-2">{item.ingredients.map((ingredient) => <span key={ingredient} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-neutral-300">{ingredient}</span>)}</div></div>}
        </div>

        <div className="relative flex shrink-0 flex-col bg-gradient-to-br from-white/[0.035] to-transparent lg:min-h-0">
          <div className="absolute right-3 top-3 z-20 flex gap-2 sm:right-4 sm:top-4">
            <button type="button" onClick={handleFavorite} aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} aria-pressed={isFavorite} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/80 text-white transition hover:border-dune-amber hover:text-dune-amber"><Heart className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} /></button>
            <button type="button" onClick={onClose} aria-label="Close item customization" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/80 text-white transition hover:border-dune-amber hover:text-dune-amber"><X className="h-5 w-5" /></button>
          </div>

          <div className="px-5 pb-4 pt-6 sm:px-7 sm:pt-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-8">
            <p className="eyebrow text-[0.65rem]">{item.category || (isCombo ? "Combo" : "Menu Item")}</p>
            <div className="mt-2 pr-20">
              <h2 id="customization-title" className="text-2xl font-semibold leading-tight text-white sm:text-3xl">{item.name}</h2>
              <p className="mt-2 font-display text-2xl text-dune-amber">{formatPrice(item.price)}</p>
            </div>
            <p className="mt-2 text-sm leading-5 text-neutral-400">{item.description}</p>

            {isCombo && item.includedItems?.length > 0 && <div className="mt-4 rounded-xl border border-dune-border bg-black/25 p-3"><p className="eyebrow mb-2">Package Includes</p><div className="grid gap-1.5 sm:grid-cols-2">{item.includedItems.map((entry) => <div key={entry.menuItem?._id || entry.menuItem} className="flex justify-between gap-3 text-xs"><span className="truncate text-neutral-300">{entry.menuItem?.name || "Menu item"}</span><span className="text-dune-amber">×{entry.quantity}</span></div>)}</div></div>}

            <div className="mt-4"><p className="mb-2 text-xs font-semibold text-neutral-300">Quantity</p><div className="inline-flex items-center overflow-hidden rounded-lg border border-white/10 bg-black/30"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-9 w-10 place-items-center text-neutral-300 hover:text-dune-amber" aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></button><span className="w-10 text-center text-sm font-semibold text-white">{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} className="grid h-9 w-10 place-items-center text-neutral-300 hover:text-dune-amber" aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></button></div></div>

            {customizationEnabled && item.addOns?.length > 0 && <fieldset className="mt-4"><legend className="text-xs font-semibold text-white">Add-ons <span className="font-normal text-neutral-500">(Optional)</span></legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{item.addOns.map((addOn) => { const selected = selectedAddOnIds.includes(String(addOn._id)); return <button key={addOn._id} type="button" aria-pressed={selected} onClick={() => toggleAddOn(addOn._id)} className={`relative min-h-[112px] rounded-xl border p-2 text-left transition ${selected ? "border-dune-amber bg-dune-amber/10" : "border-white/10 bg-black/20 hover:border-dune-amber/45"}`}><span className={`absolute left-2 top-2 z-10 grid h-4 w-4 place-items-center rounded-sm border ${selected ? "border-dune-amber bg-dune-amber text-black" : "border-white/50 bg-black/40"}`}>{selected && <Check className="h-3 w-3" />}</span>{addOn.image ? <SmartImage src={addOn.image} alt="" width={120} height={80} sizes="140px" className="mx-auto h-14 w-full rounded-lg object-contain" /> : <span className="mx-auto grid h-14 w-full place-items-center rounded-lg bg-white/[0.035] text-dune-amber"><Plus className="h-5 w-5" /></span>}<span className="mt-1.5 block truncate text-xs font-medium text-white" title={addOn.name}>{addOn.name}</span><span className="mt-0.5 block text-[0.68rem] font-semibold text-dune-amber">+ {formatPrice(addOn.price)}</span></button>; })}</div></fieldset>}

            {customizationEnabled && spice.enabled && spice.options?.length > 0 && <fieldset className="mt-4"><legend className="text-xs font-semibold text-white">Spice Level</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{spice.options.map((option) => <button key={option} type="button" aria-pressed={spiceLevel === option} onClick={() => setSpiceLevel(option)} className={`min-h-10 rounded-lg border px-2 text-xs font-medium transition ${spiceLevel === option ? "border-dune-amber bg-dune-amber/10 text-white" : "border-white/10 bg-black/20 text-neutral-400 hover:border-dune-amber/45"}`}><span aria-hidden="true" className="mr-1.5 text-dune-amber">{option === "no-spice" ? "◇" : option === "mild" ? "🌶" : option === "medium" ? "🌶🌶" : "🌶🌶🌶"}</span>{SPICE_LABELS[option] || option}</button>)}</div></fieldset>}

            {customizationEnabled && <label className="mt-4 block text-xs font-semibold text-white">Add a Note <span className="font-normal text-neutral-500">(Optional)</span><span className="relative mt-2 block"><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 240))} rows={2} placeholder="E.g. no onions, extra sauce, well done…" className="min-h-[64px] w-full resize-none rounded-xl border border-white/10 bg-black/25 p-3 pb-5 text-xs font-normal text-white outline-none placeholder:text-neutral-700 focus:border-dune-amber/60" /><span className="absolute bottom-2 right-3 text-[10px] font-normal text-neutral-700">{note.length}/240</span></span></label>}
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-[#0c0f10]/95 p-4 backdrop-blur sm:px-7 lg:static lg:px-8"><button type="button" onClick={handleAdd} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-dune-amber px-5 text-sm font-semibold text-black transition hover:brightness-110"><ShoppingCart className="h-4 w-4" />Add to Cart · {formatPrice(total)}</button></div>
        </div>
      </section>
    </div>
  );
};

export default ItemModal;
