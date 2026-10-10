"use client";

import { Printer, X } from "lucide-react";
import { formatAdminCurrency } from "../adminUi.js";
import { printPosReceipt } from "../../../utils/adminExports.js";
import usePosDialog from "@/src/hooks/usePosDialog.js";

export default function PosReceiptDialog({ sale, onClose, settings }) {
  const dialog = usePosDialog(Boolean(sale), onClose);
  if (!sale) return null;
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="POS receipt" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#121719] p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><p className="text-[0.65rem] uppercase tracking-[0.2em] text-dune-amber">{sale.isReprint ? "REPRINT / DUPLICATE" : "Sale receipt"}</p><h2 className="mt-1 text-xl font-semibold text-white">Receipt #{sale.orderNumber}</h2><p className="mt-1 text-xs capitalize text-neutral-400">{sale.status} · {sale.paymentStatus?.replaceAll("_", " ")}</p>{Number(sale.refundedAmount) > 0 && <p className="mt-1 text-xs text-red-400">Refunded {formatAdminCurrency(sale.refundedAmount)}</p>}</div>
          <button type="button" aria-label="Close receipt" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {(sale.pickupToken || sale.orderType === "takeaway") && <div className="mt-4 rounded-xl border border-dune-amber/25 bg-dune-amber/[0.06] p-3 text-sm"><p className="font-semibold text-dune-amber">Takeaway {sale.pickupToken ? `· ${sale.pickupToken}` : ""}</p><p className="mt-1 text-neutral-300">{sale.customer?.name}</p>{sale.pickupNote && <p className="mt-1 text-neutral-500">{sale.pickupNote}</p>}</div>}
        <div className="mt-5 space-y-3 border-y border-dashed border-white/15 py-4">{sale.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between gap-4 text-sm"><span className="min-w-0 text-neutral-300">{item.name} ×{item.quantity}{(item.selectedAddOns?.length > 0 || item.spiceLevel || item.itemNote) && <span className="mt-1 block text-xs text-neutral-500">{item.selectedAddOns?.map((entry) => `${entry.name}${entry.quantity > 1 ? ` ×${entry.quantity}` : ""}`).join(", ")}{item.spiceLevel ? `${item.selectedAddOns?.length ? " · " : ""}${item.spiceLevel.replaceAll("-", " ")}` : ""}{item.itemNote ? ` · Note: ${item.itemNote}` : ""}</span>}</span><span className="shrink-0 text-white">{formatAdminCurrency(item.price * item.quantity)}</span></div>)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-neutral-400"><span>Subtotal</span><span>{formatAdminCurrency(sale.subtotal)}</span></div>
          {Number(sale.discountAmount) > 0 && <div className="flex justify-between text-emerald-400"><span>Discount</span><span>-{formatAdminCurrency(sale.discountAmount)}</span></div>}
          {Number(sale.deliveryFee) > 0 && <div className="flex justify-between text-neutral-400"><span>Delivery fee</span><span>{formatAdminCurrency(sale.deliveryFee)}</span></div>}
          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold"><span className="text-white">Total</span><span className="text-dune-amber">{formatAdminCurrency(sale.totalAmount)}</span></div>
          {sale.paymentMethod === "cash" && <><div className="flex justify-between text-neutral-400"><span>Cash received</span><span>{formatAdminCurrency(sale.cashReceived)}</span></div><div className="flex justify-between text-emerald-400"><span>Change</span><span>{formatAdminCurrency(sale.changeDue)}</span></div></>}
        </div>
        <button type="button" onClick={() => printPosReceipt(sale, settings)} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black"><Printer className="h-4 w-4" />Print Receipt</button>
      </div>
    </div>
  );
}
