"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign, CircleUserRound, CreditCard, Edit3, Eye, Heart,
  LoaderCircle, LogOut, Mail, MapPin, Package, Phone, Plus, RefreshCw,
  Settings, ShoppingBag, Star, Trash2, Trophy, UserRound,
} from "lucide-react";
import Navbar from "../Navbar.jsx";
import CartDrawer from "../CartDrawer.jsx";
import SmartImage from "../SmartImage.jsx";
import AccountModal from "./AccountModal.jsx";
import {
  AddressForm, OrderDetails, PaymentForm, PersonalForm, ProfileForm,
  ReviewForm, primaryButton, secondaryButton,
} from "./AccountForms.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useFavorites } from "../../context/FavoritesContext.jsx";
import {
  deleteAddress, deletePaymentMethod, fetchProfileDashboard,
  setDefaultAddress, setDefaultPaymentMethod,
} from "../../api/api.js";
import { formatPrice } from "../../utils/currency.js";

const NAV_ITEMS = [
  ["profile", "Profile", UserRound], ["orders", "My Orders", ShoppingBag],
  ["favorites", "Favorites", Heart], ["addresses", "Addresses", MapPin],
  ["payments", "Payment Methods", CreditCard], ["reviews", "Reviews", Star],
  ["settings", "Settings", Settings],
];

const STATUS_STYLES = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  confirmed: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  preparing: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "out-for-delivery": "border-violet-500/40 bg-violet-500/10 text-violet-300",
  delivered: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-red-500/40 bg-red-500/10 text-red-300",
};

const titleCase = (value) => value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const Card = ({ children, className = "" }) => <section className={`rounded-xl border border-dune-border bg-gradient-to-br from-[#151515] to-[#0c0c0c] ${className}`}>{children}</section>;
const CardHeader = ({ title, action }) => <div className="flex items-center justify-between gap-4 border-b border-dune-border px-5 py-4"><h2 className="eyebrow">{title}</h2>{action}</div>;
const StatusBadge = ({ status }) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || "border-neutral-600 text-neutral-300"}`}>{titleCase(status)}</span>;

const AccountDashboard = () => {
  const { setUser, logout } = useAuth();
  const { addItemsToCart } = useCart();
  const { toggleFavorite } = useFavorites();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState("profile");
  const [modal, setModal] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const notify = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const dashboard = await fetchProfileDashboard();
      setData(dashboard);
      setUser(dashboard.user);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "We could not load your account dashboard.");
    } finally { setLoading(false); }
  }, [setUser]);

  useEffect(() => { load(); }, [load]);

  const updateUser = (user) => {
    setUser(user);
    setData((current) => ({ ...current, user }));
  };
  const updateCollection = (key, value) => setData((current) => ({
    ...current, [key]: value,
    stats: key === "favorites" ? { ...current.stats, favorites: value.length } : current.stats,
  }));

  const reorder = (order) => {
    const items = order.items.filter((item) => item.menuItem?._id && item.menuItem.isAvailable !== false).map((item) => ({
      ...item.menuItem, _id: item.menuItem._id, name: item.menuItem.name || item.name,
      price: item.menuItem.price ?? item.price, quantity: item.quantity,
    }));
    if (!items.length) return notify("These items are no longer available on the menu.");
    addItemsToCart(items);
    setModal(null);
    setCartOpen(true);
    notify("Available items from this order were added to your cart.");
  };

  const reviewOptions = useMemo(() => {
    if (!data) return [];
    const reviewed = new Set(data.reviews.map((review) => `${review.order?._id || review.order}:${review.menuItem?._id || review.menuItem}`));
    return data.orders.filter((order) => order.status === "delivered")
      .flatMap((order) => order.items.map((item) => ({ order, item })))
      .filter(({ order, item }) => item.menuItem?._id && !reviewed.has(`${order._id}:${item.menuItem._id}`))
      .map(({ order, item }) => ({ value: `${order._id}:${item.menuItem._id}`, orderId: order._id, menuItemId: item.menuItem._id, label: `${item.name} — Order #${order.orderNumber}` }));
  }, [data]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-black text-neutral-400"><LoaderCircle className="mr-3 h-5 w-5 animate-spin text-dune-amber" />Loading your account...</div>;
  if (error || !data) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-5 text-center"><p className="text-red-400">{error}</p><button type="button" onClick={load} className={secondaryButton}>Try Again</button></div>;

  const { user, stats, rewards, orders, recentOrders, favorites, addresses, paymentMethods, reviews } = data;
  const memberYear = user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();

  const ordersView = (list, compact = false) => <div className="divide-y divide-dune-border px-5">
    {!list.length && <p className="py-10 text-center text-sm text-neutral-500">No orders yet.</p>}
    {list.map((order) => {
      const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const image = order.items[0]?.menuItem?.image;
      return <div key={order._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {image ? <SmartImage src={image} alt="" width={96} height={96} sizes="56px" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-black text-neutral-500"><Package className="h-5 w-5" /></div>}
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">Order #{order.orderNumber}</p><p className="mt-1 text-xs text-neutral-500">{new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {count} item{count === 1 ? "" : "s"}</p><div className="mt-2 sm:hidden"><StatusBadge status={order.status} /></div></div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end"><div className="hidden sm:block"><StatusBadge status={order.status} /></div><span className="min-w-20 text-right text-sm font-semibold text-white">{formatPrice(order.totalAmount)}</span><button type="button" onClick={() => setModal({ type: "order", order })} className={secondaryButton}><Eye className="h-3.5 w-3.5" /><span className={compact ? "hidden 2xl:inline" : ""}>Details</span></button><button type="button" onClick={() => reorder(order)} className={primaryButton}><RefreshCw className="h-3.5 w-3.5" /><span className={compact ? "hidden 2xl:inline" : ""}>Reorder</span></button></div>
      </div>;
    })}
  </div>;

  const favoritesView = (list, compact = false) => <div className={`grid gap-4 p-5 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
    {!list.length && <p className="col-span-full py-8 text-center text-sm text-neutral-500">Your favorite dishes will appear here.</p>}
    {list.map((item) => <article key={item._id} className="group min-w-0"><div className="relative h-28 overflow-hidden rounded-lg border border-dune-border"><SmartImage src={item.image} alt={item.name} width={360} height={224} sizes="220px" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /><button type="button" onClick={async () => { await toggleFavorite(item); updateCollection("favorites", favorites.filter((entry) => entry._id !== item._id)); }} aria-label={`Remove ${item.name} from favorites`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white hover:text-dune-amber"><Heart className="h-4 w-4" fill="currentColor" /></button></div><p className="mt-2 truncate text-sm font-semibold text-white">{item.name}</p><p className="mt-1 text-sm font-semibold text-dune-amber">{formatPrice(item.price)}</p></article>)}
  </div>;

  const addressesView = () => <div className="space-y-3 p-5">
    {!addresses.length && <p className="py-8 text-center text-sm text-neutral-500">No saved delivery addresses.</p>}
    {addresses.map((entry) => <div key={entry._id} className="rounded-lg border border-dune-border bg-black/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><MapPin className="h-4 w-4 text-dune-amber" /><p className="text-sm font-semibold text-white">{entry.label}</p>{entry.isDefault && <span className="rounded-full border border-dune-amber/40 bg-dune-amber/10 px-2 py-0.5 text-[10px] font-semibold text-dune-amber">Default</span>}</div><p className="mt-2 text-sm leading-relaxed text-neutral-400">{entry.fullAddress}</p>{entry.phone && <p className="mt-1 text-xs text-neutral-500">Phone: {entry.phone}</p>}</div><div className="flex"><button type="button" onClick={() => setModal({ type: "address", address: entry })} aria-label={`Edit ${entry.label}`} className="p-2 text-neutral-400 hover:text-white"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={async () => { if (window.confirm(`Delete ${entry.label} address?`)) updateCollection("addresses", await deleteAddress(entry._id)); }} aria-label={`Delete ${entry.label}`} className="p-2 text-neutral-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>{!entry.isDefault && <button type="button" onClick={async () => updateCollection("addresses", await setDefaultAddress(entry._id))} className="mt-3 text-xs font-medium text-dune-amber">Set as default</button>}</div>)}
  </div>;

  const paymentsView = () => <div className="space-y-3 p-5">
    {!paymentMethods.length && <p className="py-8 text-center text-sm text-neutral-500">No demo payment methods saved.</p>}
    {paymentMethods.map((method) => <div key={method._id} className="flex flex-col gap-3 rounded-lg border border-dune-border bg-black/30 p-4 sm:flex-row sm:items-center"><div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-slate-800 to-slate-950 px-1 text-center text-[10px] font-black uppercase text-white">{method.cardBrand}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{method.cardBrand} ending in {method.lastFourDigits}</p>{method.isDefault && <span className="rounded-full border border-dune-amber/40 bg-dune-amber/10 px-2 py-0.5 text-[10px] font-semibold text-dune-amber">Default</span>}</div><p className="mt-1 text-xs text-neutral-500">Expires {String(method.expiryMonth).padStart(2, "0")}/{String(method.expiryYear).slice(-2)} · {method.cardholderName}</p></div><div className="flex items-center">{!method.isDefault && <button type="button" onClick={async () => updateCollection("paymentMethods", await setDefaultPaymentMethod(method._id))} className="px-2 text-xs font-medium text-dune-amber">Set default</button>}<button type="button" onClick={() => setModal({ type: "payment", method })} aria-label="Edit payment method" className="p-2 text-neutral-400 hover:text-white"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={async () => { if (window.confirm("Delete this demo payment method?")) updateCollection("paymentMethods", await deletePaymentMethod(method._id)); }} aria-label="Delete payment method" className="p-2 text-neutral-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>)}
    <p className="text-xs text-neutral-600">Decorative demo only. No full card numbers, CVVs, or payment credentials are collected.</p>
  </div>;

  const reviewsView = () => <div className="space-y-3 p-5">
    {!reviews.length && <p className="py-8 text-center text-sm text-neutral-500">You have not reviewed an order yet.</p>}
    {reviews.map((review) => <article key={review._id} className="rounded-lg border border-dune-border bg-black/30 p-4"><div className="flex items-start gap-3">{review.menuItem?.image && <SmartImage src={review.menuItem.image} alt="" width={80} height={80} sizes="48px" className="h-12 w-12 rounded-lg object-cover" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-white">{review.menuItem?.name || "Menu item"}</p><p className="text-xs text-neutral-500">Order #{review.order?.orderNumber}</p></div><div className="mt-1 flex text-dune-amber">{[1,2,3,4,5].map((value) => <Star key={value} className="h-3.5 w-3.5" fill={value <= review.rating ? "currentColor" : "none"} />)}</div><p className="mt-2 text-sm leading-relaxed text-neutral-400">{review.comment}</p></div></div></article>)}
  </div>;

  const personalCard = <Card><CardHeader title="Personal Information" action={<button type="button" onClick={() => setModal({ type: "personal" })} className={secondaryButton}>Edit Information</button>} /><div className="grid sm:grid-cols-2">{[[UserRound,"Full Name",user.name],[Mail,"Email",user.email],[Phone,"Phone",user.phone || "Not provided"],[MapPin,"Location",user.address || "Not provided"]].map(([Icon,label,value]) => <div key={label} className="flex gap-3 border-b border-dune-border p-5 sm:border-r"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" /><div><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 break-words text-sm text-neutral-200">{value}</p></div></div>)}</div></Card>;

  const loyaltyCard = <Card><CardHeader title="Loyalty & Rewards" /><div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full border border-dune-amber/40 bg-dune-amber/10"><Trophy className="h-6 w-6 text-dune-amber" /></div><div><p className="text-lg font-semibold text-white">{rewards.tier} Member</p><p className="text-sm text-neutral-500">{rewards.pointsAvailable.toLocaleString()} points available</p></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-800"><div className="h-full rounded-full bg-gradient-to-r from-dune-amber to-dune-amberLight" style={{ width: `${rewards.progressPercent}%` }} /></div><p className="mt-2 text-xs text-neutral-500">{rewards.nextTier ? `${rewards.pointsToNextTier.toLocaleString()} points to ${rewards.nextTier}` : "Highest tier achieved"}</p></div><button type="button" onClick={() => notify("Your available points can be redeemed during a qualifying order.")} className={primaryButton}><BadgeDollarSign className="h-4 w-4" />Redeem Points</button></div></Card>;

  return <div className="min-h-screen bg-black font-body text-neutral-200">
    <Navbar onCartClick={() => setCartOpen(true)} />
    <main className="mx-auto grid max-w-[1440px] gap-5 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8 lg:pt-28">
      <aside className="self-start lg:sticky lg:top-24"><Card className="overflow-hidden"><p className="eyebrow px-5 pb-3 pt-5">My Account</p><nav className="space-y-1 px-2 pb-3" aria-label="Account navigation">{NAV_ITEMS.map(([id,label,Icon]) => <button key={id} type="button" onClick={() => setActive(id)} className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-4 py-3 text-left text-sm transition-colors ${active === id ? "border-dune-amber bg-white/10 text-white" : "border-transparent text-neutral-400 hover:bg-white/5 hover:text-white"}`}><Icon className={`h-4 w-4 ${active === id ? "text-dune-amber" : ""}`} />{label}</button>)}<button type="button" onClick={() => { logout(); router.push("/"); }} className="flex w-full items-center gap-3 rounded-lg border-l-2 border-transparent px-4 py-3 text-left text-sm text-neutral-400 hover:bg-red-500/5 hover:text-red-400"><LogOut className="h-4 w-4" />Logout</button></nav></Card>
        <Card className="mt-4 p-5 text-center"><p className="eyebrow">Your Next Reward</p><div className="relative mx-auto mt-5 flex h-32 w-32 items-center justify-center rounded-full" style={{ background: `conic-gradient(#f59e0b ${rewards.progressPercent * 3.6}deg, #333 0deg)` }}><div className="flex h-[106px] w-[106px] flex-col items-center justify-center rounded-full bg-[#101010]"><span className="font-display text-3xl text-white">{rewards.pointsAvailable.toLocaleString()}</span><span className="text-xs text-neutral-500">points</span></div></div><p className="mt-4 text-sm text-neutral-400">{rewards.nextTier ? `${rewards.pointsToNextTier.toLocaleString()} points until ${rewards.nextTier}` : "Top tier achieved"}</p><button type="button" onClick={() => setActive("profile")} className={`${primaryButton} mt-4 w-full`}>View Rewards</button></Card>
      </aside>
      <div className="min-w-0 space-y-5">
        <Card className="p-5 md:p-6"><div className="flex flex-col gap-6 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dune-border bg-black">{user.avatar ? <SmartImage src={user.avatar} alt={`${user.name} avatar`} width={224} height={224} sizes="112px" priority className="h-full w-full object-cover" /> : <CircleUserRound className="h-14 w-14 text-neutral-600" />}</div><div className="min-w-0"><h1 className="font-display text-4xl text-white">{user.name}</h1><p className="mt-1 text-sm text-neutral-400">{rewards.tier} Member · Member since {memberYear}</p><p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-400">{user.bio || "Good food, good mood."}</p><button type="button" onClick={() => setModal({ type: "profile" })} className={`${secondaryButton} mt-4`}><Edit3 className="h-4 w-4" />Edit Profile</button></div></div><div className="grid grid-cols-2 divide-x divide-dune-border sm:grid-cols-4 xl:min-w-[520px]">{[[ShoppingBag,stats.orders,"Orders","orders"],[Heart,stats.favorites,"Favorites","favorites"],[Trophy,stats.rewardPoints,"Reward Points","profile"],[Star,stats.reviews,"Reviews","reviews"]].map(([Icon,value,label,section]) => <button key={label} type="button" onClick={() => setActive(section)} className="px-3 py-3 text-center hover:bg-white/[0.03]"><Icon className="mx-auto h-5 w-5 text-neutral-500" /><span className="mt-2 block font-display text-2xl text-dune-amber">{Number(value).toLocaleString()}</span><span className="mt-1 block text-xs text-neutral-400">{label}</span></button>)}</div></div></Card>
        {active === "profile" && <div className="grid gap-5 xl:grid-cols-2">{personalCard}<Card><CardHeader title="Recent Orders" action={<button type="button" onClick={() => setActive("orders")} className="text-xs text-neutral-300 hover:text-dune-amber">View All Orders</button>} />{ordersView(recentOrders,true)}</Card><Card><CardHeader title="Favorite Dishes" action={<button type="button" onClick={() => setActive("favorites")} className="text-xs text-neutral-300 hover:text-dune-amber">View All</button>} />{favoritesView(favorites.slice(0,3),true)}</Card><Card><CardHeader title="Saved Addresses" action={<button type="button" onClick={() => setActive("addresses")} className="text-xs text-neutral-300 hover:text-dune-amber">Manage Addresses</button>} />{addressesView()}</Card><div className="xl:col-span-2">{loyaltyCard}</div><Card className="xl:col-span-2"><CardHeader title="Payment Methods" action={<button type="button" onClick={() => setActive("payments")} className="text-xs text-neutral-300 hover:text-dune-amber">Manage</button>} />{paymentsView()}</Card></div>}
        {active === "orders" && <Card><CardHeader title="My Orders" action={<button type="button" onClick={load} className="text-xs text-neutral-400 hover:text-dune-amber">Refresh</button>} />{ordersView(orders)}</Card>}
        {active === "favorites" && <Card><CardHeader title="Favorite Dishes" action={<button type="button" onClick={() => router.push("/menu")} className="text-xs text-neutral-300 hover:text-dune-amber">Browse Menu</button>} />{favoritesView(favorites)}</Card>}
        {active === "addresses" && <Card><CardHeader title="Saved Addresses" action={<button type="button" onClick={() => setModal({ type: "address", address: null })} className={primaryButton}><Plus className="h-4 w-4" />Add Address</button>} />{addressesView()}</Card>}
        {active === "payments" && <Card><CardHeader title="Payment Methods" action={<button type="button" onClick={() => setModal({ type: "payment", method: null })} className={primaryButton}><Plus className="h-4 w-4" />Add New Card</button>} />{paymentsView()}</Card>}
        {active === "reviews" && <Card><CardHeader title="My Reviews" action={<button type="button" disabled={!reviewOptions.length} onClick={() => setModal({ type: "review" })} className={primaryButton}><Plus className="h-4 w-4" />Write Review</button>} />{reviewsView()}{!reviewOptions.length && <p className="px-5 pb-5 text-xs text-neutral-600">New reviews become available after a delivered order.</p>}</Card>}
        {active === "settings" && <div className="space-y-5">{personalCard}<Card><CardHeader title="Profile Settings" /><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">Public account details</p><p className="mt-1 text-sm text-neutral-500">Update your display name, avatar, and short bio.</p></div><button type="button" onClick={() => setModal({ type: "profile" })} className={secondaryButton}><Edit3 className="h-4 w-4" />Edit Profile</button></div></Card></div>}
      </div>
    </main>
    {notice && <div role="status" className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-dune-amber/40 bg-[#17110a] px-5 py-3 text-sm text-white shadow-xl">{notice}</div>}
    <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    {modal?.type === "profile" && <AccountModal title="Edit Profile" description="Update your account header details." onClose={() => setModal(null)}><ProfileForm user={user} onClose={() => setModal(null)} onSaved={updateUser} /></AccountModal>}
    {modal?.type === "personal" && <AccountModal title="Edit Information" description="These details are saved to your account." maxWidth="max-w-2xl" onClose={() => setModal(null)}><PersonalForm user={user} onClose={() => setModal(null)} onSaved={updateUser} /></AccountModal>}
    {modal?.type === "address" && <AccountModal title={modal.address ? "Edit Address" : "Add Address"} onClose={() => setModal(null)}><AddressForm address={modal.address} onClose={() => setModal(null)} onSaved={(value) => updateCollection("addresses", value)} /></AccountModal>}
    {modal?.type === "payment" && <AccountModal title={modal.method ? "Edit Payment Method" : "Add Demo Payment Method"} description="For dashboard demonstration only—do not enter real payment credentials." maxWidth="max-w-2xl" onClose={() => setModal(null)}><PaymentForm method={modal.method} onClose={() => setModal(null)} onSaved={(value) => updateCollection("paymentMethods", value)} /></AccountModal>}
    {modal?.type === "review" && <AccountModal title="Write a Review" description="Share feedback about an item from a delivered order." onClose={() => setModal(null)}><ReviewForm options={reviewOptions} onClose={() => setModal(null)} onSaved={(review) => setData((current) => ({ ...current, reviews: [review,...current.reviews], stats: { ...current.stats, reviews: current.stats.reviews + 1 } }))} /></AccountModal>}
    {modal?.type === "order" && <OrderDetails order={modal.order} onClose={() => setModal(null)} onReorder={reorder} />}
  </div>;
};

export default AccountDashboard;

