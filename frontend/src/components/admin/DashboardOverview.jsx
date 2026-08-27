"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BookOpenText,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Flame,
  PackageCheck,
  RefreshCw,
  Star,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import { useMemo, useState } from "react";
import SmartImage from "../SmartImage.jsx";
import {
  formatAdminCurrency,
  formatAdminDate,
  formatRelativeTime,
  labelStatus,
  statusStyles,
} from "./adminUi.js";

const PANEL_CLASS =
  "overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018] shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)]";

const Panel = ({ title, action, children, className = "" }) => (
  <section className={`${PANEL_CLASS} ${className}`}>
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-white/[0.07] px-4 sm:px-5">
      <h2 className="font-body text-sm font-semibold text-white sm:text-base">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Trend = ({ value, suffix = "vs previous 7 days" }) => {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-1 flex items-center gap-1 text-[0.68rem] ${positive ? "text-emerald-400" : "text-red-400"}`}>
      <Icon className="h-3 w-3" /> {Math.abs(value || 0)}%
      <span className="text-neutral-600">{suffix}</span>
    </p>
  );
};

const StatCard = ({ icon: Icon, label, value, trend, tone = "amber", note }) => {
  const tones = {
    amber: "bg-dune-amber/10 text-dune-amber ring-dune-amber/15",
    green: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/15",
    red: "bg-red-500/10 text-red-400 ring-red-500/15",
    blue: "bg-sky-500/10 text-sky-400 ring-sky-500/15",
  };

  return (
    <article className={`${PANEL_CLASS} flex min-h-[116px] items-start gap-4 p-4 sm:p-5`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-neutral-400 sm:text-sm">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {value}
        </p>
        {trend !== undefined ? <Trend value={trend} /> : note && <p className="mt-1 text-[0.68rem] text-neutral-500">{note}</p>}
      </div>
    </article>
  );
};

const SmallAction = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-dune-amber"
  >
    {children} <ArrowRight className="h-3.5 w-3.5" />
  </button>
);

const EmptyRow = ({ children }) => (
  <div className="px-5 py-10 text-center text-sm text-neutral-500">{children}</div>
);

const DashboardOverview = ({ data, loading, onRefresh, onNavigate }) => {
  const [orderFilter, setOrderFilter] = useState("all");
  const filteredOrders = useMemo(() => {
    const orders = data?.recentOrders || [];
    return orderFilter === "all"
      ? orders
      : orders.filter((order) => order.status === orderFilter);
  }, [data?.recentOrders, orderFilter]);

  if (loading && !data) {
    return (
      <div className="grid min-h-[55vh] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.02]">
        <div className="text-center text-neutral-500">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-dune-amber" />
          Loading live restaurant data…
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={ClipboardList}
          label="Total Orders"
          value={(stats.totalOrders || 0).toLocaleString()}
          trend={stats.trends?.orders}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Revenue"
          value={formatAdminCurrency(stats.totalRevenue)}
          trend={stats.trends?.revenue}
        />
        <StatCard
          icon={PackageCheck}
          label="Completed Orders"
          value={(stats.completedOrders || 0).toLocaleString()}
          trend={stats.trends?.completed}
          tone="green"
        />
        <StatCard
          icon={Clock3}
          label="Pending Orders"
          value={(stats.pendingOrders || 0).toLocaleString()}
          note={`${stats.openOrders || 0} open across the workflow`}
          tone="red"
        />
        <StatCard
          icon={Star}
          label="Customer Reviews"
          value={`${Number(stats.averageRating || 0).toFixed(1)} / 5`}
          note={`${stats.reviewCount || 0} verified reviews`}
          tone="blue"
        />
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[1.18fr_1fr]">
        <Panel
          title="Recent Orders"
          action={<SmallAction onClick={() => onNavigate("orders")}>View All Orders</SmallAction>}
        >
          <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-4 pt-2">
            {["all", "pending", "preparing", "delivered"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setOrderFilter(status)}
                className={`border-b-2 px-3 py-2 text-xs capitalize transition-colors ${
                  orderFilter === status
                    ? "border-dune-amber text-dune-amber"
                    : "border-transparent text-neutral-500 hover:text-white"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            {filteredOrders.length ? (
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className="text-neutral-500">
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 font-medium">Order ID</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">Items</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order._id}
                      onClick={() => onNavigate("orders")}
                      className="cursor-pointer border-b border-white/[0.055] last:border-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3 font-medium text-white">#{order.orderNumber}</td>
                      <td className="px-3 py-3 text-neutral-300">{order.customer?.name || "Guest"}</td>
                      <td className="px-3 py-3 text-neutral-400">{order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}</td>
                      <td className="px-3 py-3 font-medium text-white">{formatAdminCurrency(order.totalAmount)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md border px-2 py-1 text-[0.65rem] ${statusStyles[order.status] || statusStyles.inactive}`}>
                          {labelStatus(order.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500">{formatRelativeTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyRow>No recent orders match this status.</EmptyRow>
            )}
          </div>
        </Panel>

        <Panel
          title="Menu Items Management"
          action={<SmallAction onClick={() => onNavigate("menu")}>View All Menu Items</SmallAction>}
        >
          {data?.recentMenuItems?.length ? (
            <div className="divide-y divide-white/[0.06] px-4">
              {data.recentMenuItems.slice(0, 5).map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => onNavigate("menu")}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 text-left hover:bg-white/[0.02]"
                >
                  <SmartImage
                    src={item.image}
                    alt=""
                    width={96}
                    height={96}
                    sizes="44px"
                    className="h-11 w-11 rounded-lg object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{item.name}</span>
                    <span className="block truncate text-[0.68rem] text-neutral-500">{item.category} · {formatAdminCurrency(item.price)}</span>
                  </span>
                  <span className={`rounded-md px-2 py-1 text-[0.65rem] ${item.isAvailable ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {item.isAvailable ? "Available" : "Hidden"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyRow>No menu items found.</EmptyRow>
          )}
          <button
            type="button"
            onClick={() => onNavigate("menu")}
            className="flex min-h-11 w-full items-center justify-end gap-1 border-t border-white/[0.07] px-4 text-xs font-medium text-dune-amber hover:bg-dune-amber/[0.04]"
          >
            Manage pricing &amp; availability <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </Panel>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel
          title="Blog / Content Control"
          action={<SmallAction onClick={() => onNavigate("blog")}>View All Posts</SmallAction>}
        >
          {data?.recentPosts?.length ? (
            <div className="divide-y divide-white/[0.06] px-4">
              {data.recentPosts.slice(0, 3).map((post) => (
                <button key={post._id} type="button" onClick={() => onNavigate("blog")} className="flex w-full items-center gap-3 py-3 text-left">
                  <SmartImage src={post.coverImage} alt="" width={96} height={72} sizes="52px" className="h-10 w-14 rounded-md object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">{post.title}</span>
                    <span className="mt-0.5 block text-[0.65rem] text-neutral-500">{formatAdminDate(post.updatedAt)} · {post.author}</span>
                  </span>
                  <span className={`rounded px-2 py-1 text-[0.62rem] ${post.isPublished ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {post.isPublished ? "Published" : "Draft"}
                  </span>
                </button>
              ))}
            </div>
          ) : <EmptyRow>No blog posts found.</EmptyRow>}
        </Panel>

        <Panel
          title="Offers & Promotions"
          action={<SmallAction onClick={() => onNavigate("offers")}>View All Offers</SmallAction>}
        >
          {data?.recentOffers?.length ? (
            <div className="divide-y divide-white/[0.06] px-4">
              {data.recentOffers.slice(0, 3).map((offer) => (
                <button key={offer._id} type="button" onClick={() => onNavigate("offers")} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dune-amber/10 text-dune-amber"><Tag className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">{offer.title}</span>
                    <span className="mt-0.5 block text-[0.65rem] text-neutral-500">Ends {formatAdminDate(offer.expiresAt)}</span>
                  </span>
                  <span className={`rounded border px-2 py-1 text-[0.62rem] ${statusStyles[offer.dashboardStatus] || statusStyles.inactive}`}>
                    {labelStatus(offer.dashboardStatus)}
                  </span>
                </button>
              ))}
            </div>
          ) : <EmptyRow>No offers found.</EmptyRow>}
        </Panel>

        <Panel
          title="Recent Activity"
          action={
            <button type="button" onClick={onRefresh} disabled={loading} className="text-neutral-500 hover:text-dune-amber disabled:opacity-40" aria-label="Refresh dashboard">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          }
          className="lg:col-span-2 2xl:col-span-1"
        >
          {data?.activities?.length ? (
            <div className="divide-y divide-white/[0.06] px-4">
              {data.activities.slice(0, 5).map((activity) => {
                const ActivityIcon = activity.type === "order" ? CheckCircle2 : activity.type === "menu" ? UtensilsCrossed : activity.type === "blog" ? BookOpenText : BadgeDollarSign;
                return (
                  <button key={activity.id} type="button" onClick={() => onNavigate(activity.tab)} className="flex w-full items-start gap-3 py-2.5 text-left">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-dune-amber"><ActivityIcon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-white">{activity.title}</span>
                      <span className="mt-0.5 block truncate text-[0.65rem] text-neutral-500">{activity.description}</span>
                    </span>
                    <span className="shrink-0 text-[0.62rem] text-neutral-600">{formatRelativeTime(activity.at)}</span>
                  </button>
                );
              })}
            </div>
          ) : <EmptyRow>No recent activity.</EmptyRow>}
        </Panel>
      </div>

      <div className="flex items-center justify-center gap-2 py-2 text-xs text-neutral-600">
        <Flame className="h-4 w-4 text-dune-amber" /> Live from MongoDB · refreshed {data?.generatedAt ? formatRelativeTime(data.generatedAt) : "now"}
      </div>
    </div>
  );
};

export default DashboardOverview;
