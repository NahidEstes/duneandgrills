"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t } from "../i18n/core.js";



import Link from "next/link";
import { ArrowRight, ChevronUp, Clock3, Facebook, Flame, Instagram, MapPin, Phone } from "lucide-react";
import { usePublicRestaurant } from "../context/PublicRestaurantContext.jsx";
import { groupOpeningHours } from "../utils/visitUs.js";
import styles from "./LandingFooter.module.css";

const navigation = [
["Home", "/#home"],
["Menu", "/menu"],
["Offers", "/#offers"],
["Our Story", "/#about"],
["Contact", "/#visit"]];


function XIcon(props) {
  return <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M18.9 3h3.3L15 11.3 23.5 21h-6.7l-5.3-7-6.1 7H2l7.9-9L.5 3h6.9l4.8 6.4L18.9 3Zm-1.2 16h1.8L6.3 4.9H4.4L17.7 19Z" /></svg>;
}

// Add the restaurant's profile URLs here when they are available.
const socialProfiles = [
{ label: "Instagram", Icon: Instagram, href: "" },
{ label: "Facebook", Icon: Facebook, href: "" },
{ label: "X", Icon: XIcon, href: "" }];


function LandingFooter() {
  const { settings } = usePublicRestaurant();
  const location = settings?.location || {};
  const phone = typeof location.phone === "string" && /^[+\d][\d ()-]{6,19}$/.test(location.phone) ? location.phone : "";
  const hours = groupOpeningHours(settings?.openingHours || []);
  const addressLines = [location.address, location.city, location.country].filter(Boolean);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.columns}>
          <div className={styles.brand}>
            <Link href="/#home" aria-label={t("Dune and Grills home")} className={styles.logo}>
              <Flame className={styles.flame} aria-hidden="true" strokeWidth={1.8} />
              <span className={styles.wordmark}>{t("DUNE ")}<span>{t("&")}</span>{t(" GRILLS")}</span>
            </Link>
            <p className={styles.tagline}>{t("Fire-grilled favorites and warm Riyadh hospitality.")}</p>
            <div className={styles.socials} role="group" aria-label={t("Social media")}>
              {socialProfiles.map(({ label, Icon, href }) => href ?
              <a key={label} href={href} className={styles.socialIcon} aria-label={t(label)} target="_blank" rel="noopener noreferrer">
                  <Icon aria-hidden="true" />
                </a> :

              <span key={label} className={styles.socialIcon} role="img" aria-label={t(label)}>
                  <Icon aria-hidden="true" />
                </span>
              )}
            </div>
          </div>

          <nav aria-label={t("Footer navigation")}>
            <h2 className={styles.heading}>{t("Explore")}</h2>
            <ul className={styles.navigation}>
              {navigation.map(([label, href]) => <li key={label}><Link href={href}>{t(label)}</Link></li>)}
            </ul>
          </nav>

          <section aria-labelledby="footer-contact-heading">
            <h2 id="footer-contact-heading" className={styles.heading}>{t("Visit & Contact")}</h2>
            <div className={styles.contactDetails}>
              <div className={styles.iconRow}>
                <MapPin className={styles.detailIcon} aria-hidden="true" strokeWidth={1.7} />
                <address className={styles.address}>
                  {t(addressLines.length ? addressLines.map((line, index) => <span key={index}>{t(line)}</span>) : "Location details unavailable")}
                </address>
              </div>
              {phone && <a className={`${styles.iconRow} ${styles.phone}`} href={`tel:${phone.replace(/[ ()-]/g, "")}`}>
                <Phone className={styles.detailIcon} aria-hidden="true" strokeWidth={1.7} />
                <span dir="ltr">{t(phone)}</span>
              </a>}
              {location.directionsUrl && <a className={styles.directions} href={location.directionsUrl} target="_blank" rel="noopener noreferrer">
                <span>{t("Get directions")}</span><ArrowRight aria-hidden="true" />
              </a>}
            </div>
          </section>

          <section aria-labelledby="footer-hours-heading">
            <h2 id="footer-hours-heading" className={styles.heading}>{t("Opening Hours")}</h2>
            <div className={styles.hoursDetails}>
              <Clock3 className={styles.detailIcon} aria-hidden="true" strokeWidth={1.7} />
              {t(hours.length > 0 ? <dl className={styles.hours}>
                {hours.map((row) => <div className={styles.hoursGroup} key={row.label}>
                  <dt>{t(row.label)}</dt><dd>{t(row.schedule)}</dd>
                </div>)}
              </dl> : <p className={styles.unavailable}>{t("Opening hours are currently unavailable.")}</p>)}
            </div>
          </section>
        </div>

        <div className={styles.bottomBar}>
          <p className={styles.copyright}>{t("© ")}{t(new Date().getFullYear())}{t(" Dune & Grills. All rights reserved.")}</p>
          <div className={styles.bottomActions}>
            <div id="public-app-options" className={styles.appOptions} />
            <button type="button" className={styles.backToTop} aria-label={t("Back to top")} onClick={scrollToTop}>
              <ChevronUp aria-hidden="true" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </footer>);

}

export default withLocale(LandingFooter);
