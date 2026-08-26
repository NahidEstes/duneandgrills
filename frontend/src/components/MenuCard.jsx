"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Plus, Flame, Heart } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useFavorites } from "../context/FavoritesContext.jsx";
import { formatPrice } from "../utils/currency.js";
import SmartImage from "./SmartImage.jsx";

const MenuCard = ({ item, onSelect }) => {
  const { addToCart } = useCart();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const router = useRouter();
  const isBestseller = item.tags?.includes("bestseller");
  const isFavorite = favoriteIds.has(item._id);

  const handleFavorite = async (event) => {
    event.stopPropagation();
    const result = await toggleFavorite(item);
    if (result?.requiresLogin) router.push("/login");
  };

  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative flex flex-col rounded-2xl border border-dune-border bg-dune-surface overflow-hidden hover:border-dune-amber/60 hover:-translate-y-1 hover:shadow-amberGlow transition-all duration-300 cursor-pointer"
    >
      <div className="relative h-52 overflow-hidden">
        <SmartImage
          src={item.image}
          alt={item.name}
          width={800}
          height={416}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dune-surface via-transparent to-transparent" />
        {isBestseller && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide text-dune-amber border border-dune-amber/40">
            <Flame className="w-3 h-3" /> Bestseller
          </span>
        )}
        <button
          type="button"
          onClick={handleFavorite}
          aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
          aria-pressed={isFavorite}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full border border-white/20 bg-black/70 backdrop-blur flex items-center justify-center text-white hover:border-dune-amber hover:text-dune-amber transition-colors"
        >
          <Heart className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-white leading-snug">
            {item.name}
          </h3>
          {/* <span className="shrink-0 font-display text-xl text-dune-amber">
            ${item.price.toFixed(2)}
          </span> */}
          <span className="shrink-0 font-display text-xl text-dune-amber">
            {formatPrice(item.price)}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-400 leading-relaxed flex-1">
          {item.description}
        </p>

        <button
          onClick={(e) => {
            e.stopPropagation();
            addToCart(item);
          }}
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
