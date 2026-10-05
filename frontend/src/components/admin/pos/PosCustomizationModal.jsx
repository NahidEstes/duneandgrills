"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SmartImage from "../../SmartImage.jsx";
import { formatAdminCurrency } from "../adminUi.js";

const keyFor = ({ selectedAddOns, spiceLevel, note }) =>
  JSON.stringify({
    addOns: selectedAddOns
      .map((entry) => ({ id: String(entry.addOn), quantity: entry.quantity }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    spiceLevel: spiceLevel || "",
    note: note.trim(),
  });

export default function PosCustomizationModal({ product, onClose, onAdd }) {
  const groups = useMemo(() => {
    if (!product) return [];
    if (product.customization?.groups?.length)
      return product.customization.groups;
    return product.addOns?.length
      ? [
          {
            _id: "optional",
            name: "Add-ons",
            selectionType: "multiple",
            minSelections: 0,
            maxSelections: product.addOns.length,
            addOns: product.addOns,
          },
        ]
      : [];
  }, [product]);
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState({});
  const [spiceLevel, setSpiceLevel] = useState(
    product?.customization?.spice?.default ||
      product?.customization?.spice?.options?.[0] ||
      "",
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  if (!product) return null;

  const toggle = (group, addOn) => {
    setError("");
    setSelected((current) => {
      const id = String(addOn._id);
      if (current[id]) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      const groupIds = (group.addOns || []).map((row) => String(row._id));
      const chosen = groupIds.filter((entry) => current[entry]);
      let next = { ...current };
      if (group.selectionType === "single")
        for (const entry of groupIds) delete next[entry];
      else if (chosen.length >= Number(group.maxSelections || groupIds.length))
        return current;
      next[id] = { ...addOn, quantity: 1 };
      return next;
    });
  };
  const changeAddOnQuantity = (addOn, amount) =>
    setSelected((current) => ({
      ...current,
      [String(addOn._id)]: {
        ...current[String(addOn._id)],
        quantity: Math.max(
          1,
          Math.min(
            99,
            Number(current[String(addOn._id)]?.quantity || 1) + amount,
          ),
        ),
      },
    }));
  const selectedAddOns = Object.values(selected).map((entry) => ({
    addOn: entry._id,
    name: entry.name,
    image: entry.image || "",
    price: Number(entry.price),
    quantity: Number(entry.quantity || 1),
  }));
  const addOnTotal = selectedAddOns.reduce(
    (sum, entry) => sum + entry.price * entry.quantity,
    0,
  );
  const unitPrice = Number(product.price) + addOnTotal;
  const submit = () => {
    for (const group of groups) {
      const ids = new Set(
        (group.addOns || []).map((entry) => String(entry._id)),
      );
      const count = selectedAddOns.filter((entry) =>
        ids.has(String(entry.addOn)),
      ).length;
      if (count < Number(group.minSelections || 0)) {
        setError(
          `Choose at least ${group.minSelections} option for ${group.name}.`,
        );
        return;
      }
      if (count > Number(group.maxSelections || ids.size)) {
        setError(
          `Choose no more than ${group.maxSelections} options for ${group.name}.`,
        );
        return;
      }
    }
    const customization = { selectedAddOns, spiceLevel, note: note.trim() };
    const customizationKey = keyFor(customization);
    onAdd({
      ...product,
      quantity,
      price: unitPrice,
      customization,
      customizationKey,
      cartLineId: `${product.productType}:${product._id}:${customizationKey}`,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-customize-title"
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#101416] shadow-2xl sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#101416]/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-dune-amber">
              Customize item
            </p>
            <h2
              id="pos-customize-title"
              className="mt-1 text-xl font-semibold text-white"
            >
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customization"
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/30">
              <SmartImage
                src={product.image}
                alt={product.name}
                fill
                sizes="220px"
                className="object-cover"
              />
            </div>
            <p className="mt-3 text-sm text-neutral-400">
              {product.description}
            </p>
            <p className="mt-3 text-lg font-semibold text-dune-amber">
              {formatAdminCurrency(product.price)}
            </p>
          </div>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Quantity
              </p>
              <div className="inline-flex items-center rounded-xl border border-white/10">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="grid h-11 w-11 place-items-center"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() =>
                    setQuantity((value) => Math.min(99, value + 1))
                  }
                  className="grid h-11 w-11 place-items-center"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            {groups.map((group) => (
              <fieldset key={String(group._id || group.name)}>
                <legend className="text-sm font-semibold text-white">
                  {group.name}{" "}
                  <span className="font-normal text-neutral-500">
                    {Number(group.minSelections || 0) > 0
                      ? `(choose ${group.minSelections}${group.maxSelections !== group.minSelections ? `–${group.maxSelections}` : ""})`
                      : "(optional)"}
                  </span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(group.addOns || []).map((addOn) => {
                    const active = Boolean(selected[String(addOn._id)]);
                    return (
                      <div
                        key={addOn._id}
                        className={`rounded-xl border p-3 ${active ? "border-dune-amber bg-dune-amber/[0.08]" : "border-white/10 bg-black/20"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(group, addOn)}
                          aria-pressed={active}
                          className="flex min-h-11 w-full items-center gap-3 text-left"
                        >
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${active ? "border-dune-amber bg-dune-amber text-black" : "border-white/20"}`}
                          >
                            {active && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-white">
                              {addOn.name}
                            </span>
                            <span className="text-xs text-dune-amber">
                              + {formatAdminCurrency(addOn.price)}
                            </span>
                          </span>
                        </button>
                        {active && group.selectionType !== "single" && (
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => changeAddOnQuantity(addOn, -1)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-6 text-center text-sm">
                              {selected[String(addOn._id)].quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeAddOnQuantity(addOn, 1)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {product.customization?.spice?.enabled && (
              <fieldset>
                <legend className="text-sm font-semibold text-white">
                  Spice level
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {product.customization.spice.options.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSpiceLevel(value)}
                      className={`min-h-11 rounded-xl border px-3 text-sm capitalize ${spiceLevel === value ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-400"}`}
                    >
                      {value.replaceAll("-", " ")}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block text-sm font-semibold text-white">
              Preparation note{" "}
              <span className="font-normal text-neutral-500">(optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={240}
                placeholder="No onion, sauce on the side…"
                className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="sticky bottom-0 border-t border-white/10 bg-[#101416]/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={submit}
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-dune-amber px-5 text-base font-bold text-black"
          >
            Add {quantity} · {formatAdminCurrency(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
