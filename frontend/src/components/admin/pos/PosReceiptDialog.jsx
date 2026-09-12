"use client";

import { Printer, X } from "lucide-react";
import { formatAdminCurrency } from "../adminUi.js";
import { printPosReceipt } from "../../../utils/adminExports.js";

export default function PosReceiptDialog({ sale, onClose, settings }) {
  if (!sale) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121719] p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><p className="text-[0.65rem] uppercase tracking-[0.2em] text-dune-amber">Sale completed</p><h2 className="mt-1 text-xl font-semibold text-white">Receipt #{sale.orderNumber}</h2></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 space-y-3 border-y border-dashed border-white/15 py-4">{sale.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between gap-4 text-sm"><span className="text-neutral-300">{item.name} ×{item.quantity}</span><span className="text-white">{formatAdminCurrency(item.price * item.quantity)}</span></div>)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-neutral-400"><span>Subtotal</span><span>{formatAdminCurrency(sale.subtotal)}</span></div>
          {Number(sale.discountAmount) > 0 && <div className="flex justify-between text-emerald-400"><span>Discount</span><span>-{formatAdminCurrency(sale.discountAmount)}</span></div>}
          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold"><span className="text-white">Total</span><span className="text-dune-amber">{formatAdminCurrency(sale.totalAmount)}</span></div>
          {sale.paymentMethod === "cash" && <><div className="flex justify-between text-neutral-400"><span>Cash received</span><span>{formatAdminCurrency(sale.cashReceived)}</span></div><div className="flex justify-between text-emerald-400"><span>Change</span><span>{formatAdminCurrency(sale.changeDue)}</span></div></>}
        </div>
        <button type="button" onClick={() => printPosReceipt(sale, settings)} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber font-semibold text-black"><Printer className="h-4 w-4" />Print Receipt</button>
      </div>
    </div>
  );
}
