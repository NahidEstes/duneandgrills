"use client";
import { useState } from "react";
import { Box, CircleCheck, ClipboardList, Flame, Info, LogOut, RefreshCw, Bike, UserRound } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import useRiderPortal from "@/src/hooks/useRiderPortal.js";
import RiderDeliveryCard from "./RiderDeliveryCard.jsx";
import { filterDeliveries, RIDER_FILTERS } from "./riderPresentation.js";
import styles from "./rider.module.css";

const sections = [{ id: "deliveries", label: "Deliveries", href: "/rider", Icon: Bike },
  { id: "history", label: "History", href: "/rider/history", Icon: ClipboardList },
  { id: "profile", label: "Profile", href: "/rider/profile", Icon: UserRound }];

function PortalContent({ section, preview }) {
  const { user, logout } = useAuth();
  const { data, loading, error, denied, updatedAt, refresh } = useRiderPortal(user, preview);
  const [available, setAvailable] = useState(false);
  const [filter, setFilter] = useState("all");
  const isPreview = data?.mode === "preview";
  return <div className={styles.portal}>
    <main className={styles.main}>
      <header className={styles.brand}><Flame aria-hidden="true" /><div><strong>DUNE &amp; GRILLS</strong><p>RIDER PORTAL</p></div></header>
      <div className={styles.greeting}><h1>Hello, {user?.name || "Rider"}</h1>
        <button type="button" role="switch" aria-checked={isPreview && available} disabled={!isPreview}
          onClick={() => setAvailable(value => !value)} className={`${styles.availability} ${available && isPreview ? styles.available : ""}`}>
          <span className={styles.dot} />{isPreview ? available ? "Available" : "Unavailable" : "Availability disabled"}<span className={styles.toggle} /></button>
      </div>
      <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{isPreview ? "PREVIEW MODE • SYNTHETIC DATA" : "PRIVATE PREVIEW WORKSPACE"}</strong><p>Live delivery disabled. {isPreview ? "Availability is local preview state only; no automatic assignment." : "No dispatch or live order data is available in Phase 1."}</p></div></div>
      <div className={styles.heading}><h2>{section === "deliveries" ? "My Deliveries" : section === "history" ? "Delivery History" : "My Profile"}</h2><p>{section === "deliveries" ? "Only orders assigned to you" : section === "history" ? "Private delivery history — no customer contact details" : "Your existing staff account"}</p></div>
      {loading && <div className={styles.empty} role="status">Loading private rider workspace…</div>}
      {error && <div className={styles.empty} role="alert"><h3>Workspace unavailable</h3><p>{error}</p>
        {!denied && <button type="button" className={styles.action} onClick={refresh}>Retry</button>}
        {denied && <a className={styles.action} href={preview ? "/rider" : "/login?returnTo=%2Frider"}>{preview ? "Return to private dashboard" : "Sign in again"}</a>}</div>}
      {data && section === "deliveries" && <>
        <div className={styles.stats}>
          <div className={styles.stat}><span className={styles.icon}><Box /></span><div><strong>{data.counts.active ?? "—"}</strong><p>Active{isPreview ? " • preview" : " • unavailable"}</p></div></div>
          <div className={styles.stat}><span className={styles.icon}><CircleCheck /></span><div><strong>{data.counts.deliveredToday ?? "—"}</strong><p>Delivered Today{isPreview ? " • preview" : " • unavailable"}</p></div></div>
        </div>
        <div className={styles.filters} role="group" aria-label="Delivery status filter">
          {RIDER_FILTERS.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
            {option.label} ({isPreview ? filterDeliveries(data.deliveries, option.value).length : "—"})</button>)}
        </div>
        <div className={styles.cards}>{filterDeliveries(data.deliveries, filter).map(row => <RiderDeliveryCard key={row.id} delivery={row} />)}</div>
        {!filterDeliveries(data.deliveries, filter).length && <div className={styles.empty}><Box /><h3>{isPreview ? "No matching preview deliveries" : "Live delivery is not enabled"}</h3><p>{isPreview ? "Try All or Assigned. These are synthetic examples, not real activity." : "Assignments and delivery actions will be introduced in Phase 2. No real delivery records have been queried."}</p>
          {!preview && data.previewAvailable && <a className={styles.action} href="/rider?preview=1">Open isolated demo preview</a>}</div>}
      </>}
      {data && section === "history" && <div className={styles.empty}><ClipboardList /><h3>No delivery history available</h3><p>Phase 1 does not query real delivery history or invent completed deliveries or earnings.</p></div>}
      {data && section === "profile" && <section className={styles.card} aria-label="Rider profile"><dl className={styles.profile}>
        {[['Name', data.profile.name], ['Staff ID', data.profile.employeeId], ['Role', data.profile.role], ['Email', data.profile.email], ['Phone', data.profile.phone]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not set"}</dd></div>)}
        </dl><p>Rider access is managed by an administrator. No public rider registration.</p><button type="button" className={styles.action} onClick={logout}><LogOut size={18} />Sign out</button></section>}
      {updatedAt && <div className={styles.updated}><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh rider workspace"><RefreshCw size={18} /></button><time dateTime={updatedAt.toISOString()}>Workspace loaded {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(updatedAt)} • Riyadh</time></div>}
    </main>
    <nav className={styles.nav} aria-label="Rider navigation"><div>{sections.map(({ id, label, href, Icon }) => <a key={id} href={`${href}${preview ? "?preview=1" : ""}`} aria-current={section === id ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></a>)}</div></nav>
  </div>;
}

export default function RiderPortal(props) {
  return <ProtectedRoute roles={["admin", "rider"]}><PortalContent key={`${props.section}-${props.preview}`} {...props} /></ProtectedRoute>;
}
