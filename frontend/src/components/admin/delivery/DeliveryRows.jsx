import { AlertTriangle, Clock3 } from "lucide-react";
import { CashVisibility } from "./DeliveryHealthPanel.jsx";
import { DeliveryBadge } from "./DeliveryBadges.jsx";
import { deliveryActionLabel, deliveryDateLabel } from "./deliveryManagementPresentation.js";
import { deliveryStageDuration } from "./deliveryManagementView.js";
import styles from "./deliveryManagement.module.css";

function RowAction({ row, selected, canManage, disabled, select }) {
  const label = deliveryActionLabel(row, canManage);
  return <div className={styles.rowAction}><button type="button" aria-pressed={selected?.id === row.id} disabled={disabled} onClick={() => select(row)} className={canManage && row.deliveryStatus === "unassigned" && row.canOperate !== false ? styles.primary : styles.secondary}>{label === "Assign" ? "Assign Rider" : label === "Reassign" ? "View Details" : label}</button>{row.canOperate === false && <span className={styles.blocked}><AlertTriangle size={14} aria-hidden="true" />Requires authorized review</span>}</div>;
}
function CurrentStatus({ row }) {
  return <div className={styles.currentStatus}><span><small>Kitchen</small><DeliveryBadge kind="restaurant" value={row.restaurantStatus} /></span><span><small>Delivery</small><DeliveryBadge kind="delivery" value={row.deliveryStatus} /></span>{row.attention?.some(key => ["pickup_delayed", "delivery_delayed"].includes(key)) && <span className={styles.blocked}><AlertTriangle size={14} aria-hidden="true" />Stage delayed</span>}</div>;
}
const riderLabel = row => row.riderName || (row.riderId ? "Rider name unavailable" : "No rider assigned");
export default function DeliveryRows({ rows, selected, canManage, disabled, select, workspace, serverNow }) {
  const active = workspace === "active", cash = workspace === "cash";
  const headings = active ? ["Order / Customer", "Current Status", "Rider", "Stage Duration", "Action"] : cash ? ["Order / Delivery", "Cash / Payment", "Rider", "Reported / Confirmed", "Action"] : ["Order", "Current Status", "Rider", "Completed", "Action"];
  const clock = row => active ? deliveryStageDuration(row, serverNow) : cash ? deliveryDateLabel(row.cashReport?.confirmedAt || row.cashReport?.reportedAt) : deliveryDateLabel(row.deliveredAt);
  return <>
    <div className="hidden overflow-x-auto lg:block"><table className={styles.table}><thead><tr>{headings.map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} data-selected={selected?.id === row.id}><td><strong>{row.orderNumber}</strong><small>{active ? row.customerName || "Customer unavailable" : row.deliveryStatus === "delivered" ? "Delivered" : "Delivery record"}</small></td><td>{cash ? <CashVisibility delivery={row} compact /> : <CurrentStatus row={row} />}</td><td>{riderLabel(row)}</td><td><span className={styles.duration}><Clock3 size={14} aria-hidden="true" />{clock(row)}</span></td><td><RowAction {...{ row, selected, canManage, disabled, select }} /></td></tr>)}</tbody></table></div>
    <div className={`${styles.mobileRows} lg:hidden`} aria-label="Delivery cards">{rows.map(row => <article key={row.id} className={styles.mobileCard} data-selected={selected?.id === row.id}><div className={styles.cardTitle}><h3>{row.orderNumber}</h3>{row.deliveryStatus === "issue" && <AlertTriangle className={styles.dangerIcon} size={20} aria-label="Delivery issue" />}</div>{active && <p>{row.customerName || "Customer unavailable"}</p>}{cash ? <CashVisibility delivery={row} compact /> : <CurrentStatus row={row} />}<div className={styles.cardMeta}><span>Rider: {riderLabel(row)}</span><span><Clock3 size={14} aria-hidden="true" />{clock(row)}</span></div><RowAction {...{ row, selected, canManage, disabled, select }} /></article>)}</div>
  </>;
}
