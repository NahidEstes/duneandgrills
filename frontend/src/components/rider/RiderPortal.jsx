"use client";
import { useState } from "react";
import { Box, CircleCheck, ClipboardList, Flame, Info, LogOut, RefreshCw } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import useRiderPortal from "@/src/hooks/useRiderPortal.js";
import RiderDeliveryCard from "./RiderDeliveryCard.jsx";
import { filterDeliveries, RIDER_FILTERS } from "./riderPresentation.js";
import styles from "./rider.module.css";
import RiderNav from "./RiderNav.jsx";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import { updateRiderAvailability } from "@/src/api/deliveryApi.js";

function PortalContent({ section, preview, rehearsal }) {
  const { user, logout } = useAuth();
  const [available, setAvailable] = useState(false);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { data, loading, error, denied, updatedAt, refresh } = useRiderPortal(user, preview, rehearsal, filter, section === "history", page);
  const mutation = useDeliverySubmission();
  const operational = data?.mode === "operational";
  const writable = !preview && (operational || (rehearsal && data?.mode === "rehearsal"));
  const shownAvailability = writable ? data?.availability === true : available;
  const isPreview = data?.mode === "preview";
  return <div className={styles.portal}>
    <main className={styles.main}>
      <header className={styles.brand}><Flame aria-hidden="true" /><div><strong>DUNE &amp; GRILLS</strong><p>RIDER PORTAL</p></div></header>
      <div className={styles.greeting}><h1>Hello, {user?.name || "Rider"}</h1>
        <button type="button" role="switch" aria-checked={(isPreview || writable) && shownAvailability} disabled={(!isPreview && !writable) || !data || mutation.pending}
          onClick={() => writable ? mutation.submit("availability", { available: !shownAvailability, expectedRevision: data.availabilityRevision }, updateRiderAvailability, refresh) : setAvailable(value => !value)} className={`${styles.availability} ${shownAvailability && (isPreview || writable) ? styles.available : ""}`}>
          <span className={styles.dot} />{isPreview || writable ? shownAvailability ? "Available" : "Unavailable" : "Availability disabled"}<span className={styles.toggle} /></button>
      </div>
      <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{isPreview ? "PREVIEW MODE • SYNTHETIC DATA" : operational ? "RESTAURANT DELIVERY" : rehearsal ? "ISOLATED LOCAL REHEARSAL" : "DELIVERY RIDER DISABLED"}</strong><p>{operational ? "Only your assigned restaurant deliveries. Availability never auto-assigns orders." : isPreview ? "Live delivery disabled in preview. Availability is local preview state only." : rehearsal ? "Live delivery disabled. Only disposable local test records." : "An administrator can enable delivery riders in Restaurant Settings."}</p></div></div>
      {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
      <div className={styles.heading}><h2>{section === "deliveries" ? "My Deliveries" : section === "history" ? "Delivery History" : "My Profile"}</h2><p>{section === "deliveries" ? "Only orders assigned to you" : section === "history" ? "Private delivery history — no customer contact details" : "Your existing staff account"}</p></div>
      {loading && <div className={styles.empty} role="status">Loading private rider workspace…</div>}
      {error && <div className={styles.empty} role="alert"><h3>Workspace unavailable</h3><p>{error}</p>
        {!denied && <button type="button" className={styles.action} onClick={refresh}>Retry</button>}
        {denied && <a className={styles.action} href={preview ? "/rider" : "/login?returnTo=%2Frider"}>{preview ? "Return to private dashboard" : "Sign in again"}</a>}</div>}
      {data && section === "deliveries" && <>
        <div className={styles.stats}>
          <div className={styles.stat}><span className={styles.icon}><Box /></span><div><strong>{data.counts.active ?? "—"}</strong><p>Active{isPreview ? " • preview" : operational ? "" : rehearsal ? " • rehearsal" : " • unavailable"}</p></div></div>
          <div className={styles.stat}><span className={styles.icon}><CircleCheck /></span><div><strong>{data.counts.deliveredToday ?? "—"}</strong><p>Delivered Today{isPreview ? " • preview" : operational ? "" : rehearsal ? " • rehearsal" : " • unavailable"}</p></div></div>
        </div>
        <div className={styles.filters} role="group" aria-label="Delivery status filter">
          {RIDER_FILTERS.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => { setFilter(option.value); setPage(1); }}>
            {option.label} ({writable ? option.value === "all" ? data.counts.active : data.counts[option.value] : isPreview ? filterDeliveries(data.deliveries, option.value).length : "—"})</button>)}
        </div>
        <div className={styles.cards}>{filterDeliveries(data.deliveries, filter).map(row => <RiderDeliveryCard key={row.id} delivery={row} preview={preview} rehearsal={rehearsal} />)}</div>
        {!filterDeliveries(data.deliveries, filter).length && <div className={styles.empty}><Box /><h3>{isPreview ? "No matching preview deliveries" : writable ? "No matching deliveries" : "Live delivery is not enabled"}</h3><p>{isPreview ? "Try All or Assigned. These are synthetic examples, not real activity." : writable ? "No orders match this filter/page. Only deliveries explicitly assigned to you appear here." : "Operational delivery remains disabled. No real delivery records have been queried."}</p>
          {!preview && data.previewAvailable && <a className={styles.action} href="/rider?preview=1">Open isolated demo preview</a>}{!rehearsal && user?.role === "rider" && data.workflowAvailable && <a className={styles.action} href="/rider?rehearsal=1">Open isolated workflow rehearsal</a>}</div>}
      </>}
      {data && section === "history" && (writable && data.deliveries.length ? <div className={styles.cards}>{data.deliveries.map(row => <RiderDeliveryCard key={row.id} delivery={row} rehearsal={rehearsal} />)}</div> : <div className={styles.empty}><ClipboardList /><h3>No delivery history available</h3><p>No completed deliveries or earnings have been invented.</p></div>)}
      {writable && data?.pagination && section !== "profile" && <div className={styles.pagination} aria-label="Delivery pagination"><span>{data.pagination.total} matching records · page {page}</span><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" disabled={page * 20 >= data.pagination.total} onClick={() => setPage(value => value + 1)}>Next</button></div>}
      {data && section === "profile" && <section className={styles.card} aria-label="Rider profile"><dl className={styles.profile}>
        {[['Name', data.profile.name], ['Staff ID', data.profile.employeeId], ['Role', data.profile.role], ['Email', data.profile.email], ['Phone', data.profile.phone]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not set"}</dd></div>)}
        </dl><p>Rider access is managed by an administrator. No public rider registration.</p><button type="button" className={styles.action} onClick={logout}><LogOut size={18} />Sign out</button></section>}
      {updatedAt && <div className={styles.updated}><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh rider workspace"><RefreshCw size={18} /></button><time dateTime={updatedAt.toISOString()}>Workspace loaded {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(updatedAt)} • Riyadh</time></div>}
    </main>
    <RiderNav section={section} preview={preview} rehearsal={rehearsal} />
  </div>;
}

export default function RiderPortal(props) {
  const mode = { ...props, rehearsal: props.rehearsal && !props.preview };
  return <ProtectedRoute roles={mode.rehearsal ? ["rider"] : ["admin", "rider"]}><PortalContent key={`${mode.section}-${mode.preview}-${mode.rehearsal}`} {...mode} /></ProtectedRoute>;
}
