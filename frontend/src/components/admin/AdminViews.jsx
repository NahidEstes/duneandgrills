"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
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
            <thead className="border-b border-white/[0.07] text-xs text-neutral-500"><tr><th className="px-4 py-3 font-medium">Account</th><th className="px-3 py-3 font-medium">Contact</th>{!isStaff && <><th className="px-3 py-3 font-medium">Orders</th><th className="px-3 py-3 font-medium">Total Spent</th><th className="px-3 py-3 font-medium">Points</th></>}<th className="px-4 py-3 font-medium">Joined</th></tr></thead>
            <tbody className="divide-y divide-white/[0.055]">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3"><div className="flex items-center gap-3">{user.avatar ? <SmartImage src={user.avatar} alt="" width={72} height={72} sizes="38px" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{user.name?.charAt(0)?.toUpperCase()}</span>}<span><span className="block font-medium text-white">{user.name}</span><span className="block text-xs capitalize text-neutral-500">{user.role}</span></span></div></td>
                  <td className="px-3 py-3"><span className="block text-neutral-300">{user.email}</span><span className="block text-xs text-neutral-500">{user.phone || "No phone saved"}</span></td>
                  {!isStaff && <><td className="px-3 py-3 text-white">{user.ordersCount}</td><td className="px-3 py-3 font-medium text-white">{formatAdminCurrency(user.totalSpent)}</td><td className="px-3 py-3 text-dune-amber">{user.pointsBalance || 0} pts</td></>}
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

export const SettingsView = ({ dashboard }) => (
  <div className="grid gap-4 lg:grid-cols-3">
    <article className={`${CARD} p-5`}><ShieldCheck className="h-6 w-6 text-emerald-400" /><h2 className="mt-4 font-body text-base font-semibold text-white">Access Protection</h2><p className="mt-2 text-sm leading-6 text-neutral-500">The dashboard and admin APIs use the existing JWT middleware and allow only admin or manager roles.</p><span className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span></article>
    <article className={`${CARD} p-5`}><Database className="h-6 w-6 text-dune-amber" /><h2 className="mt-4 font-body text-base font-semibold text-white">Live Data Source</h2><p className="mt-2 text-sm leading-6 text-neutral-500">All dashboard values come from Express and MongoDB. Public content invalidation runs after menu, blog, offer and order mutations.</p><p className="mt-4 text-xs text-neutral-600">{dashboard?.stats?.menuItemCount || 0} menu items · {dashboard?.stats?.totalOrders || 0} orders</p></article>
    <article className={`${CARD} p-5`}><Clock3 className="h-6 w-6 text-sky-400" /><h2 className="mt-4 font-body text-base font-semibold text-white">Environment Settings</h2><p className="mt-2 text-sm leading-6 text-neutral-500">API origin, database connection and JWT secret remain managed through the existing environment files.</p><Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-xs text-dune-amber hover:text-dune-amberLight">Open public website <ExternalLink className="h-3.5 w-3.5" /></Link></article>
  </div>
);
