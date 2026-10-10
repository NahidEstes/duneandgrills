"use client";

import {
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  LockKeyhole,
  Minus,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import SmartImage from "../../SmartImage.jsx";
import DarkSelect from "../../ui/DarkSelect.jsx";
import { formatAdminCurrency } from "../adminUi.js";
import PosCustomerOptions from "./PosCustomerOptions.jsx";

const Choice = ({ active, onClick, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-dune-amber ${active ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 bg-white/[0.025] text-neutral-400 hover:text-white"}`}
  >
    <Icon className="h-4 w-4" />
    {children}
  </button>
);

export default function PosSalePanel({
  bill,
  sale,
  itemCount,
  onQuantity,
  onRemove,
  onClear,
  onHold,
  notes,
  onNotesChange,
  discount,
  onDiscountChange,
  approvalRequired,
  approval,
  onRequestApproval,
  policy,
  orderType,
  onOrderTypeChange,
  paymentMethod,
  onPaymentMethodChange,
  cashReceived,
  onCashReceivedChange,
  customerSearch,
  onCustomerSearchChange,
  customerResults,
  customerSearchStatus,
  selectedCustomer,
  onSelectCustomer,
  onClearCustomer,
  walkIn,
  onWalkInChange,
  onComplete,
  submitting,
  channelEnabled = true,
  checkoutOptions, onCheckoutOptionsChange, onCouponPreview, items,
}) {
  const { subtotal, total } = bill;
  const change =
    paymentMethod === "cash"
      ? Math.max(0, (Number(cashReceived) || 0) - total)
      : 0;
  const cashValid = paymentMethod !== "cash" || Number(cashReceived) >= total;
  const setDiscount = (values) => onDiscountChange({ ...discount, ...values });
  return (
    <aside className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#121719] to-[#0b0e10] shadow-2xl shadow-black/30 xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100vh-6rem)] xl:flex-col">
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
            Current Sale
          </h2>
          <p className="mt-1 text-xs text-dune-amber">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!sale.length}
            onClick={onHold}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dune-amber/25 px-3 text-xs text-dune-amber hover:bg-dune-amber/10 disabled:opacity-40"
          >
            <Clock3 className="h-3.5 w-3.5" />
            Hold
          </button>
          <button
            type="button"
            disabled={!sale.length}
            onClick={onClear}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-500/20 px-3 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-64 divide-y divide-white/[0.06] overflow-y-auto px-4">
        {sale.map((line, index) => (
          <div key={line.cartLineId} className="flex items-start gap-2 py-3">
            <SmartImage
              src={line.image}
              alt=""
              width={56}
              height={56}
              sizes="40px"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">
                {line.name}
              </p>
              <p className="mt-0.5 text-[0.65rem] text-neutral-500">
                {formatAdminCurrency(line.price)} each
              </p>
              {(line.customization?.selectedAddOns?.length > 0 ||
                line.customization?.spiceLevel ||
                line.customization?.note) && (
                <div className="mt-1 text-[0.62rem] leading-4 text-neutral-500">
                  {line.customization.selectedAddOns?.map((entry) => (
                    <p key={entry.addOn}>
                      + {entry.name}
                      {entry.quantity > 1 ? ` ×${entry.quantity}` : ""}
                    </p>
                  ))}
                  {line.customization.spiceLevel && (
                    <p>
                      Spice:{" "}
                      {line.customization.spiceLevel.replaceAll("-", " ")}
                    </p>
                  )}
                  {line.customization.note && (
                    <p>Note: {line.customization.note}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center rounded-lg border border-white/10">
              <button
                aria-label={`Decrease ${line.name}`}
                type="button"
                onClick={() => onQuantity(line, -1)}
                className="grid h-10 w-9 place-items-center text-neutral-400 hover:text-white"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-6 text-center text-xs text-white">
                {line.quantity}
              </span>
              <button
                aria-label={`Increase ${line.name}`}
                type="button"
                onClick={() => onQuantity(line, 1)}
                className="grid h-10 w-9 place-items-center text-neutral-400 hover:text-white"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <p className="w-16 pt-3 text-right text-xs font-medium text-white">
              {formatAdminCurrency(bill.items[index].lineTotal)}
            </p>
            <button
              type="button"
              onClick={() => onRemove(line)}
              className="grid h-10 w-8 place-items-center text-red-400"
              aria-label={`Remove ${line.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!sale.length && (
          <p className="py-10 text-center text-xs text-neutral-600">
            Add a menu item to start a sale.
          </p>
        )}
      </div>
      <div className="space-y-3 overflow-y-auto p-4 xl:flex-1">
        <PosCustomerOptions selectedCustomer={selectedCustomer} onSelectCustomer={onSelectCustomer} options={checkoutOptions} onChange={onCheckoutOptionsChange} items={items} onCouponPreview={onCouponPreview} />
        <div className="relative">
          <UserRound className="absolute left-3 top-3.5 h-4 w-4 text-neutral-600" />
          {selectedCustomer ? (
            <div className="flex h-12 items-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] pl-10 pr-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-emerald-300">
                {selectedCustomer.name} ·{" "}
                {selectedCustomer.phone || selectedCustomer.customerNumber}
              </span>
              <button
                type="button"
                onClick={onClearCustomer}
                className="grid h-10 w-10 place-items-center text-neutral-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <input
              aria-label="Search registered customer"
              maxLength={80}
              value={customerSearch}
              onChange={(event) => onCustomerSearchChange(event.target.value)}
              placeholder="Optional customer search…"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/25 pl-10 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
            />
          )}
          {!selectedCustomer && customerSearchStatus !== "idle" && customerSearchStatus !== "success" && <p role={customerSearchStatus === "error" ? "alert" : "status"} className={`mt-2 text-xs ${customerSearchStatus === "error" ? "text-red-300" : "text-neutral-400"}`}>{customerSearchStatus === "loading" ? "Searching customers…" : customerSearchStatus === "error" ? "Customer search unavailable. Please retry or continue as a walk-in." : "No customers found."}</p>}
          {!selectedCustomer && customerResults.length > 0 && (
            <div
              className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#15191b] p-1 shadow-xl"
              role="listbox"
            >
              {customerResults.map((customer) => (
                <button
                  key={customer._id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => onSelectCustomer(customer)}
                  className="block min-h-12 w-full rounded-lg px-3 py-2 text-left hover:bg-white/5 focus:bg-white/5"
                >
                  <span className="block text-xs font-medium text-white">
                    {customer.name}
                  </span>
                  <span className="text-[0.65rem] text-neutral-500">
                    {customer.phone || customer.customerNumber}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
            Order Type
          </p>
          <div className="flex gap-2">
            <Choice active={orderType === "delivery"} onClick={() => onOrderTypeChange("delivery")} icon={CheckCircle2}>Delivery</Choice>
            <Choice
              active={orderType === "dine-in"}
              onClick={() => onOrderTypeChange("dine-in")}
              icon={CheckCircle2}
            >
              Dine-in
            </Choice>
            <Choice
              active={orderType === "takeaway"}
              onClick={() => onOrderTypeChange("takeaway")}
              icon={CheckCircle2}
            >
              Takeaway
            </Choice>
          </div>
        </div>
        {(orderType !== "dine-in" || checkoutOptions?.orderOrigin === "phone") && (
          <div className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="text-xs text-neutral-500">
              Pickup name{policy.takeawayNameRequired && " *"}
              <input
                disabled={Boolean(selectedCustomer)}
                value={walkIn.name}
                maxLength={100}
                onChange={(event) =>
                  onWalkInChange({ ...walkIn, name: event.target.value })
                }
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-neutral-500">
              Phone{policy.takeawayPhoneRequired && " *"}
              <input
                disabled={Boolean(selectedCustomer)}
                type="tel"
                value={walkIn.phone}
                maxLength={30}
                onChange={(event) =>
                  onWalkInChange({ ...walkIn, phone: event.target.value })
                }
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none disabled:opacity-60"
              />
            </label>
            <label className="text-xs text-neutral-500 sm:col-span-2 xl:col-span-1">
              {orderType === "delivery" && <input aria-label="Delivery address" value={walkIn.address || ""} maxLength={500} onChange={event => onWalkInChange({ ...walkIn, address: event.target.value })} placeholder="Required delivery address" className="mb-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white" />}
              Pickup note
              <input
                value={walkIn.pickupNote}
                maxLength={240}
                onChange={(event) =>
                  onWalkInChange({ ...walkIn, pickupNote: event.target.value })
                }
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
              />
            </label>
          </div>
        )}
        <textarea
          aria-label="Order note"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          maxLength={500}
          placeholder="Order note (optional)"
          className="min-h-16 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60"
        />
        <div className="space-y-2 border-y border-white/10 py-3 text-sm">
          <div className="flex justify-between text-neutral-400">
            <span>Subtotal</span>
            <span>{formatAdminCurrency(subtotal)}</span>
          </div>
          {bill.deliveryFee > 0 && <div className="flex justify-between text-neutral-400"><span>Delivery</span><span>{formatAdminCurrency(bill.deliveryFee)}</span></div>}
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <DarkSelect
              aria-label="Discount type"
              value={discount.type}
              onChange={(event) => setDiscount({ type: event.target.value })}
              className="h-10 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white"
            >
              <option value="fixed">SAR</option>
              <option value="percentage">%</option>
            </DarkSelect>
            <input
              aria-label="Discount value"
              type="number"
              min="0"
              max={discount.type === "percentage" ? 100 : subtotal}
              step="0.01"
              value={discount.value}
              disabled={policy.discountsEnabled === false}
              onChange={(event) => setDiscount({ value: event.target.value })}
              className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-right text-sm text-white outline-none focus:border-dune-amber/60 disabled:opacity-40"
            />
          </div>
          {Number(discount.value) > 0 && (
            <input
              aria-label="Discount reason"
              value={discount.reason}
              maxLength={160}
              onChange={(event) => setDiscount({ reason: event.target.value })}
              placeholder="Discount reason (required)"
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-neutral-600"
            />
          )}
          {approvalRequired && !approval && (
            <button
              type="button"
              onClick={onRequestApproval}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs font-semibold text-amber-300"
            >
              <LockKeyhole className="h-4 w-4" />
              Manager approval required
            </button>
          )}
          {approval && (
            <p
              role="status"
              className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
            >
              Approved by {approval.approver.name}
            </p>
          )}
          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold">
            <span className="text-white">Total</span>
            <span className="text-dune-amber">
              {formatAdminCurrency(total)}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
            Payment Method
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Choice
              active={paymentMethod === "cash"}
              onClick={() => onPaymentMethodChange("cash")}
              icon={Banknote}
            >
              Cash
            </Choice>
            <Choice
              active={paymentMethod === "card"}
              onClick={() => onPaymentMethodChange("card")}
              icon={CreditCard}
            >
              Card
            </Choice>
            <Choice
              active={paymentMethod === "other"}
              onClick={() => onPaymentMethodChange("other")}
              icon={CreditCard}
            >
              Other
            </Choice>
          </div>
        </div>
        {paymentMethod === "cash" && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-neutral-500">
                Received amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashReceived}
                  onChange={(event) => onCashReceivedChange(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-white outline-none focus:border-dune-amber/60"
                />
              </label>
              <div className="text-xs text-neutral-500">
                Change
                <p
                  className={`mt-3 text-base font-semibold ${cashValid ? "text-emerald-400" : "text-red-400"}`}
                >
                  {formatAdminCurrency(change)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {[
                ["Exact", total],
                ["20", 20],
                ["50", 50],
                ["100", 100],
                ["200", 200],
              ].map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    onCashReceivedChange(String(Number(value).toFixed(2)))
                  }
                  className="min-h-11 rounded-lg border border-white/10 text-xs text-neutral-300 hover:border-dune-amber/50 hover:text-dune-amber"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 border-t border-white/10 bg-[#0d1113]/95 p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-neutral-400">{itemCount} items</span>
          <span className="text-xl font-bold text-dune-amber">
            {formatAdminCurrency(total)}
          </span>
        </div>
        {!channelEnabled && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            POS ordering is currently disabled in Restaurant Settings.
          </p>
        )}
        <button
          type="button"
          onClick={onComplete}
          disabled={submitting || !sale.length || !cashValid || !channelEnabled}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-dune-amberDeep to-dune-amber text-base font-semibold text-black shadow-amberGlow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <CheckCircle2 className="h-5 w-5" />
          {submitting ? "Completing…" : "Complete Sale"}
        </button>
      </div>
    </aside>
  );
}
