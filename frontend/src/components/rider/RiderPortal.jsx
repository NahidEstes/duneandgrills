"use client";
import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowRight, CircleCheck, Clock3, Info, List, LogOut, Package, RefreshCw, Truck, Wallet, Wifi, WifiOff } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import useRiderPortal from "@/src/hooks/useRiderPortal.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import { updateRiderAvailability } from "@/src/api/deliveryApi.js";
import RiderDeliveryCard from "./RiderDeliveryCard.jsx";
import RiderNav from "./RiderNav.jsx";
import RiderHistoryFilters, { emptyHistoryFilters } from "./RiderHistoryFilters.jsx";
import RiderPendingCash, { RestaurantContact } from "./RiderPendingCash.jsx";
import { ACTIVE_RIDER_FILTERS, RIDER_FILTERS, CASH_STATES, filterDeliveries, riderCount, riderInitials } from "./riderPresentation.js";
import { deliveryModeQuery } from "./deliveryPresentation.js";
import styles from "./rider.module.css";

function RiderIdentity({ profile, user, mode }) {
  const [failedAvatar, setFailedAvatar] = useState("");
  const name = profile?.name || user?.name || "Rider", avatar = profile?.avatar || user?.avatar;
  const source = typeof avatar === "string" && (/^https?:\/\//.test(avatar) || /^\/(?!\/)/.test(avatar)) ? avatar : "";
  return <header className={styles.portalHeader}>
    <div className={styles.wordmark}><strong>DUNE <span>&amp;</span> GRILLS</strong><p>BURGERS · GRILLS · MORE</p></div>
    <a className={styles.avatar} href={`/rider/profile${deliveryModeQuery(mode)}`} aria-label={`View ${name}'s profile`}>
      {source && failedAvatar !== source ? <Image src={source} alt="" width={52} height={52} unoptimized onError={() => setFailedAvatar(source)} /> : <span aria-hidden="true">{riderInitials(name)}</span>}
    </a>
  </header>;
}

function PortalContent({ section, preview, rehearsal, initialCashStatus, initialStatus }) {
  const { user, logout } = useAuth();
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const [filter, setFilter] = useState(() => RIDER_FILTERS.some(option => option.value === initialStatus) ? initialStatus : "all");
  const [page, setPage] = useState(1);
  const [historyFilters, setHistoryFilters] = useState(() => ({ ...emptyHistoryFilters(), cashStatus: Object.hasOwn(CASH_STATES, initialCashStatus) ? initialCashStatus : "all" }));
  const history = section === "history", home = section === "home", listing = section === "deliveries" || history;
  const requestedStatus = section === "deliveries" ? filter : "all";
  const { data, loading, refreshing, offline, error, denied, updatedAt, refresh, invalidate, newAssignment, dismissNewAssignment, dataKey } = useRiderPortal(user, preview, rehearsal, requestedStatus, history, page, historyFilters);
  const queryKey = JSON.stringify({ ...historyFilters, rehearsal, status: requestedStatus, history, page });
  const previousResults = data && dataKey !== queryKey;
  const mutation = useDeliverySubmission();
  const operational = data?.mode === "operational", isPreview = data?.mode === "preview";
  const writable = !preview && (operational || (rehearsal && data?.mode === "rehearsal"));
  const available = writable ? data.availability === true : isPreview && previewAvailable;
  const deliveries = isPreview ? history ? [] : filterDeliveries(data.deliveries, requestedStatus) : data?.deliveries || [];
  const mode = { preview, rehearsal }, modeQuery = deliveryModeQuery(mode);
  const issues = riderCount(data, "issue");
  const issuesHref = `/rider/deliveries${modeQuery}${modeQuery ? "&" : "?"}status=issue`;
  const filterChanged = value => { setFilter(value); setPage(1); };
  const showCards = home || listing;
  const name = data?.profile?.name || user?.name || "Rider";
  return <div className={styles.portal}>
    <main className={`${styles.main} ${styles.dashboardMain}`}>
      <RiderIdentity profile={data?.profile} user={user} mode={mode} />
      <div className={styles.pageIntro}><div><h1>{home ? `Hello, ${name}` : listing ? "My deliveries" : section === "cash" ? "Cash overview" : "My profile"}</h1><p>{home ? "Let's keep the deliveries moving." : listing ? "Your assigned restaurant deliveries" : section === "cash" ? "Your reported cash and pending tasks" : "Your existing staff account"}</p></div>
        <span className={`${styles.connection} ${offline ? styles.disconnected : ""}`}>{offline ? <WifiOff size={16} aria-hidden="true" /> : <Wifi size={16} aria-hidden="true" />}{offline ? "Device offline" : "Device online"}</span>
      </div>
      {home && <button type="button" role="switch" aria-label={isPreview ? "Preview availability" : writable ? "Available for deliveries" : "Availability disabled"} aria-checked={!!available} disabled={(!isPreview && !writable) || !data || mutation.pending || offline || refreshing || !!error}
        onClick={() => writable ? mutation.submit("availability", { available: !available, expectedRevision: data.availabilityRevision }, updateRiderAvailability, invalidate) : setPreviewAvailable(value => !value)} className={`${styles.availabilityPanel} ${available ? styles.isAvailable : ""}`}>
        <span className={styles.availabilityDot} /><span className={styles.availabilityCopy}><strong>{isPreview || writable ? available ? "Available" : "Unavailable" : "Availability disabled"}</strong><span>{mutation.pending ? "Saving availability…" : isPreview ? "Preview only · no live availability change" : available ? "You are available for assigned deliveries" : writable ? "You are not available for new assignments" : "Delivery rider is not enabled"}</span></span><span className={styles.availabilitySwitch} aria-hidden="true" />
      </button>}
      {data && !operational && <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{isPreview ? "PREVIEW MODE · SYNTHETIC DATA" : rehearsal && writable ? "ISOLATED LOCAL REHEARSAL" : "DELIVERY RIDER DISABLED"}</strong><p>{isPreview ? "Read-only sample deliveries. Availability is local preview state only." : writable ? "Only disposable local test records. No production activity." : "An administrator can enable delivery riders in Restaurant Settings."}</p></div></div>}
      {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
      {offline && <p role="alert" className={styles.error}>Offline — retained data may be outdated. No actions are queued.</p>}
      {refreshing && <p role="status" className={styles.refreshNotice}><RefreshCw size={16} aria-hidden="true" />Updating… {previousResults ? "Previous filter/page results remain visible until verified." : "Your work stays in place."}</p>}
      {previousResults && !refreshing && <p role="status" className={styles.refreshNotice}>Previous filter/page results are retained. Current filters have not been verified — Retry to load them.</p>}
      {newAssignment && <div role="status" className={styles.banner}><Package aria-hidden="true" /><div><strong>New delivery available</strong><p>An assignment to your account was recorded.</p></div><button type="button" onClick={dismissNewAssignment}>Dismiss</button></div>}
      {loading && <div className={styles.loadingState} role="status"><RefreshCw aria-hidden="true" /><p>Loading private rider workspace…</p><div className={styles.skeletonCards} aria-hidden="true"><span /><span /></div></div>}
      {error && <div className={styles.empty} role="alert"><AlertTriangle aria-hidden="true" /><h2>{data ? "Retained data may be outdated" : "Workspace unavailable"}</h2><p>{error}</p>
        {!denied && <button type="button" className={styles.action} onClick={refresh}>Retry</button>}
        {denied && <a className={styles.action} href={preview ? "/rider" : "/login?returnTo=%2Frider"}>{preview ? "Return to private dashboard" : "Sign in again"}</a>}</div>}
      {data && home && <>
        <div className={styles.dashboardStats} aria-label="Delivery totals across all pages"><div><Package aria-hidden="true" /><div><strong>{riderCount(data, "active")}</strong><span>Active deliveries</span></div></div><div><CircleCheck aria-hidden="true" /><div><strong>{riderCount(data, "deliveredToday")}</strong><span>Delivered today</span><small>Asia/Riyadh</small></div></div></div>
        <div className={styles.sectionHeading}><h2>Your current assignments</h2><a href={`/rider/deliveries${modeQuery}`}>View all <ArrowRight size={16} aria-hidden="true" /></a></div>
      </>}
      {data && listing && <div className={styles.listTabs} role="group" aria-label="Delivery lists"><a href={`/rider/deliveries${modeQuery}`} aria-current={!history ? "page" : undefined}>Active <span>{riderCount(data, "active")}</span></a><a href={`/rider/history${modeQuery}`} aria-current={history ? "page" : undefined}>Completed</a></div>}
      {data && (home || listing) && Number.isSafeInteger(issues) && issues > 0 && <div className={styles.issueSummary} role="status"><AlertTriangle aria-hidden="true" /><div><strong>{issues} unresolved {issues === 1 ? "issue" : "issues"}</strong><p>Waiting for manager review.</p></div>{section === "deliveries" ? <button type="button" aria-pressed={filter === "issue"} onClick={() => filterChanged("issue")}>View issues <ArrowRight size={16} aria-hidden="true" /></button> : <a href={issuesHref}>View issues <ArrowRight size={16} aria-hidden="true" /></a>}</div>}
      {data && section === "deliveries" && <div className={styles.activeFilters} role="group" aria-label="Delivery status filter">{ACTIVE_RIDER_FILTERS.map(({ value, label }) => { const Icon = value === "all" ? List : value === "assigned" ? Clock3 : Truck; return <button key={value} type="button" aria-pressed={filter === value} onClick={() => filterChanged(value)}><Icon size={17} aria-hidden="true" />{label}</button>; })}</div>}
      {history && <RiderHistoryFilters initial={historyFilters} apply={value => { setHistoryFilters(value); setPage(1); }} />}
      {data && showCards && <>
        <div className={styles.cards} aria-busy={refreshing}>{deliveries.map(row => <RiderDeliveryCard key={row.id} delivery={row} preview={preview} rehearsal={rehearsal} />)}</div>
        {!deliveries.length && <div className={styles.empty}><Package aria-hidden="true" /><h2>{history ? "No matching delivery history" : isPreview ? "No matching preview deliveries" : writable ? "No matching deliveries" : "Live delivery is not enabled"}</h2><p>{history ? "No completed deliveries match your applied filters. Customer contact details remain private." : isPreview ? "These are synthetic examples. Try another filter." : writable ? "Only deliveries explicitly assigned to you appear here. Check another filter or refresh." : "Operational delivery remains disabled. No real delivery records have been queried."}</p>
          {section === "deliveries" && filter !== "all" && <button type="button" className={styles.action} onClick={() => filterChanged("all")}>Show all active deliveries</button>}
          {!preview && data.previewAvailable && <a className={styles.action} href={`/rider${home ? "" : "/deliveries"}?preview=1`}>Open isolated demo preview</a>}{!rehearsal && user?.role === "rider" && data.workflowAvailable && <a className={styles.action} href="/rider?rehearsal=1">Open isolated workflow rehearsal</a>}</div>}
      </>}
      {data && section === "cash" && <><p className={styles.cashExplanation}>Reporting collected cash does not mark an order paid. Cashier confirmation is separate.</p>{data.pendingCash ? <RiderPendingCash pending={data.pendingCash} rehearsal={rehearsal} /> : <div className={styles.empty}><Wallet aria-hidden="true" /><h2>Cash overview unavailable</h2><p>{isPreview ? "The read-only preview contains no real cash tasks." : "Pending cash is available when the rider workflow is enabled."}</p></div>}<a className={styles.contact} href={`/rider/history${modeQuery}`}>View completed deliveries and cash history <ArrowRight size={18} aria-hidden="true" /></a></>}
      {writable && data?.pagination && showCards && <div className={styles.pagination} aria-label="Delivery pagination"><span>{data.pagination.total} matching records · results page {data.pagination.page}{previousResults ? " (previous results)" : ""}</span><button type="button" disabled={page === 1 || refreshing} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" disabled={page * data.pagination.limit >= data.pagination.total || refreshing} onClick={() => setPage(value => value + 1)}>Next</button></div>}
      {data && section === "profile" && <section className={styles.card} aria-label="Rider profile"><dl className={styles.profile}>{[["Name", data.profile.name], ["Staff ID", data.profile.employeeId], ["Role", data.profile.role], ["Email", data.profile.email], ["Phone", data.profile.phone]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not set"}</dd></div>)}</dl><p>Rider access is managed by an administrator. No public rider registration.</p><button type="button" className={styles.action} onClick={logout}><LogOut size={18} aria-hidden="true" />Sign out</button></section>}
      {data && <RestaurantContact contact={data.restaurantContact} preview={preview} />}
      {updatedAt && <div className={styles.updated}><button type="button" onClick={refresh} disabled={loading || refreshing} aria-label="Refresh rider workspace"><RefreshCw size={18} aria-hidden="true" /></button><time dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}>Last successful update {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(updatedAt)} · Riyadh</time></div>}
    </main>
    <RiderNav section={section} {...mode} />
  </div>;
}

export default function RiderPortal(props) {
  const { user } = useAuth();
  const mode = { ...props, rehearsal: props.rehearsal && !props.preview };
  return <ProtectedRoute roles={mode.rehearsal ? ["rider"] : ["admin", "rider"]}><PortalContent key={`${user?._id || user?.id}:${user?.role}-${mode.section}-${mode.preview}-${mode.rehearsal}`} {...mode} /></ProtectedRoute>;
}
