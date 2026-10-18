"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t } from "../i18n/core.js";



import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MenuCard from "./MenuCard.jsx";
import ItemModal from "./ItemModal.jsx";
import { fetchCombos, fetchMenuItems } from "../api/api.js";

const PREVIEW_LIMIT = 6;

const sortPreviewItems = (items) => {
  const featured = items.
  filter((item) => item.isFeatured).
  sort(
    (a, b) =>
    (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (
    b.featuredOrder ?? Number.MAX_SAFE_INTEGER)
  );
  const rest = items.filter((item) => !item.isFeatured);
  return [...featured, ...rest].slice(0, PREVIEW_LIMIT);
};

const MenuSection = ({ initialItems = [], initialCombos = [] }) => {
  const initialProducts = [...initialItems, ...initialCombos];
  const [items, setItems] = useState(sortPreviewItems(initialProducts));
  const [status, setStatus] = useState(
    initialProducts.length > 0 ? "success" : "loading"
  );
  const [selectedItem, setSelectedItem] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      try {
        const [menu, combos] = await Promise.all([
        fetchMenuItems(),
        fetchCombos()]
        );
        if (!cancelled) {
          setItems(sortPreviewItems([...menu, ...combos]));
          setStatus("success");
        }
      } catch (err) {
        if (!cancelled) setStatus("error");
      }
    };

    if (initialProducts.length === 0 || retryVersion > 0) load();
    return () => {
      cancelled = true;
    };
  }, [initialProducts.length, retryVersion]);

  return (
    <section id="menu" className="relative bg-black py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow">{t("The Menu")}</p>
          <h2 className="mt-3 text-4xl md:text-5xl text-white">{t(" GRILLED TO ")}
            <span className="text-gradient-amber">{t("ORDER")}</span>
          </h2>
          <p className="mt-4 text-neutral-400">{t(" A taste of what's on our live menu today. ")}

          </p>
        </div>

        <div className="mt-12">
          {status === "loading" &&
          <div role="status" aria-label={t("Loading menu preview")} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) =>
            <div
              key={i}
              className="h-96 rounded-2xl border border-dune-border bg-dune-surface animate-pulse" />

            )}
            </div>
          }

          {status === "error" &&
          <div className="text-center py-16 border border-dune-border rounded-2xl">
              <p className="text-neutral-400">{t(" We couldn't load the menu right now. ")}

            </p>
              <button type="button" onClick={() => setRetryVersion((value) => value + 1)} className="mt-3 min-h-11 px-4 text-dune-amber underline">{t("Retry menu")}</button>
            </div>
          }

          {status === "success" && !items.length && <p className="rounded-xl border border-dune-border p-8 text-center text-neutral-300">{t("Our menu has no available items right now. Please check again later.")}</p>}
          {status === "success" && items.length > 0 &&
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) =>
            <MenuCard
              key={`${item.productType || "menuItem"}-${item._id}`}
              item={item}
              onSelect={setSelectedItem} />

            )}
            </div>
          }
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 border border-dune-amber/60 hover:bg-dune-amber hover:text-black text-dune-amber font-medium px-7 py-3 rounded-full transition-colors duration-300">{t(" View Full Menu ")}


            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>);

};

export default withLocale(MenuSection);
