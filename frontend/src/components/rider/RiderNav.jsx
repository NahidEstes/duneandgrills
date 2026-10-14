import { House, List, UserRound, Wallet } from "lucide-react";
import { deliveryModeQuery } from "./deliveryPresentation.js";
import styles from "./rider.module.css";
const sections = [{ id: "home", label: "Home", href: "/rider", Icon: House },
  { id: "deliveries", label: "Deliveries", href: "/rider/deliveries", Icon: List },
  { id: "cash", label: "Cash", href: "/rider/cash", Icon: Wallet },
  { id: "profile", label: "Profile", href: "/rider/profile", Icon: UserRound }];
export default function RiderNav({ section = "deliveries", preview, rehearsal }) {
  const current = section === "history" ? "deliveries" : section;
  return <nav className={styles.nav} aria-label="Rider navigation"><div>{sections.map(({ id, label, href, Icon }) => <a key={id} href={`${href}${deliveryModeQuery({ preview, rehearsal })}`} aria-current={current === id ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></a>)}</div></nav>;
}
