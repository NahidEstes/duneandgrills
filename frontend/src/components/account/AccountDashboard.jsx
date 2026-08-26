"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  CircleUserRound,
  CreditCard,
  Crown,
  Edit3,
  Ellipsis,
  Eye,
  Heart,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  MessageSquareText,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  ShoppingBag,
  Star,
  Trash2,
  Trophy,
  UserRound,
} from "lucide-react";
import Navbar from "../Navbar.jsx";
import CartDrawer from "../CartDrawer.jsx";
import SmartImage from "../SmartImage.jsx";
import AccountModal from "./AccountModal.jsx";
import {
  AddressForm,
  OrderDetails,
  PaymentForm,
  PersonalForm,
  ProfileForm,
  ReviewForm,
  secondaryButton,
} from "./AccountForms.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useFavorites } from "../../context/FavoritesContext.jsx";
import {
  deleteAddress,
  deletePaymentMethod,
  fetchProfileDashboard,
  setDefaultAddress,
  setDefaultPaymentMethod,
} from "../../api/api.js";
import { formatPrice } from "../../utils/currency.js";

const NAV_ITEMS = [
  ["profile", "Profile", UserRound],
  ["orders", "My Orders", ShoppingBag],
  ["favorites", "Favorites", Heart],
  ["addresses", "Addresses", MapPin],
  ["payments", "Payment Methods", CreditCard],
  ["reviews", "Reviews", Star],
  ["settings", "Settings", Settings],
];

const STATUS_STYLES = {
  pending: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  confirmed: "border-sky-500/35 bg-sky-500/10 text-sky-300",
  preparing: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  "out-for-delivery": "border-violet-500/35 bg-violet-500/10 text-violet-300",
  delivered: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-red-500/35 bg-red-500/10 text-red-300",
};

const compactOutline =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#414141] px-3 text-xs font-medium text-white transition-colors hover:border-dune-amber hover:text-dune-amber";
const compactAmber =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-[#df7400] to-[#f58a00] px-4 text-xs font-semibold text-white shadow-[0_0_18px_-8px_rgba(245,158,11,0.9)] transition hover:brightness-110";

const titleCase = (value = "") =>
  value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const Card = ({ children, className = "" }) => (
  <section
    className={`overflow-hidden rounded-[10px] border border-[#2b2b2b] bg-[linear-gradient(135deg,#151515_0%,#0c0c0c_100%)] ${className}`}
  >
    {children}
  </section>
);

const CardHeader = ({ title, action, border = false }) => (
  <div
    className={`flex h-12 items-center justify-between gap-4 px-[18px] ${
      border ? "border-b border-[#2b2b2b]" : ""
    }`}
  >
    <h2 className="text-[12px] font-bold uppercase tracking-[0.13em] text-[#f58700]">
      {title}
    </h2>
    {action}
  </div>
);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
      STATUS_STYLES[status] || "border-neutral-600 text-neutral-300"
    }`}
  >
    {titleCase(status)}
  </span>
);

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
      setError(
        requestError.response?.data?.message ||
          "We could not load your account dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUser = (user) => {
    setUser(user);
    setData((current) => ({ ...current, user }));
  };

  const updateCollection = (key, value) => {
    setData((current) => ({
      ...current,
      [key]: value,
      stats:
        key === "favorites"
          ? { ...current.stats, favorites: value.length }
          : current.stats,
    }));
  };

  const reorder = (order) => {
    const items = order.items
      .filter(
        (item) =>
          item.menuItem?._id && item.menuItem.isAvailable !== false
      )
      .map((item) => ({
        ...item.menuItem,
        _id: item.menuItem._id,
        name: item.menuItem.name || item.name,
        price: item.menuItem.price ?? item.price,
        quantity: item.quantity,
      }));

    if (!items.length) {
      notify("These items are no longer available on the menu.");
      return;
    }

    addItemsToCart(items);
    setModal(null);
    setCartOpen(true);
    notify("Available items from this order were added to your cart.");
  };

  const reviewOptions = useMemo(() => {
    if (!data) return [];
    const reviewed = new Set(
      data.reviews.map(
        (review) =>
          `${review.order?._id || review.order}:${
            review.menuItem?._id || review.menuItem
          }`
      )
    );

    return data.orders
      .filter((order) => order.status === "delivered")
      .flatMap((order) => order.items.map((item) => ({ order, item })))
      .filter(
        ({ order, item }) =>
          item.menuItem?._id &&
          !reviewed.has(`${order._id}:${item.menuItem._id}`)
      )
      .map(({ order, item }) => ({
        value: `${order._id}:${item.menuItem._id}`,
        orderId: order._id,
        menuItemId: item.menuItem._id,
        label: `${item.name} — Order #${order.orderNumber}`,
      }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-neutral-400">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin text-dune-amber" />
        Loading your account...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-5 text-center">
        <p className="text-red-400">{error}</p>
        <button type="button" onClick={load} className={secondaryButton}>
          Try Again
        </button>
      </div>
    );
  }

  const {
    user,
    stats,
    rewards,
    orders,
    recentOrders,
    favorites,
    addresses,
    paymentMethods,
    reviews,
  } = data;
  const memberYear = user.createdAt
    ? new Date(user.createdAt).getFullYear()
    : new Date().getFullYear();
  const firstName = user.name?.split(" ")[0] || "Member";
  const rewardTarget =
    rewards.nextTierPoints || Math.max(rewards.pointsAvailable, 1);
  const defaultAddress =
    addresses.find((entry) => entry.isDefault) || addresses[0];
  const defaultPayment =
    paymentMethods.find((method) => method.isDefault) || paymentMethods[0];

  const ordersView = (list, compact = false) => (
    <div className={compact ? "divide-y divide-[#292929] px-[18px]" : "divide-y divide-[#292929] px-5"}>
      {!list.length && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No orders yet.
        </p>
      )}
      {list.map((order) => {
        const count = order.items.reduce(
          (sum, item) => sum + item.quantity,
          0
        );
        const image = order.items[0]?.menuItem?.image;

        return (
          <div
            key={order._id}
            className={`flex flex-col gap-3 sm:flex-row sm:items-center ${
              compact ? "min-h-[67px] py-2" : "py-4"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {image ? (
                <SmartImage
                  src={image}
                  alt=""
                  width={96}
                  height={96}
                  sizes={compact ? "54px" : "60px"}
                  className={`${
                    compact ? "h-[54px] w-[54px]" : "h-[60px] w-[60px]"
                  } shrink-0 rounded-[7px] object-cover`}
                />
              ) : (
                <div
                  className={`${
                    compact ? "h-[54px] w-[54px]" : "h-[60px] w-[60px]"
                  } flex shrink-0 items-center justify-center rounded-[7px] bg-black text-neutral-500`}
                >
                  <Package className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">
                  Order #{order.orderNumber}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {new Date(order.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {count} item{count === 1 ? "" : "s"}
                </p>
                <div className="mt-1.5 sm:hidden">
                  <StatusBadge status={order.status} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <div className="min-w-[74px] text-right">
                <p className="text-[13px] font-semibold text-white">
                  {formatPrice(order.totalAmount)}
                </p>
                <div className="mt-1 hidden sm:block">
                  <StatusBadge status={order.status} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal({ type: "order", order })}
                className={compactOutline}
              >
                <Eye className="h-3.5 w-3.5 sm:hidden" />
                View Details
              </button>
              <button
                type="button"
                onClick={() => reorder(order)}
                className={compactAmber}
              >
                Reorder
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const favoritesView = (list, compact = false) => (
    <div
      className={`grid gap-4 px-[18px] pb-4 ${
        compact ? "grid-cols-1 sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3"
      }`}
    >
      {!list.length && (
        <p className="col-span-full py-8 text-center text-sm text-neutral-500">
          Your favorite dishes will appear here.
        </p>
      )}
      {list.map((item) => (
        <article key={item._id} className="group min-w-0">
          <div
            className={`relative overflow-hidden rounded-[7px] border border-[#383838] ${
              compact ? "h-[98px]" : "h-32"
            }`}
          >
            <SmartImage
              src={item.image}
              alt={item.name}
              width={360}
              height={224}
              sizes="220px"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <button
              type="button"
              onClick={async () => {
                await toggleFavorite(item);
                updateCollection(
                  "favorites",
                  favorites.filter((entry) => entry._id !== item._id)
                );
              }}
              aria-label={`Remove ${item.name} from favorites`}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-sm hover:text-dune-amber"
            >
              <Heart className="h-4 w-4" fill="currentColor" />
            </button>
          </div>
          <p className="mt-2 truncate text-[13px] font-semibold text-white">
            {item.name}
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#f58700]">
            {formatPrice(item.price)}
          </p>
        </article>
      ))}
    </div>
  );

  const addressCard = (entry, editable = false) => (
    <div
      key={entry._id}
      className="rounded-[7px] border border-[#333] bg-black/15 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="h-[18px] w-[18px] text-white" />
            <p className="text-[13px] font-semibold text-white">
              {entry.label}
            </p>
            {entry.isDefault && (
              <span className="rounded-full border border-[#8c4b00] bg-[#2b1803] px-2 py-0.5 text-[9px] font-semibold text-[#f58700]">
                Default
              </span>
            )}
          </div>
          <p className="mt-2 pl-[26px] text-[12px] leading-5 text-neutral-400">
            {entry.fullAddress}
          </p>
          {entry.phone && (
            <p className="mt-0.5 pl-[26px] text-[12px] text-neutral-400">
              Phone: {entry.phone}
            </p>
          )}
        </div>
        {editable ? (
          <div className="flex shrink-0">
            <button
              type="button"
              onClick={() => setModal({ type: "address", address: entry })}
              aria-label={`Edit ${entry.label}`}
              className="p-2 text-neutral-500 hover:text-white"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Delete ${entry.label} address?`)) {
                  updateCollection(
                    "addresses",
                    await deleteAddress(entry._id)
                  );
                }
              }}
              aria-label={`Delete ${entry.label}`}
              className="p-2 text-neutral-500 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActive("addresses")}
            aria-label="Manage saved addresses"
            className="p-1 text-neutral-400 hover:text-white"
          >
            <Ellipsis className="h-5 w-5" />
          </button>
        )}
      </div>
      {editable && !entry.isDefault && (
        <button
          type="button"
          onClick={async () =>
            updateCollection(
              "addresses",
              await setDefaultAddress(entry._id)
            )
          }
          className="mt-3 pl-[26px] text-xs font-medium text-dune-amber"
        >
          Set as default
        </button>
      )}
    </div>
  );

  const addressesView = (compact = false) => (
    <div className={compact ? "px-[18px] pb-[18px]" : "space-y-3 p-5"}>
      {!addresses.length && (
        <p className="py-8 text-center text-sm text-neutral-500">
          No saved delivery addresses.
        </p>
      )}
      {(compact
        ? defaultAddress
          ? [defaultAddress]
          : []
        : addresses
      ).map((entry) => addressCard(entry, !compact))}
    </div>
  );

  const paymentRow = (method, editable = false) => (
    <div
      key={method._id}
      className={`flex flex-col gap-3 ${
        editable
          ? "rounded-lg border border-[#333] bg-black/20 p-4 sm:flex-row sm:items-center"
          : "sm:flex-row sm:items-center"
      }`}
    >
      <div className="flex h-11 w-[62px] shrink-0 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#123a86] to-[#071d4e] px-1 text-center text-[14px] font-black uppercase italic text-white">
        {method.cardBrand}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-white">
            {method.cardBrand} ending in {method.lastFourDigits}
          </p>
          {method.isDefault && (
            <span className="rounded-full border border-[#8c4b00] bg-[#2b1803] px-2 py-0.5 text-[9px] font-semibold text-[#f58700]">
              Default
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          Expires {String(method.expiryMonth).padStart(2, "0")}/
          {String(method.expiryYear).slice(-2)}
        </p>
      </div>
      {editable && (
        <div className="flex items-center">
          {!method.isDefault && (
            <button
              type="button"
              onClick={async () =>
                updateCollection(
                  "paymentMethods",
                  await setDefaultPaymentMethod(method._id)
                )
              }
              className="px-2 text-xs font-medium text-dune-amber"
            >
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={() => setModal({ type: "payment", method })}
            aria-label="Edit payment method"
            className="p-2 text-neutral-500 hover:text-white"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm("Delete this demo payment method?")) {
                updateCollection(
                  "paymentMethods",
                  await deletePaymentMethod(method._id)
                );
              }
            }}
            aria-label="Delete payment method"
            className="p-2 text-neutral-500 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  const paymentsView = () => (
    <div className="space-y-3 p-5">
      {!paymentMethods.length && (
        <p className="py-8 text-center text-sm text-neutral-500">
          No demo payment methods saved.
        </p>
      )}
      {paymentMethods.map((method) => paymentRow(method, true))}
      <p className="text-xs text-neutral-600">
        Decorative demo only. No full card numbers, CVVs, or payment
        credentials are collected.
      </p>
    </div>
  );

  const reviewsView = () => (
    <div className="space-y-3 p-5">
      {!reviews.length && (
        <p className="py-8 text-center text-sm text-neutral-500">
          You have not reviewed an order yet.
        </p>
      )}
      {reviews.map((review) => (
        <article
          key={review._id}
          className="rounded-lg border border-[#333] bg-black/20 p-4"
        >
          <div className="flex items-start gap-3">
            {review.menuItem?.image && (
              <SmartImage
                src={review.menuItem.image}
                alt=""
                width={80}
                height={80}
                sizes="48px"
                className="h-12 w-12 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {review.menuItem?.name || "Menu item"}
                </p>
                <p className="text-xs text-neutral-500">
                  Order #{review.order?.orderNumber}
                </p>
              </div>
              <div className="mt-1 flex text-dune-amber">
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star
                    key={value}
                    className="h-3.5 w-3.5"
                    fill={value <= review.rating ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                {review.comment}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );

  const personalCard = (
    <Card className="min-h-[272px]">
      <CardHeader
        title="Personal Information"
        action={
          <button
            type="button"
            onClick={() => setModal({ type: "personal" })}
            className={compactOutline}
          >
            Edit Information
          </button>
        }
      />
      <div className="px-[18px]">
        {[
          [UserRound, "Full Name", user.name],
          [Mail, "Email", user.email],
          [Phone, "Phone", user.phone || "Not provided"],
          [MapPin, "Location", user.address || "Not provided"],
        ].map(([Icon, label, value]) => (
          <div
            key={label}
            className="grid min-h-[52px] grid-cols-[minmax(130px,0.8fr)_1.2fr] items-center gap-4 border-b border-[#2d2d2d] last:border-0"
          >
            <div className="flex items-center gap-3 text-[12px] text-neutral-300">
              <Icon className="h-4 w-4 text-neutral-500" />
              {label}
            </div>
            <p className="truncate text-right text-[12px] text-neutral-400">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );

  const loyaltyCard = (
    <Card className="min-h-[150px] p-[18px]">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.13em] text-[#f58700]">
        Loyalty &amp; Rewards
      </h2>
      <div className="grid min-h-[90px] gap-4 rounded-[8px] border border-[#aa5b00] bg-black/10 px-4 py-3 sm:grid-cols-[1.25fr_0.65fr_1fr_auto] sm:items-center sm:divide-x sm:divide-[#333]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#6b430f] bg-[radial-gradient(circle,#3a2a10_0%,#17130d_70%)]">
            <Trophy className="h-7 w-7 text-[#f59e0b]" />
          </div>
          <div>
            <p className="text-[16px] font-semibold text-white">
              {rewards.tier} Member
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">
              Enjoy exclusive perks and special offers.
            </p>
          </div>
        </div>

        <div className="sm:pl-7">
          <p className="font-display text-2xl text-white">
            {rewards.pointsAvailable.toLocaleString()}
          </p>
          <p className="text-[11px] text-neutral-300">Points Available</p>
          <button
            type="button"
            onClick={() =>
              notify(
                "Your available points can be redeemed during a qualifying order."
              )
            }
            className="mt-1 rounded bg-gradient-to-r from-[#df7400] to-[#f58a00] px-3 py-1 text-[10px] font-semibold text-white"
          >
            Redeem Points
          </button>
        </div>

        <div className="sm:pl-7">
          <p className="text-[10px] text-neutral-500">Member Level</p>
          <p className="mt-1 text-[13px] font-semibold text-[#f58700]">
            {rewards.tier}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#4a3314]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#e17600] to-[#ff9300]"
              style={{ width: `${rewards.progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[9px] text-neutral-600">
            {rewards.nextTier
              ? `Next level at ${rewards.nextTierPoints.toLocaleString()} points`
              : "Highest level achieved"}
          </p>
        </div>

        <div className="hidden h-16 w-16 items-center justify-center rounded-full border-2 border-[#f59e0b] bg-[#2d1b04] text-[#f59e0b] sm:flex">
          <Crown className="h-8 w-8" />
        </div>
      </div>
    </Card>
  );

  const profileHeader = (
    <Card className="min-h-[190px] p-4 lg:p-[18px]">
      <div className="flex h-full flex-col gap-6 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-[138px] w-[138px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#333] bg-black">
            {user.avatar ? (
              <SmartImage
                src={user.avatar}
                alt={`${user.name} avatar`}
                width={276}
                height={276}
                sizes="138px"
                priority
                className="h-full w-full object-cover"
              />
            ) : (
              <CircleUserRound className="h-16 w-16 text-neutral-600" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-body text-[29px] font-bold leading-none text-white">
              {firstName}
            </h1>
            <p className="mt-3 text-[12px] text-neutral-400">
              Food Lover <span className="mx-1">•</span> Member since {memberYear}
            </p>
            <p className="mt-3 max-w-[360px] truncate text-[12px] text-neutral-400">
              {user.bio || "Good food, good mood."}
            </p>
            <button
              type="button"
              onClick={() => setModal({ type: "profile" })}
              className={`${compactOutline} mt-4`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Profile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:min-w-[530px]">
          {[
            [ShoppingBag, stats.orders, "Orders", "orders"],
            [Heart, stats.favorites, "Favorites", "favorites"],
            [Award, stats.rewardPoints, "Reward Points", "profile"],
            [MessageSquareText, stats.reviews, "Reviews", "reviews"],
          ].map(([Icon, value, label, section], index) => (
            <button
              key={label}
              type="button"
              onClick={() => setActive(section)}
              className={`min-h-[98px] px-3 text-center transition hover:bg-white/[0.025] ${
                index > 0 ? "border-l border-dashed border-[#343434]" : ""
              }`}
            >
              <Icon className="mx-auto h-5 w-5 text-neutral-500" />
              <span className="mt-3 block font-body text-[23px] font-bold leading-none text-[#f58700]">
                {Number(value).toLocaleString()}
              </span>
              <span className="mt-2 block text-[11px] text-neutral-400">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );

  const sidebar = (
    <aside className="self-start lg:sticky lg:top-[98px]">
      <Card className="min-h-[406px]">
        <p className="px-[18px] pb-4 pt-[18px] text-[12px] font-bold uppercase tracking-[0.13em] text-[#f58700]">
          My Account
        </p>
        <nav className="space-y-0.5 pb-3" aria-label="Account navigation">
          {NAV_ITEMS.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`relative flex h-[43px] w-full items-center gap-3 px-[20px] text-left text-[13px] transition-colors ${
                active === id
                  ? "bg-[linear-gradient(90deg,#303030_0%,#242424_100%)] text-white before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-r before:bg-[#f58700]"
                  : "text-neutral-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon
                className={`h-[19px] w-[19px] ${
                  active === id ? "text-[#f58700]" : "text-neutral-500"
                }`}
              />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="flex h-[43px] w-full items-center gap-3 px-[20px] text-left text-[13px] text-neutral-300 transition-colors hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut className="h-[19px] w-[19px] text-neutral-500" />
            Logout
          </button>
        </nav>
      </Card>

      <Card className="mt-[14px] min-h-[286px] p-[18px] text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.13em] text-[#f58700]">
          Your Next Reward
        </p>
        <p className="mx-auto mt-3 max-w-[200px] text-[12px] leading-5 text-neutral-300">
          {rewards.nextTier
            ? `You're only ${rewards.pointsToNextTier.toLocaleString()} points away from ${rewards.nextTier}.`
            : "You have reached our highest reward tier."}
        </p>
        <div
          className="relative mx-auto mt-3 flex h-[126px] w-[126px] items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(from 225deg, #ff8a00 0deg, #ff8a00 ${
              rewards.progressPercent * 2.7
            }deg, #414141 ${rewards.progressPercent * 2.7}deg, #414141 270deg, transparent 270deg)`,
          }}
        >
          <div className="flex h-[113px] w-[113px] flex-col items-center justify-center rounded-full bg-[#101010]">
            <span className="font-body text-[23px] font-bold leading-none text-white">
              {rewards.pointsAvailable.toLocaleString()}
            </span>
            <span className="mt-1 text-[11px] text-neutral-300">
              / {rewardTarget.toLocaleString()}
            </span>
            <span className="mt-1 text-[10px] text-neutral-400">Points</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActive("profile")}
          className={`${compactAmber} mt-2 w-[164px]`}
        >
          View Rewards
        </button>
      </Card>
    </aside>
  );

  const overview = (
    <>
      <div className="grid gap-[14px] xl:grid-cols-[5fr_7fr]">
        {personalCard}
        <Card className="min-h-[272px]">
          <CardHeader
            title="Recent Orders"
            border
            action={
              <button
                type="button"
                onClick={() => setActive("orders")}
                className="text-[11px] text-neutral-300 hover:text-dune-amber"
              >
                View All Orders
              </button>
            }
          />
          {ordersView(recentOrders.slice(0, 3), true)}
        </Card>
      </div>

      <div className="grid gap-[14px] xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="min-h-[218px]">
          <CardHeader
            title="Favorite Dishes"
            action={
              <button
                type="button"
                onClick={() => setActive("favorites")}
                className="text-[11px] text-neutral-400 hover:text-dune-amber"
              >
                View All
              </button>
            }
          />
          {favoritesView(favorites.slice(0, 3), true)}
        </Card>

        <Card className="min-h-[218px]">
          <CardHeader
            title="Saved Addresses"
            action={
              <button
                type="button"
                onClick={() => setActive("addresses")}
                className="text-[11px] text-neutral-400 hover:text-dune-amber"
              >
                Manage Addresses
              </button>
            }
          />
          {addressesView(true)}
        </Card>
      </div>
    </>
  );

  const sectionContent = {
    orders: (
      <Card>
        <CardHeader
          title="My Orders"
          border
          action={
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-dune-amber"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          }
        />
        {ordersView(orders)}
      </Card>
    ),
    favorites: (
      <Card>
        <CardHeader
          title="Favorite Dishes"
          action={
            <button
              type="button"
              onClick={() => router.push("/menu")}
              className="text-xs text-neutral-300 hover:text-dune-amber"
            >
              Browse Menu
            </button>
          }
        />
        {favoritesView(favorites)}
      </Card>
    ),
    addresses: (
      <Card>
        <CardHeader
          title="Saved Addresses"
          border
          action={
            <button
              type="button"
              onClick={() => setModal({ type: "address", address: null })}
              className={compactAmber}
            >
              <Plus className="h-4 w-4" /> Add Address
            </button>
          }
        />
        {addressesView()}
      </Card>
    ),
    payments: (
      <Card>
        <CardHeader
          title="Payment Methods"
          border
          action={
            <button
              type="button"
              onClick={() => setModal({ type: "payment", method: null })}
              className={compactAmber}
            >
              <Plus className="h-4 w-4" /> Add New Card
            </button>
          }
        />
        {paymentsView()}
      </Card>
    ),
    reviews: (
      <Card>
        <CardHeader
          title="My Reviews"
          border
          action={
            <button
              type="button"
              disabled={!reviewOptions.length}
              onClick={() => setModal({ type: "review" })}
              className={compactAmber}
            >
              <Plus className="h-4 w-4" /> Write Review
            </button>
          }
        />
        {reviewsView()}
        {!reviewOptions.length && (
          <p className="px-5 pb-5 text-xs text-neutral-600">
            New reviews become available after a delivered order.
          </p>
        )}
      </Card>
    ),
    settings: (
      <div className="space-y-[14px]">
        {personalCard}
        <Card>
          <CardHeader title="Profile Settings" border />
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-white">Public account details</p>
              <p className="mt-1 text-sm text-neutral-500">
                Update your display name, avatar, and short bio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal({ type: "profile" })}
              className={compactOutline}
            >
              <Edit3 className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </Card>
      </div>
    ),
  };

  const bottomOverview = (
    <div className="grid gap-[14px] lg:col-span-2 lg:grid-cols-[1.66fr_1fr]">
      {loyaltyCard}
      <Card className="min-h-[150px]">
        <CardHeader
          title="Payment Methods"
          action={
            <button
              type="button"
              onClick={() => setActive("payments")}
              className="text-[11px] text-neutral-400 hover:text-dune-amber"
            >
              Manage
            </button>
          }
        />
        <div className="flex flex-col gap-3 px-[18px] pb-[18px] sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {defaultPayment ? (
              paymentRow(defaultPayment)
            ) : (
              <p className="text-sm text-neutral-500">
                No demo payment method saved.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: "payment", method: null })}
            className={`${compactOutline} shrink-0`}
          >
            <Plus className="h-4 w-4" /> Add New Card
          </button>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-black font-body text-neutral-200">
      <Navbar
        onCartClick={() => setCartOpen(true)}
        alwaysSolid
        wide
      />

      <main className="mx-auto grid max-w-[1440px] gap-[14px] px-4 pb-12 pt-[92px] sm:px-6 lg:grid-cols-[266px_minmax(0,1fr)] lg:px-8 lg:pt-[98px]">
        {sidebar}

        <div className="min-w-0 space-y-[14px]">
          {profileHeader}
          {active === "profile" ? overview : sectionContent[active]}
        </div>

        {active === "profile" && bottomOverview}
      </main>

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-dune-amber/40 bg-[#17110a] px-5 py-3 text-sm text-white shadow-xl"
        >
          {notice}
        </div>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {modal?.type === "profile" && (
        <AccountModal
          title="Edit Profile"
          description="Update your account header details."
          onClose={() => setModal(null)}
        >
          <ProfileForm
            user={user}
            onClose={() => setModal(null)}
            onSaved={updateUser}
          />
        </AccountModal>
      )}

      {modal?.type === "personal" && (
        <AccountModal
          title="Edit Information"
          description="These details are saved to your account."
          maxWidth="max-w-2xl"
          onClose={() => setModal(null)}
        >
          <PersonalForm
            user={user}
            onClose={() => setModal(null)}
            onSaved={updateUser}
          />
        </AccountModal>
      )}

      {modal?.type === "address" && (
        <AccountModal
          title={modal.address ? "Edit Address" : "Add Address"}
          onClose={() => setModal(null)}
        >
          <AddressForm
            address={modal.address}
            onClose={() => setModal(null)}
            onSaved={(value) => updateCollection("addresses", value)}
          />
        </AccountModal>
      )}

      {modal?.type === "payment" && (
        <AccountModal
          title={
            modal.method ? "Edit Payment Method" : "Add Demo Payment Method"
          }
          description="For dashboard demonstration only—do not enter real payment credentials."
          maxWidth="max-w-2xl"
          onClose={() => setModal(null)}
        >
          <PaymentForm
            method={modal.method}
            onClose={() => setModal(null)}
            onSaved={(value) => updateCollection("paymentMethods", value)}
          />
        </AccountModal>
      )}

      {modal?.type === "review" && (
        <AccountModal
          title="Write a Review"
          description="Share feedback about an item from a delivered order."
          onClose={() => setModal(null)}
        >
          <ReviewForm
            options={reviewOptions}
            onClose={() => setModal(null)}
            onSaved={(review) =>
              setData((current) => ({
                ...current,
                reviews: [review, ...current.reviews],
                stats: {
                  ...current.stats,
                  reviews: current.stats.reviews + 1,
                },
              }))
            }
          />
        </AccountModal>
      )}

      {modal?.type === "order" && (
        <OrderDetails
          order={modal.order}
          onClose={() => setModal(null)}
          onReorder={reorder}
        />
      )}
    </div>
  );
};

export default AccountDashboard;
