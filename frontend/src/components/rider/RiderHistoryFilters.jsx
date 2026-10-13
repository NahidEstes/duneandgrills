"use client";
import { useState } from "react";
import DarkSelect from "../ui/DarkSelect.jsx";
import DatePicker from "../ui/DarkDatePicker.jsx";
import { CASH_STATES } from "./riderPresentation.js";
import styles from "./rider.module.css";

export const emptyHistoryFilters = () => ({ search: "", datePeriod: "all", cashStatus: "all", from: "", to: "" });
export default function RiderHistoryFilters({ apply, initial }) {
  const [draft, setDraft] = useState(initial || emptyHistoryFilters), [error, setError] = useState("");
  const field = name => event => setDraft(value => ({ ...value, [name]: event.target.value }));
  return <form className={styles.historyFilters} onSubmit={event => {
    event.preventDefault();
    if (draft.datePeriod === "custom" && (!draft.from || !draft.to || draft.from > draft.to)) { setError("Choose a valid From / To date range."); return; }
    setError(""); apply({ ...draft, ...(draft.datePeriod !== "custom" ? { from: "", to: "" } : {}) });
  }}>
    <label>Order number<input maxLength={80} value={draft.search} onChange={field("search")} placeholder="Search order number" /></label>
    <label>Delivered date · Riyadh<DarkSelect value={draft.datePeriod} onChange={field("datePeriod")}><option value="all">All dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="custom">Custom dates</option></DarkSelect></label>
    <label>Cash status<DarkSelect value={draft.cashStatus} onChange={field("cashStatus")}><option value="all">All cash states</option>{Object.entries(CASH_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DarkSelect></label>
    {draft.datePeriod === "custom" && <><label>From<DatePicker value={draft.from} onChange={field("from")} /></label><label>To<DatePicker value={draft.to} onChange={field("to")} /></label></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.linkActions}><button type="submit">Search / Apply</button><button type="button" onClick={() => { const reset = emptyHistoryFilters(); setDraft(reset); setError(""); apply(reset); }}>Reset</button></div>
  </form>;
}
