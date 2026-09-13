"use client";

import { Heart, History, NotebookPen, ShoppingBag, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminCustomer } from "../../../api/api.js";
import SmartImage from "../../SmartImage.jsx";
import CustomerFavourites from "./CustomerFavourites.jsx";
import CustomerNotes from "./CustomerNotes.jsx";
import CustomerOrders from "./CustomerOrders.jsx";
import CustomerOverview from "./CustomerOverview.jsx";
import CustomerRewards from "./CustomerRewards.jsx";
import { SectionLoading } from "./customerUi.jsx";

const TABS = [
  ["overview", "Overview", UserRound],
  ["orders", "Orders", ShoppingBag],
  ["favourites", "Favourite Items", Heart],
  ["rewards", "Rewards", History],
  ["notes", "Internal Notes", NotebookPen],
];

export default function CustomerDetailsDrawer({ customer, onClose, onCustomerChanged }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await fetchAdminCustomer(customer._id));
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load customer details.");
    } finally {
      setLoading(false);
    }
  }, [customer._id]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const currentCustomer = overview?.customer || customer;
  const handleOrderChanged = async () => {
    await loadOverview();
    onCustomerChanged?.();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-labelledby="customer-drawer-title" className="ml-auto flex h-full w-full max-w-6xl flex-col border-l border-white/10 bg-[#080b0d] shadow-2xl">
        <header className="border-b border-white/[0.08] px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            {currentCustomer.avatar ? <SmartImage src={currentCustomer.avatar} alt="" width={96} height={96} sizes="48px" className="h-12 w-12 rounded-full object-cover ring-1 ring-white/15" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-dune-amber/10 text-lg font-semibold text-dune-amber">{currentCustomer.name?.charAt(0)?.toUpperCase()}</span>}
            <div className="min-w-0 flex-1"><h2 id="customer-drawer-title" className="truncate text-xl font-semibold text-white">{currentCustomer.name}</h2><p className="mt-1 truncate text-xs text-neutral-500">{currentCustomer.email}{currentCustomer.phone ? ` · ${currentCustomer.phone}` : ""}</p></div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-neutral-500 hover:text-white" aria-label="Close customer details"><X className="h-5 w-5" /></button>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Customer detail sections">{TABS.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold ${tab === id ? "bg-dune-amber text-black" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === "overview" && (loading ? <SectionLoading label="Loading customer overview…" /> : overview ? <CustomerOverview overview={overview} /> : null)}
          {tab === "orders" && <CustomerOrders customerId={customer._id} onChanged={handleOrderChanged} />}
          {tab === "favourites" && <CustomerFavourites customerId={customer._id} />}
          {tab === "rewards" && <CustomerRewards customerId={customer._id} />}
          {tab === "notes" && <CustomerNotes customerId={customer._id} />}
        </div>
      </aside>
    </div>
  );
}
