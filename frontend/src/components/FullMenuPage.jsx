import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import MenuCard from "./MenuCard.jsx";
import ItemModal from "./ItemModal.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { fetchMenuItems } from "../api/api.js";

const CATEGORIES = ["All", "Food", "Appetizers", "Drinks"];

const FullMenuPage = () => {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [status, setStatus] = useState("loading");
  const [selectedItem, setSelectedItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

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
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  return (
    <div className="bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="max-w-2xl">
          <p className="eyebrow">Full Menu</p>
          <h1 className="mt-3 text-4xl md:text-5xl text-white">
            EVERYTHING ON THE{" "}
            <span className="text-gradient-amber">GRILL.</span>
          </h1>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
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
                We couldn&apos;t load the menu right now.
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

      <Footer />
      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default FullMenuPage;
