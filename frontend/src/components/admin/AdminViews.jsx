"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteAdminReview,
  fetchAdminReviews,
  fetchAdminUsers,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import {
  formatAdminCurrency,
  formatAdminDate,
  labelStatus,
} from "./adminUi.js";
import { confirmDelete } from "./deleteToast.js";

const CARD =
  "rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";

const LoadingState = ({ label }) => (
  <div className={`${CARD} grid min-h-64 place-items-center text-sm text-neutral-500`}>
    <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin text-dune-amber" /> {label}</span>
  </div>
);

const UserDirectory = ({ scope }) => {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetchAdminUsers(scope, query);
        if (active) setUsers(result);
      } catch (error) {
        toast.error(error.response?.data?.message || "Unable to load users.");
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, scope]);

  const isStaff = scope === "staff";

  return (
    <div className="space-y-4">
      <div className={`${CARD} flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${isStaff ? "staff" : "customers"}…`} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60" />
        </div>
        <p className="text-xs text-neutral-500">Only non-sensitive account fields are displayed.</p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3 font-medium">Account</th><th className="px-3 py-3 font-medium">Contact</th>{!isStaff && <><th className="px-3 py-3 font-medium">Orders</th><th className="px-3 py-3 font-medium">Total Spent</th><th className="px-3 py-3 font-medium">Rewards</th></>}<th className="px-4 py-3 font-medium">Joined</th></tr></thead>
            <tbody className="divide-y divide-white/[0.055]">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3"><div className="flex items-center gap-3">{user.avatar ? <SmartImage src={user.avatar} alt="" width={72} height={72} sizes="38px" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{user.name?.charAt(0)?.toUpperCase()}</span>}<span><span className="block font-medium text-white">{user.name}</span><span className="block text-xs capitalize text-neutral-500">{user.role}</span></span></div></td>
                  <td className="px-3 py-3"><span className="block text-neutral-300">{user.email}</span><span className="block text-xs text-neutral-500">{user.phone || "No phone saved"}</span></td>
                  {!isStaff && <><td className="px-3 py-3 text-white">{user.ordersCount}</td><td className="px-3 py-3 font-medium text-white">{formatAdminCurrency(user.totalSpent)}</td><td className="px-3 py-3 text-dune-amber">{user.rewardPoints || 0} pts</td></>}
                  <td className="px-4 py-3 text-xs text-neutral-500">{formatAdminDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="px-4 py-10 text-center text-sm text-neutral-500">Loading…</p>}
        {!loading && !users.length && <p className="px-4 py-10 text-center text-sm text-neutral-500">No matching {isStaff ? "staff accounts" : "customers"}.</p>}
        <div className="border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-600">{users.length} {isStaff ? "team accounts" : "customer accounts"}</div>
      </div>
    </div>
  );
};

export const CustomersView = () => <UserDirectory scope="customers" />;
export const StaffView = () => <UserDirectory scope="staff" />;

export const CategoriesView = ({ dashboard, onNavigate }) => {
  const categories = dashboard?.analytics?.categories || [];
  const total = categories.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((entry) => {
          const availability = entry.count ? Math.round((entry.available / entry.count) * 100) : 0;
          return (
            <article key={entry.category} className={`${CARD} p-5`}>
              <div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-dune-amber/10 text-dune-amber"><UtensilsCrossed className="h-5 w-5" /></span><span className="text-xs text-neutral-500">{Math.round((entry.count / Math.max(total, 1)) * 100)}% of menu</span></div>
              <h2 className="mt-4 font-body text-lg font-semibold text-white">{entry.category}</h2>
              <p className="mt-1 text-sm text-neutral-400">{entry.count} items · {entry.available} available</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-dune-amber" style={{ width: `${availability}%` }} /></div>
              <p className="mt-2 text-xs text-neutral-600">{availability}% currently visible</p>
            </article>
          );
        })}
      </div>
      <div className={`${CARD} flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center`}><div><h2 className="font-body text-base font-semibold text-white">Category structure follows the Menu Item schema</h2><p className="mt-1 text-sm text-neutral-500">Manage item category and availability from Menu Items. No duplicate category database is used.</p></div><button type="button" onClick={() => onNavigate("menu")} className="inline-flex items-center gap-2 rounded-lg bg-dune-amber px-4 py-2 text-sm font-semibold text-black">Manage Menu <ArrowRight className="h-4 w-4" /></button></div>
    </div>
  );
};

export const ReviewsView = ({ onDataChanged }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setReviews(await fetchAdminReviews());
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const removeReview = (review) => confirmDelete({
    title: "Delete this customer review?",
    description: `The ${review.rating}-star review for ${review.menuItem?.name || "this item"} will be permanently removed.`,
    onConfirm: async () => {
      await deleteAdminReview(review._id);
      setReviews((current) => current.filter((entry) => entry._id !== review._id));
      onDataChanged?.();
    },
    successMessage: "Review deleted.",
    errorMessage: "Unable to delete review.",
  });

  if (loading) return <LoadingState label="Loading customer reviews…" />;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {reviews.map((review) => (
        <article key={review._id} className={`${CARD} p-5`}>
          <div className="flex items-start gap-3">
            {review.user?.avatar ? <SmartImage src={review.user.avatar} alt="" width={72} height={72} sizes="40px" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{review.user?.name?.charAt(0) || "C"}</span>}
            <div className="min-w-0 flex-1"><p className="font-medium text-white">{review.user?.name || "Customer"}</p><p className="truncate text-xs text-neutral-500">{review.user?.email} · Order #{review.order?.orderNumber}</p></div>
            <button type="button" onClick={() => removeReview(review)} aria-label="Delete review" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-400 hover:border-red-500/50 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-4 flex items-center gap-1">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-dune-amber text-dune-amber" : "text-neutral-700"}`} />)}<span className="ml-2 text-xs text-neutral-500">{formatAdminDate(review.createdAt)}</span></div>
          <p className="mt-3 text-sm leading-6 text-neutral-300">“{review.comment}”</p>
          <div className="mt-4 flex items-center gap-3 border-t border-white/[0.07] pt-3">{review.menuItem?.image && <SmartImage src={review.menuItem.image} alt="" width={72} height={72} sizes="32px" className="h-8 w-8 rounded-md object-cover" />}<span className="text-xs text-neutral-500">Reviewed item: <span className="text-neutral-300">{review.menuItem?.name || "Deleted menu item"}</span></span></div>
        </article>
      ))}
      {!reviews.length && <div className={`${CARD} col-span-full py-16 text-center text-sm text-neutral-500`}>No customer reviews yet.</div>}
    </div>
  );
};

export const AnalyticsView = ({ dashboard }) => {
  const analytics = dashboard?.analytics || {};
  const maxRevenue = Math.max(...(analytics.dailyRevenue || []).map((entry) => entry.revenue), 1);
  const totalStatuses = (analytics.statusBreakdown || []).reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={`${CARD} p-5 sm:p-6`}><div className="flex items-center justify-between"><div><h2 className="font-body text-base font-semibold text-white">Revenue · Last 7 Days</h2><p className="mt-1 text-xs text-neutral-500">Cancelled orders are excluded.</p></div><Database className="h-5 w-5 text-dune-amber" /></div><div className="mt-8 flex h-56 items-end gap-2 sm:gap-4">{(analytics.dailyRevenue || []).map((entry) => <div key={entry.date} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-[0.58rem] text-neutral-500 sm:text-[0.65rem]">{entry.revenue ? formatAdminCurrency(entry.revenue).replace("SAR ", "") : "0"}</span><div className="flex h-40 w-full items-end rounded-t-md bg-white/[0.03]"><div className="w-full rounded-t-md bg-gradient-to-t from-dune-amberDeep to-dune-amber transition-all" style={{ height: `${Math.max((entry.revenue / maxRevenue) * 100, entry.revenue ? 6 : 1)}%` }} /></div><span className="text-[0.58rem] text-neutral-600 sm:text-[0.65rem]">{new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-SA", { weekday: "short" })}</span></div>)}</div></section>
      <section className={`${CARD} p-5 sm:p-6`}><h2 className="font-body text-base font-semibold text-white">Order Status Distribution</h2><div className="mt-6 space-y-4">{(analytics.statusBreakdown || []).map((entry) => { const percent = Math.round((entry.count / Math.max(totalStatuses, 1)) * 100); return <div key={entry.status}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-neutral-300">{labelStatus(entry.status)}</span><span className="text-neutral-500">{entry.count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${entry.status === "delivered" ? "bg-emerald-500" : entry.status === "cancelled" ? "bg-red-500" : "bg-dune-amber"}`} style={{ width: `${percent}%` }} /></div></div>; })}</div></section>
      <section className={`${CARD} p-5 sm:p-6`}><h2 className="font-body text-base font-semibold text-white">Popular Menu Items</h2><div className="mt-4 divide-y divide-white/[0.06]">{(analytics.popularItems || []).map((item, index) => <div key={`${item.menuItem || item.name}-${index}`} className="flex items-center gap-3 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dune-amber/10 text-sm font-semibold text-dune-amber">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{item.name}</span><span className="text-xs text-neutral-500">{item.quantity} items sold</span></span><span className="text-sm font-medium text-white">{formatAdminCurrency(item.revenue)}</span></div>)}</div></section>
      <section className={`${CARD} p-5 sm:p-6`}><h2 className="font-body text-base font-semibold text-white">Menu Availability</h2><div className="mt-4 divide-y divide-white/[0.06]">{(analytics.categories || []).map((entry) => <div key={entry.category} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-dune-amber"><Boxes className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm text-white">{entry.category}</span><span className="text-xs text-neutral-500">{entry.available} of {entry.count} visible</span></span><span className="text-xs text-neutral-400">{Math.round((entry.available / Math.max(entry.count, 1)) * 100)}%</span></div>)}</div></section>
    </div>
  );
};

export const SettingsView = ({ dashboard }) => (
  <div className="grid gap-4 lg:grid-cols-3">
    <article className={`${CARD} p-5`}><ShieldCheck className="h-6 w-6 text-emerald-400" /><h2 className="mt-4 font-body text-base font-semibold text-white">Access Protection</h2><p className="mt-2 text-sm leading-6 text-neutral-500">The dashboard and admin APIs use the existing JWT middleware and allow only admin or manager roles.</p><span className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span></article>
    <article className={`${CARD} p-5`}><Database className="h-6 w-6 text-dune-amber" /><h2 className="mt-4 font-body text-base font-semibold text-white">Live Data Source</h2><p className="mt-2 text-sm leading-6 text-neutral-500">All dashboard values come from Express and MongoDB. Public content invalidation runs after menu, blog, offer and order mutations.</p><p className="mt-4 text-xs text-neutral-600">{dashboard?.stats?.menuItemCount || 0} menu items · {dashboard?.stats?.totalOrders || 0} orders</p></article>
    <article className={`${CARD} p-5`}><Clock3 className="h-6 w-6 text-sky-400" /><h2 className="mt-4 font-body text-base font-semibold text-white">Environment Settings</h2><p className="mt-2 text-sm leading-6 text-neutral-500">API origin, database connection and JWT secret remain managed through the existing environment files.</p><Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-xs text-dune-amber hover:text-dune-amberLight">Open public website <ExternalLink className="h-3.5 w-3.5" /></Link></article>
  </div>
);
