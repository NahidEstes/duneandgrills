import { useId, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { inputClass } from "@/src/components/admin/staff/staffUi.jsx";
import { activeAttentionKeys, appliedDeliveryChips, attentionLabels, cashLabels } from "./deliveryManagementView.js";
import { deliverySortLabels, deliveryStatusLabel } from "./deliveryManagementPresentation.js";
import styles from "./deliveryManagement.module.css";

export default function DeliveryFilters({ draft, editDraft, apply, reset, removeFilter, disabled, preview, canManage, riders, applied, loading, matching, ridersHasMore }) {
  const [more, setMore] = useState(false), panelId = useId();
  const [validation, setValidation] = useState("");
  const chips = appliedDeliveryChips(applied, canManage, riders);
  const hasDraft = JSON.stringify({ ...draft, page: 1 }) !== JSON.stringify({ ...applied, page: 1 });
  const active = draft.workspace === "active";
  const sorts = active ? ["newest", "oldest", "oldest_waiting", "assigned_longest", "picked_up_longest"] : ["delivered_newest", "delivered_oldest", "newest", "oldest"];
  return <>
    <form noValidate onSubmit={event => { event.preventDefault(); if (draft.datePeriod === "custom" && (!draft.from || !draft.to)) { setValidation("Choose both dates for a custom range."); setMore(true); return; } setValidation(""); apply({ ...draft, search: draft.search.trim(), page: 1 }); }} className={styles.filters}>
      <div className={styles.toolbar}>
        <label className={styles.search}><span className="sr-only">Search order number</span><Search aria-hidden="true" size={18} /><input className={`${inputClass} pl-10`} placeholder="Search order number…" value={draft.search} onChange={event => editDraft("search", event.target.value)} disabled={disabled} maxLength={80} /></label>
        {canManage && <DarkSelect aria-label="Filter rider" disabled={disabled} value={draft.riderId} onChange={event => editDraft("riderId", event.target.value)}><option value="all">All riders</option><option value="unassigned">No rider assigned</option>{riders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</DarkSelect>}
        <button type="button" className={styles.secondary} disabled={disabled} aria-expanded={more} aria-controls={panelId} onClick={() => setMore(value => !value)}><SlidersHorizontal size={17} aria-hidden="true" />More Filters<ChevronDown size={15} aria-hidden="true" /></button>
        <button type="submit" disabled={disabled} className={styles.primary}>Apply</button>
      </div>
      <div id={panelId} hidden={!more} className={styles.moreFilters}>
        <label>Delivery status<DarkSelect aria-label="Delivery status" disabled={disabled} value={draft.status} onChange={event => editDraft("status", event.target.value)}>{(active ? ["all", "unassigned", "assigned", "picked_up", "issue"] : ["all", "delivered"]).map(state => <option key={state} value={state}>{state === "all" ? "All delivery stages" : deliveryStatusLabel(state)}</option>)}</DarkSelect></label>
        {!preview && <>
          {!active && <label>Cash status<DarkSelect aria-label="Cash status" disabled={disabled} value={draft.cashStatus} onChange={event => editDraft("cashStatus", event.target.value)}><option value="all">All cash states</option>{Object.entries(cashLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="confirmed_today">Confirmed · Today Riyadh</option></DarkSelect></label>}
          <label>Attention condition<DarkSelect aria-label="Attention condition" disabled={disabled} value={draft.attention} onChange={event => editDraft("attention", event.target.value)}><option value="all">All attention states</option>{active && <option value="needs_attention">Needs Attention · Unique active deliveries</option>}{Object.entries(attentionLabels).filter(([key]) => active === activeAttentionKeys.includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</DarkSelect></label>
          <label>Date basis<DarkSelect aria-label="Date basis" disabled={disabled} value={draft.dateBasis} onChange={event => editDraft("dateBasis", event.target.value)}><option value="enrolled">Enrolled date · Riyadh</option><option value="delivered">Delivered date · Riyadh</option></DarkSelect></label>
          <label>Date period<DarkSelect aria-label="Date period" disabled={disabled} value={draft.datePeriod} onChange={event => editDraft("datePeriod", event.target.value)}><option value="all">All time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="custom">Custom date range</option></DarkSelect></label>
          <label>Sort deliveries<DarkSelect aria-label="Sort deliveries" disabled={disabled} value={draft.sort} onChange={event => editDraft("sort", event.target.value)}>{sorts.map(key => <option key={key} value={key}>{deliverySortLabels[key]}</option>)}</DarkSelect></label>
          {draft.datePeriod === "custom" && <><label>From · Riyadh<DarkDatePicker required aria-label="From date" disabled={disabled} value={draft.from} onChange={event => editDraft("from", event.target.value)} className={inputClass} /></label><label>Through · Riyadh<DarkDatePicker required aria-label="Through date" disabled={disabled} value={draft.to} onChange={event => editDraft("to", event.target.value)} className={inputClass} /></label></>}
        </>}
        <p className={styles.filterHelp}>Dates use Asia/Riyadh. Stage sorts show only their named stage; missing clocks sort last.</p>
      </div>
      {ridersHasMore && <p className={styles.filterHelp}>The picker contains the first 100 historical riders plus the assignment directory.</p>}
      <p className={styles.draftNotice} role="status">{loading ? "Loading applied results…" : hasDraft ? "Unsaved filter changes · Choose Apply or press Enter." : `${matching ?? "—"} matching records`}</p>
      {validation && <p role="alert" className={styles.blocked}>{validation}</p>}
    </form>
    {!!chips.length && <div className={styles.chips} role="group" aria-label="Applied delivery filters">{chips.map(chip => <button type="button" key={chip.key} disabled={disabled} onClick={() => removeFilter(chip.key)} aria-label={`Remove filter: ${chip.label}`}>{chip.label}<X size={14} aria-hidden="true" /></button>)}<button type="button" disabled={disabled} onClick={reset} className={styles.clear}>Clear filters</button></div>}
  </>;
}
