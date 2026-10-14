"use client";
import Link from "next/link";
import { Flame, Phone } from "lucide-react";
import { usePublicRestaurant } from "../context/PublicRestaurantContext.jsx";
import { groupOpeningHours } from "../utils/visitUs.js";

export default function LandingFooter() {
  const { settings } = usePublicRestaurant();
  const location = settings?.location || {};
  const phone = typeof location.phone === "string" && /^[+\d][\d ()-]{6,19}$/.test(location.phone) ? location.phone : "";
  const hours = groupOpeningHours(settings?.openingHours || []);
  return <footer className="border-t border-white/10 bg-[#030504]">
    <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div><Link href="/#home" aria-label="Dune and Grills home" className="inline-flex items-center gap-2"><Flame className="h-7 w-7 text-dune-amber" /><span className="font-display text-2xl tracking-widest text-white">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</span></Link><p className="mt-4 text-sm leading-6 text-neutral-400">Fire-grilled favorites and warm Riyadh hospitality.</p></div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-start gap-x-6 gap-y-2">{[["Home","/#home"],["Menu","/menu"],["Offers","/#offers"],["Our Story","/#about"],["Contact","/#visit"]].map(([label,href]) => <Link className="inline-flex min-h-11 items-center text-sm text-neutral-300 hover:text-dune-amber" key={label} href={href}>{label}</Link>)}</nav>
        <div><h2 className="font-body text-base font-semibold text-white">Visit &amp; Contact</h2><address className="mt-3 text-sm not-italic text-neutral-300">{[location.address,location.city,location.country].filter(Boolean).join(", ") || "Location details unavailable"}</address>
          {phone && <a className="inline-flex min-h-11 items-center gap-2 text-sm text-dune-amber" href={`tel:${phone.replace(/[ ()-]/g,"")}`}><Phone className="h-4 w-4" />{phone}</a>}
          {hours.length > 0 && <dl className="mt-2 space-y-2 text-sm text-neutral-300">{hours.map(row => <div key={row.label}><dt className="inline">{row.label}: </dt><dd className="inline">{row.schedule}</dd></div>)}</dl>}
        </div>
      </div>
      <div id="public-app-options" className="mt-8" />
      <p className="mt-8 border-t border-white/10 pt-6 text-sm text-neutral-400">&copy; {new Date().getFullYear()} Dune &amp; Grills. All rights reserved.</p>
    </div>
  </footer>;
}
