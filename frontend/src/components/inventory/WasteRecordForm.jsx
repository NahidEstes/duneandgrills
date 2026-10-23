"use client";
import ReviewedStockForm from "./ReviewedStockForm.jsx";
export default function WasteRecordForm({ initialItem = "", onSaved }) {
  return <ReviewedStockForm kind="waste" initialType="WASTE" initialItem={initialItem} onSaved={onSaved}/>;
}
