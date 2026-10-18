"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t } from "../i18n/core.js";



import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import MenuCard from "./MenuCard.jsx";
import ItemModal from "./ItemModal.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { fetchCategories, fetchCombos, fetchMenuItems } from "../api/api.js";
import { filterMenu } from "../utils/menuFilters.js";
import GuestOrderTracking from "./GuestOrderTracking.jsx";
import DarkSelect from "./ui/DarkSelect.jsx";
import { usePublicRestaurant } from "../context/PublicRestaurantContext.jsx";

const FullMenuPage = ({
  initialItems = [],
  initialCombos = [],
  initialCategories = []
}) => {
  const [items, setItems] = useState([...initialItems, ...initialCombos]);
  const [categories, setCategories] = useState(initialCategories);
  const [activeCategory, setActiveCategory] = useState("All");
  const [status, setStatus] = useState(
    initialItems.length + initialCombos.length > 0 ? "success" : "loading"
  );
  const [selectedItem, setSelectedItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("menu");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const visibleItems = filterMenu(items, { search, sort, maximumPrice });
  const { orderConfig, configError } = usePublicRestaurant();
  const clearFilters = () => {setSearch("");setSort("menu");setMaximumPrice("");setActiveCategory("All");};

  const firstLoad = useRef(true);

  useEffect(() => {
    if (initialCategories.length) return undefined;
    let cancelled = false;
    fetchCategories("menu").
    then((data) => {
      if (!cancelled) setCategories(data);
    }).
    catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialCategories.length]);

  useEffect(() => {
    if (
    firstLoad.current &&
    initialItems.length + initialCombos.length > 0 &&
    activeCategory === "All")
    {
      firstLoad.current = false;
      return;
    }
    firstLoad.current = false;

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      try {
        const data =
        activeCategory === "Combos" ?
        await fetchCombos() :
        activeCategory === "All" ?
        await Promise.all([fetchMenuItems(), fetchCombos()]).then(
          ([menu, combos]) => [...menu, ...combos]
        ) :
        await fetchMenuItems(activeCategory);
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
  }, [activeCategory, initialCombos.length, initialItems.length, retryVersion]);

  return (
    <div className="public-page bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm mb-8">

          <ArrowLeft className="w-4 h-4" />{t(" Back to home ")}
        </Link>

        <div className="max-w-2xl">
          <p className="eyebrow">{t("Full Menu")}</p>
          <h1 className="mt-3 text-4xl md:text-5xl text-white">{t(" EVERYTHING ON THE")}
            {" "}
            <span className="text-gradient-amber">{t("GRILL.")}</span>
          </h1>
        </div>
        {orderConfig?.websiteOrderingEnabled === false && <p role="status" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">{t("Online ordering is currently unavailable. Browse our menu or ")}<Link href="/#visit" className="underline">{t("contact the restaurant")}</Link>{t(".")}</p>}
        {configError && <p className="mt-4 text-sm text-amber-200">{t("Ordering availability could not be verified. You can browse the menu; checkout requires confirmed order options.")}</p>}

        <div role="group" aria-label={t("Menu categories")} className="mt-10 flex gap-3 overflow-x-auto pb-2 sm:flex-wrap">
          {[...new Set(["All", ...categories.map((entry) => entry.name), "Combos"])].map((cat) =>
          <button
            key={cat}
            type="button" aria-pressed={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
            className={`min-h-11 shrink-0 px-5 py-2 rounded-full text-sm font-medium border transition-colors duration-300 ${
            activeCategory === cat ?
            "bg-dune-amber text-black border-dune-amber" :
            "border-dune-border text-neutral-300 hover:border-dune-amber hover:text-dune-amber"}`
            }>

              {t(cat)}
            </button>
          )}
        </div>

        <GuestOrderTracking />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2 text-sm text-neutral-300">{t("Search menu")}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search dishes and combos…")} className="min-w-0 rounded-lg border border-dune-border bg-black px-4 py-3 text-white" /></label>
          <label className="grid gap-2 text-sm text-neutral-300">{t("Sort menu")}<DarkSelect aria-label={t("Sort menu")} value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-dune-border bg-black px-4 py-3 text-white"><option value="menu">{t("Menu order")}</option><option value="price-low">{t("Price: low to high")}</option><option value="price-high">{t("Price: high to low")}</option><option value="name">{t("Name")}</option></DarkSelect></label>
          <label className="grid gap-2 text-sm text-neutral-300">{t("Maximum price (SAR)")}<input type="number" min="0" inputMode="decimal" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder={t("Any price")} className="min-w-0 rounded-lg border border-dune-border bg-black px-4 py-3 text-white" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-neutral-300">{t(status === "success" ? `${visibleItems.length} matching ${visibleItems.length === 1 ? "item" : "items"}` : status === "loading" ? "Loading menu…" : "Results unavailable")}</p><button type="button" onClick={clearFilters} className="min-h-11 px-4 text-sm text-dune-amber underline">{t("Clear filters")}</button></div>
        <div className="mt-12">
          {status === "loading" &&
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <button type="button" onClick={() => setRetryVersion((value) => value + 1)} className="mt-3 text-dune-amber underline">{t("Retry")}</button>
            </div>
          }

          {status === "success" && visibleItems.length === 0 &&
          <div className="text-center py-16 border border-dune-border rounded-2xl">
              <p className="text-neutral-300">{t(items.length ? "No items match your search and price filters. Try a different search or clear the filters." : activeCategory === "All" ? "No menu items are available right now." : "No available items in this category. Try All categories.")}</p>
              <button type="button" onClick={clearFilters} className="mt-3 min-h-11 px-4 text-dune-amber underline">{t("Reset menu filters")}</button>
            </div>
          }

          {status === "success" && visibleItems.length > 0 &&
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleItems.map((item) =>
            <MenuCard
              key={`${item.productType || "menuItem"}-${item._id}`}
              item={item}
              onSelect={setSelectedItem} />

            )}
            </div>
          }
        </div>
      </div>

      <Footer />
      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>);

};

export default withLocale(FullMenuPage);
