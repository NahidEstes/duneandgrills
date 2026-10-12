import { Bike, ClipboardList, UserRound } from "lucide-react";
import { deliveryModeQuery } from "./deliveryPresentation.js";
import styles from "./rider.module.css";
const sections = [{ id: "deliveries", label: "Deliveries", href: "/rider", Icon: Bike },
  { id: "history", label: "History", href: "/rider/history", Icon: ClipboardList },
  { id: "profile", label: "Profile", href: "/rider/profile", Icon: UserRound }];
export default function RiderNav({ section = "deliveries", preview, rehearsal }) {
  return <nav className={styles.nav} aria-label="Rider navigation"><div>{sections.map(({ id, label, href, Icon }) => <a key={id} href={`${href}${deliveryModeQuery({ preview, rehearsal })}`} aria-current={section === id ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></a>)}</div></nav>;
}
