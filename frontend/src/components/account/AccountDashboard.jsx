"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award,
  ChevronRight,
  CircleUserRound,
  CreditCard,
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
  UserRound,
} from "lucide-react";
import Navbar from "../Navbar.jsx";
import CartDrawer from "../CartDrawer.jsx";
import SmartImage from "../SmartImage.jsx";
import AccountModal from "./AccountModal.jsx";
import DuneRewards from "./DuneRewards.jsx";
import OrderStatusBadge from "./OrderStatusBadge.jsx";
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
import { formatOrderType } from "../../utils/order.js";

const NAV_ITEMS = [
  ["profile", "Profile", UserRound],
  ["orders", "My Orders", ShoppingBag],
  ["favorites", "Favorites", Heart],
  ["rewards", "Dune Rewards", Award],
  ["addresses", "Addresses", MapPin],
  ["payments", "Payment Methods", CreditCard],
  ["reviews", "Reviews", Star],
  ["settings", "Settings", Settings],
];

const ACCOUNT_ROUTES = {
  profile: "/profile",
  orders: "/profile/orders",
  favorites: "/profile/favorites",
  rewards: "/profile/rewards",
  addresses: "/profile/addresses",
  payments: "/profile/payment-methods",
  reviews: "/profile/reviews",
  settings: "/profile/settings",
};

const SHOW_REORDER_ACTIONS = false;

const compactOutline =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#414141] px-3 text-xs font-medium text-white transition-colors hover:border-dune-amber hover:text-dune-amber";
const compactAmber =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-[#df7400] to-[#f58a00] px-4 text-xs font-semibold text-white shadow-[0_0_18px_-8px_rgba(245,158,11,0.9)] transition hover:brightness-110";

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
    <h2 className="text-[18px] font-bold uppercase tracking-[0.1em] text-[#f58700]">
      {title}
    </h2>
    {action}
  </div>
);

const AccountDashboard = () => {
  const { setUser, logout } = useAuth();
  const { addItemsToCart } = useCart();
  const { toggleFavorite } = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const active =
    Object.entries(ACCOUNT_ROUTES).find(([, route]) => route === pathname)?.[0] ||
    "profile";

  const navigateToSection = useCallback(
    (section) => {
      const destination = ACCOUNT_ROUTES[section];
      if (destination && destination !== pathname) router.push(destination);
    },
    [pathname, router]
  );

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

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(desktopQuery.matches);
    syncDesktop();
    desktopQuery.addEventListener("change", syncDesktop);
    return () => desktopQuery.removeEventListener("change", syncDesktop);
  }, []);

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

  const handleRewardBalanceChanged = useCallback((pointsBalance) => {
    setData((current) =>
      current
        ? {
            ...current,
            user: { ...current.user, pointsBalance },
            stats: { ...current.stats, pointsBalance },
          }
        : current
    );
  }, []);

  const reorder = (order) => {
    const items = order.items
      .filter(
        (item) =>
          !item.isReward &&
          item.menuItem?._id &&
          item.menuItem.isAvailable !== false
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

  const handleLogout = () => {
    logout();
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
  const defaultAddress =
    addresses.find((entry) => entry.isDefault) || addresses[0];
  const defaultPayment =
    paymentMethods.find((method) => method.isDefault) || paymentMethods[0];

  const ordersView = (list, compact = false) => (
    <div
      className={
        compact
          ? "divide-y divide-[#292929] px-[18px]"
          : "divide-y divide-[#292929] px-5"
      }
    >
      {!list.length && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No orders yet.
        </p>
      )}
      {list.map((order) => {
        const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
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
                  · {count} item{count === 1 ? "" : "s"} ·{" "}
                  {formatOrderType(order.orderType)}
                </p>
                <div className="mt-1.5 sm:hidden">
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
              <div className="w-full text-left sm:w-auto sm:min-w-[74px] sm:text-right">
                <p className="text-[13px] font-semibold text-white">
                  {formatPrice(order.totalAmount)}
                </p>
                <div className="mt-1 hidden sm:block">
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal({ type: "order", order })}
                className={`${compactOutline} flex-1 sm:flex-none`}
              >
                <Eye className="h-3.5 w-3.5 sm:hidden" />
                View Details
              </button>
              {SHOW_REORDER_ACTIONS && (
                <button
                  type="button"
                  onClick={() => reorder(order)}
                  className={`${compactAmber} flex-1 sm:flex-none`}
                >
                  Reorder
                </button>
              )}
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

  const desktopOrdersView = (list) => (
    <div className="divide-y divide-[#292929] px-5 pb-1">
      {!list.length && (
        <div className="grid min-h-[280px] place-items-center text-center">
          <div>
            <Package className="mx-auto h-7 w-7 text-neutral-700" />
            <p className="mt-3 text-sm text-neutral-500">No orders yet.</p>
          </div>
        </div>
      )}
      {list.map((order) => {
        const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const image = order.items[0]?.menuItem?.image;

        return (
          <article
            key={order._id}
            className="flex min-h-[91px] items-center gap-3 py-3"
          >
            {image ? (
              <SmartImage
                src={image}
                alt=""
                width={128}
                height={128}
                sizes="64px"
                className="h-16 w-16 shrink-0 rounded-lg border border-white/[0.08] object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black text-neutral-600">
                <Package className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                Order #{order.orderNumber}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {new Date(order.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {count} item{count === 1 ? "" : "s"} ·{" "}
                {formatOrderType(order.orderType)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[13px] font-semibold text-white">
                {formatPrice(order.totalAmount)}
              </p>
              <div className="mt-1.5">
                <OrderStatusBadge status={order.status} />
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setModal({ type: "order", order })}
                className={compactOutline}
              >
                View Details
              </button>
              {SHOW_REORDER_ACTIONS && (
                <button
                  type="button"
                  onClick={() => reorder(order)}
                  className={compactAmber}
                >
                  Reorder
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  const desktopFavoritesView = (list) => (
    <div className="divide-y divide-[#292929] px-5 pb-1">
      {!list.length && (
        <div className="grid min-h-[280px] place-items-center text-center">
          <div>
            <Heart className="mx-auto h-7 w-7 text-neutral-700" />
            <p className="mt-3 text-sm text-neutral-500">
              Your favorite dishes will appear here.
            </p>
          </div>
        </div>
      )}
      {list.map((item) => (
        <article
          key={item._id}
          className="group flex min-h-[91px] items-center gap-4 py-3"
        >
          <SmartImage
            src={item.image}
            alt={item.name}
            width={236}
            height={148}
            sizes="118px"
            className="h-[68px] w-[110px] shrink-0 rounded-lg border border-white/[0.08] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {item.name}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#f58700]">
              {formatPrice(item.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await toggleFavorite(item);
                updateCollection(
                  "favorites",
                  favorites.filter((entry) => entry._id !== item._id)
                );
                notify(`${item.name} was removed from your favorites.`);
              } catch (requestError) {
                notify(
                  requestError.response?.data?.message ||
                    "This favorite could not be updated."
                );
              }
            }}
            aria-label={`Remove ${item.name} from favorites`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#373737] text-white transition hover:border-dune-amber hover:text-dune-amber"
          >
            <Heart className="h-5 w-5" fill="currentColor" />
          </button>
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
                  updateCollection("addresses", await deleteAddress(entry._id));
                }
              }}
              aria-label={`Delete ${entry.label}`}
              className="p-2 text-neutral-500 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href={ACCOUNT_ROUTES.addresses}
            aria-label="Manage saved addresses"
            className="p-1 text-neutral-400 hover:text-white"
          >
            <Ellipsis className="h-5 w-5" />
          </Link>
        )}
      </div>
      {editable && !entry.isDefault && (
        <button
          type="button"
          onClick={async () =>
            updateCollection("addresses", await setDefaultAddress(entry._id))
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
      {(compact ? (defaultAddress ? [defaultAddress] : []) : addresses).map(
        (entry) => addressCard(entry, !compact)
      )}
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
        Decorative demo only. No full card numbers, CVVs, or payment credentials
        are collected.
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
    <Card className="hidden min-h-[272px] lg:block">
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
              Food Lover <span className="mx-1">•</span> Member since{" "}
              {memberYear}
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
            [Award, stats.pointsBalance, "Reward Points", "rewards"],
            [MessageSquareText, stats.reviews, "Reviews", "reviews"],
          ].map(([Icon, value, label, section], index) => (
            <Link
              key={label}
              href={ACCOUNT_ROUTES[section]}
              className={`min-h-[98px] px-3 text-center transition hover:bg-white/[0.025] ${
                index % 2 === 1
                  ? "border-l border-dashed border-[#343434]"
                  : ""
              } ${
                index >= 2
                  ? "border-t border-dashed border-[#343434] sm:border-t-0"
                  : ""
              } ${index === 2 ? "sm:border-l" : ""}`}
            >
              <Icon className="mx-auto h-5 w-5 text-neutral-500" />
              <span className="mt-3 block font-body text-[23px] font-bold leading-none text-[#f58700]">
                {Number(value).toLocaleString()}
              </span>
              <span className="mt-2 block text-[11px] text-neutral-400">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );

  const sidebar = (
    <aside className="hidden self-start lg:sticky lg:top-[98px] lg:block">
      <Card className="min-h-[406px]">
        <p className="px-[18px] pb-4 pt-[18px] text-[12px] font-bold uppercase tracking-[0.13em] text-[#f58700]">
          My Account
        </p>
        <nav className="space-y-0.5 pb-3" aria-label="Account navigation">
          {NAV_ITEMS.map(([id, label, Icon]) => (
            <Link
              key={id}
              href={ACCOUNT_ROUTES[id]}
              aria-current={active === id ? "page" : undefined}
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
            </Link>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-[43px] w-full items-center gap-3 px-[20px] text-left text-[13px] text-neutral-300 transition-colors hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut className="h-[19px] w-[19px] text-neutral-500" />
            Logout
          </button>
        </nav>
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
              <Link
                href={ACCOUNT_ROUTES.orders}
                className="text-[11px] text-neutral-300 hover:text-dune-amber"
              >
                View All Orders
              </Link>
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
              <Link
                href={ACCOUNT_ROUTES.favorites}
                className="text-[11px] text-neutral-400 hover:text-dune-amber"
              >
                View All
              </Link>
            }
          />
          {favoritesView(favorites.slice(0, 3), true)}
        </Card>

        <Card className="min-h-[218px]">
          <CardHeader
            title="Saved Addresses"
            action={
              <Link
                href={ACCOUNT_ROUTES.addresses}
                className="text-[11px] text-neutral-400 hover:text-dune-amber"
              >
                Manage Addresses
              </Link>
            }
          />
          {addressesView(true)}
        </Card>
      </div>
    </>
  );

  const desktopOverview = (
    <div className="space-y-[14px]">
      <div className="grid gap-[14px] xl:grid-cols-[1.22fr_0.88fr]">
        <Card className="min-h-[345px]">
          <CardHeader
            title="Recent Orders"
            border
            action={
              <Link
                href={ACCOUNT_ROUTES.orders}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-300 transition hover:text-dune-amber"
              >
                View All Orders <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {desktopOrdersView(recentOrders.slice(0, 3))}
        </Card>

        <Card className="min-h-[345px]">
          <CardHeader
            title="Favorite Dishes"
            border
            action={
              <Link
                href={ACCOUNT_ROUTES.favorites}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-300 transition hover:text-dune-amber"
              >
                View All <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {desktopFavoritesView(favorites.slice(-3).reverse())}
        </Card>
      </div>

      <DuneRewards
        profileDesktop
        onBalanceChanged={handleRewardBalanceChanged}
        onOpenCart={() => setCartOpen(true)}
        onViewAll={() => navigateToSection("rewards")}
      />
    </div>
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
    rewards: (
      <DuneRewards
        onBalanceChanged={handleRewardBalanceChanged}
        onOpenCart={() => setCartOpen(true)}
      />
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
      <DuneRewards
        compact
        onBalanceChanged={handleRewardBalanceChanged}
        onOpenCart={() => setCartOpen(true)}
      />
      <Card className="min-h-[150px]">
        <CardHeader
          title="Payment Methods"
          action={
            <Link
              href={ACCOUNT_ROUTES.payments}
              className="text-[11px] text-neutral-400 hover:text-dune-amber"
            >
              Manage
            </Link>
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
        accountMenuItems={NAV_ITEMS.map(([id, label, icon]) => ({
          id,
          label,
          icon,
        }))}
        activeAccountItem={active}
        onAccountItemClick={navigateToSection}
        onAccountLogout={handleLogout}
      />

      <main className="mx-auto grid max-w-[1440px] gap-[14px] px-4 pb-12 pt-[92px] sm:px-6 lg:grid-cols-[266px_minmax(0,1fr)] lg:px-8 lg:pt-[98px]">
        {sidebar}

        <div className="min-w-0 space-y-[14px]">
          {profileHeader}
          {active === "profile" ? (
            isDesktop ? (
              desktopOverview
            ) : (
              <div className="space-y-[14px]">{overview}</div>
            )
          ) : (
            sectionContent[active]
          )}
        </div>

        {active === "profile" && !isDesktop && bottomOverview}
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
          showReorder={SHOW_REORDER_ACTIONS}
        />
      )}
    </div>
  );
};

export default AccountDashboard;
