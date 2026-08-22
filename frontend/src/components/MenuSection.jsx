import React, { useEffect, useState } from "react";
import MenuCard from "./MenuCard.jsx";
import { fetchMenuItems } from "../api/api.js";
import ItemModal from "./ItemModal.jsx";

const CATEGORIES = ["All", "Food", "Appetizers", "Drinks"];

const MenuSection = () => {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | success | error

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      try {
        const data = await fetchMenuItems(activeCategory);
        if (!cancelled) {
          setItems(data);
          setStatus("success");
        }
      } catch (err) {
        if (!cancelled) setStatus("error");
        console.error("Failed to load menu items:", err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  return (
    <section id="menu" className="relative bg-black py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow">The Menu</p>
          <h2 className="mt-3 text-4xl md:text-5xl text-white">
            GRILLED TO <span className="text-gradient-amber">ORDER</span>
          </h2>
          <p className="mt-4 text-neutral-400">
            Every dish updated straight from our kitchen&apos;s live menu — no
            surprises, just what&apos;s fresh today.
          </p>
        </div>

        {/* Category filters */}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors duration-300 ${
                activeCategory === cat
                  ? "bg-dune-amber text-black border-dune-amber"
                  : "border-dune-border text-neutral-300 hover:border-dune-amber hover:text-dune-amber"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid states */}
        <div className="mt-12">
          {status === "loading" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-96 rounded-2xl border border-dune-border bg-dune-surface animate-pulse"
                />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-16 border border-dune-border rounded-2xl">
              <p className="text-neutral-400">
                We couldn&apos;t load the menu right now. Please make sure the
                API server is running, then refresh.
              </p>
            </div>
          )}

          {status === "success" && items.length === 0 && (
            <div className="text-center py-16 border border-dune-border rounded-2xl">
              <p className="text-neutral-400">No items in this category yet.</p>
            </div>
          )}

          {status === "success" && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) => (
                <MenuCard
                  key={item._id}
                  item={item}
                  onSelect={setSelectedItem}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  );
};

export default MenuSection;
