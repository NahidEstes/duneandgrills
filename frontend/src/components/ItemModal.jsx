import React, { useEffect } from "react";
import { X, Flame, Plus } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { formatPrice } from "../utils/currency.js";

const ItemModal = ({ item, onClose }) => {
  const { addToCart } = useCart();

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
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black"
          >
            <X className="w-4 h-4" />
          </button>
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
              addToCart(item);
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
