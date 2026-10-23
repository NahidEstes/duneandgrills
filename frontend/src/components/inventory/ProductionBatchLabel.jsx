"use client";
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import { Button } from "./InventoryUI.jsx";
import { productionLabelHtml } from "@/src/utils/productionLabel.js";

export default function ProductionBatchLabel({ record, disabled }) {
  const [open, setOpen] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const frame = useRef(null);
  if (record.status !== "completed") return null;
  const print = () => {
    try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); }
    catch { setError("Printing is unavailable. Check browser print permissions and try again."); }
  };
  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => { setReady(false); setError(""); setOpen(true); }}><Printer size={16}/>Print label</Button>
    <DeliveryDialog open={open} onClose={() => setOpen(false)} title="Batch label preview">
      <p className="text-sm text-neutral-300">80 × 80 mm container label. Choose the matching paper size and 100% scale in your print dialog.</p>
      <iframe ref={frame} title="Production batch label" sandbox="allow-same-origin allow-modals" srcDoc={open ? productionLabelHtml(record) : ""} onLoad={() => setReady(true)} className="h-[340px] w-full rounded-lg border border-white/20 bg-white"/>
      <Button disabled={!ready || disabled} onClick={print}><Printer size={16}/>Print batch label</Button>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    </DeliveryDialog>
  </>;
}
