import React from "react";
import { Plus, Flame } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";

const MenuCard = ({ item }) => {
  const { addToCart } = useCart();
  const isBestseller = item.tags?.includes("bestseller");

  return (
    <div className="group relative flex flex-col rounded-2xl border border-dune-border bg-dune-surface overflow-hidden hover:border-dune-amber/60 hover:-translate-y-1 transition-all duration-300">
      <div className="relative h-52 overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dune-surface via-transparent to-transparent" />
        {isBestseller && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide text-dune-amber border border-dune-amber/40">
            <Flame className="w-3 h-3" /> Bestseller
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-white leading-snug">{item.name}</h3>
          <span className="shrink-0 font-display text-xl text-dune-amber">
            ${item.price.toFixed(2)}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-400 leading-relaxed flex-1">{item.description}</p>

        <button
          onClick={() => addToCart(item)}
          className="mt-5 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-full border border-dune-amber/60 text-dune-amber font-medium hover:bg-dune-amber hover:text-black transition-colors duration-300"
        >
          <Plus className="w-4 h-4" />
          Add to Cart
        </button>
      </div>
    </div>
  );
};

export default MenuCard;
