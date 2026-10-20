"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCartSuggestions, fetchMenuItemById } from "@/src/api/api.js";
import { useCart } from "@/src/context/CartContext.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import SmartImage from "./SmartImage.jsx";
import ItemModal from "./ItemModal.jsx";
import { formatPrice } from "@/src/utils/currency.js";

export default function CartSuggestions() {
  const { cart, addToCart, cartReady, syncing } = useCart();
  const { user } = useAuth();
  const actor = user?._id || "guest", actorRef = useRef(actor);
  const [items, setItems] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState(null), [adding, setAdding] = useState(""), [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => { actorRef.current = actor; setSelected(null); }, [actor]);
  const key = JSON.stringify(cart.map(item => ({ productId: item._id, productType: item.productType || "menuItem" })));
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setError("");
    if (!cartReady || key === "[]") return () => controller.abort();
    setLoading(true);
    fetchCartSuggestions(JSON.parse(key), { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setItems(value); }).catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || "Suggestions are unavailable."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, cartReady, retry]);
  const add = async item => {
    if (lock.current) return;
    lock.current = true; setAdding(item._id); setError("");
    try {
      // Refresh the product before adding; checkout remains authoritative.
      const product = await fetchMenuItemById(item._id);
      if (actorRef.current !== actor) return;
      if (product.customization?.enabled) setSelected(product);
      else if (!await addToCart({ ...product, quantity: 1 })) throw new Error("Unable to add this item. Please retry.");
    } catch (error) { setError(error.response?.data?.message || error.message || "Unable to add this item."); }
    finally { lock.current = false; setAdding(""); }
  };
  if (!cartReady || !cart.length || (!loading && !error && !items.length)) return null;
  return <section lang="en" dir="ltr" className="space-y-3 rounded-xl border border-dune-border bg-white/[0.02] p-3" aria-label="Complete your meal"><h3 className="text-sm font-semibold text-white">Complete your meal</h3>
    {loading && <p role="status" className="text-xs text-neutral-400">Finding suggestions…</p>}
    {error && <p role="alert" className="text-xs text-amber-300">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry suggestions</button></p>}
    {items.filter(item => !cart.some(line => line.productType !== "combo" && line._id === item._id)).map(item => <article key={item._id} className="flex items-center gap-3"><SmartImage src={item.image} alt="" width={80} height={80} className="h-12 w-12 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="text-sm text-white">{item.name}</p><p className="text-xs text-dune-amber">{formatPrice(item.price)}</p></div><button type="button" disabled={!!adding || syncing} aria-label={`Add suggested ${item.name}`} onClick={() => add(item)} className="min-h-11 rounded-full border border-dune-amber/40 px-4 text-xs font-semibold text-dune-amber disabled:opacity-50">{adding === item._id ? "Adding…" : "Add"}</button></article>)}
    {selected && <ItemModal item={selected} onClose={() => setSelected(null)} />}
  </section>;
}
