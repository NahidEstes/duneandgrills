import { CalendarDays, CircleDollarSign, Clock3, ShoppingBag, Star, XCircle } from "lucide-react";
import { formatAdminCurrency, formatAdminDate } from "../adminUi.js";
import { customerCardClass } from "./customerUi.jsx";

const Metric = ({ icon: Icon, label, value, detail }) => (
  <article className={`${customerCardClass} p-4`}>
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber"><Icon className="h-4 w-4" /></span>
      <div><p className="text-[0.65rem] uppercase tracking-[0.12em] text-neutral-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p>{detail && <p className="mt-0.5 text-xs text-neutral-600">{detail}</p>}</div>
    </div>
  </article>
);

export default function CustomerOverview({ overview }) {
  const { customer, analytics } = overview;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShoppingBag} label="Total orders" value={analytics.totalOrders} detail={`${analytics.completedOrders} delivered`} />
        <Metric icon={CircleDollarSign} label="Valid spending" value={formatAdminCurrency(analytics.totalSpent)} detail={`${analytics.validOrders} revenue orders`} />
        <Metric icon={Star} label="Average order value" value={formatAdminCurrency(analytics.averageOrderValue)} />
        <Metric icon={XCircle} label="Cancelled / refunded" value={analytics.cancelledOrRefundedOrders} />
        <Metric icon={CalendarDays} label="Last order" value={analytics.lastOrderAt ? formatAdminDate(analytics.lastOrderAt) : "No orders"} />
        <Metric icon={Clock3} label="Purchase frequency" value={analytics.averageDaysBetweenOrders === null ? "Not enough data" : `${analytics.averageDaysBetweenOrders} days`} detail="Average time between valid orders" />
        <Metric icon={Star} label="Reward balance" value={`${customer.pointsBalance || 0} pts`} />
        <Metric icon={CalendarDays} label="Customer since" value={formatAdminDate(customer.createdAt)} />
      </div>
      <section className={`${customerCardClass} p-5`}>
        <h3 className="text-sm font-semibold text-white">Customer contact</h3>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-neutral-600">Email</dt><dd className="mt-1 break-all text-neutral-300">{customer.email}</dd></div>
          <div><dt className="text-xs text-neutral-600">Phone</dt><dd className="mt-1 text-neutral-300">{customer.phone || "Not provided"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-neutral-600">Address</dt><dd className="mt-1 whitespace-pre-wrap text-neutral-300">{customer.address || "No address saved"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
