"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Flame, Plus, Heart } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../context/CartContext.jsx";
import { useFavorites } from "../context/FavoritesContext.jsx";
import { formatPrice } from "../utils/currency.js";
import SmartImage from "./SmartImage.jsx";

const ItemModal = ({ item, onClose }) => {
  const { addToCart } = useCart();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const router = useRouter();

  //   useEffect(() => {
  //     const onEsc = (e) => e.key === "Escape" && onClose();
  //     document.addEventListener("keydown", onEsc);
  //     document.body.style.overflow = "hidden";
  //     return () => {
  //       document.removeEventListener("keydown", onEsc);
  //       document.body.style.overflow = "";
  //     };
  //   }, [onClose]);

  useEffect(() => {
    if (!item) return;

    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [item, onClose]);
  if (!item) return null;
  const isFavorite = favoriteIds.has(item._id);

  const handleFavorite = async () => {
    const result = await toggleFavorite(item);
    if (result?.requiresLogin) {
      onClose();
      router.push("/login");
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-dune-border bg-dune-surface overflow-hidden animate-fadeUp"
      >
        <div className="relative h-56">
          <SmartImage
            src={item.image}
            alt={item.name}
            width={900}
            height={448}
            sizes="(min-width: 640px) 512px, 100vw"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={handleFavorite}
              aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
              aria-pressed={isFavorite}
              className="w-9 h-9 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:text-dune-amber hover:border-dune-amber"
            >
              <Heart className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close item details"
              className="w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-2xl font-semibold text-white">{item.name}</h3>
            {/* <span className="font-display text-2xl text-dune-amber shrink-0">
              ${item.price.toFixed(2)}
            </span> */}
            <span className="font-display text-2xl text-dune-amber shrink-0">
              {formatPrice(item.price)}
            </span>
          </div>

          <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
            {item.description}
          </p>

          {item.calories > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-dune-amber border border-dune-amber/40 rounded-full px-3 py-1.5">
              <Flame className="w-3.5 h-3.5" />
              {item.calories} kcal
            </div>
          )}

          {item.ingredients?.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow mb-2">Ingredients</p>
              <div className="flex flex-wrap gap-2">
                {item.ingredients.map((ing) => (
                  <span
                    key={ing}
                    className="text-xs text-neutral-300 border border-dune-border rounded-full px-3 py-1"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (addToCart(item)) toast.success("Added to cart");
              onClose();
            }}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold py-3 rounded-full transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemModal;
