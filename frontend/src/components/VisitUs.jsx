import { ArrowUpRight, Clock3, MapPin, Navigation } from "lucide-react";
import { buildMapEmbedUrl, groupOpeningHours } from "../utils/visitUs.js";

const FALLBACK_DIRECTIONS_URL = "https://maps.app.goo.gl/fB8oDz42G7eb1JLs6";

const MapEmbed = ({ src, locationLabel }) => src ? (
  <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-neutral-100 shadow-2xl shadow-black/30 sm:min-h-[400px] lg:min-h-[480px]">
    <iframe
      src={src}
      title={`Map showing Dune and Grills in ${locationLabel}`}
      className="absolute inset-0 h-full w-full border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  </div>
) : (
  <div className="grid min-h-[320px] place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-center text-sm text-neutral-500 sm:min-h-[400px] lg:min-h-[480px]">
    Map location is not configured.
  </div>
);

export default function VisitUs({ settings }) {
  const location = settings?.location || {};
  const address = settings ? location.address : "Wadi As Sarh, Al Wadi";
  const city = settings ? location.city : "Riyadh";
  const country = settings ? location.country : "Saudi Arabia";
  const directionsUrl = settings ? location.directionsUrl : FALLBACK_DIRECTIONS_URL;
  const locationLabel = [address, city, country].filter(Boolean).join(", ");
  const openingHours = settings?.openingHours || [];
  const groupedOpeningHours = groupOpeningHours(openingHours);
  const timezone = settings?.timezone || "Asia/Riyadh";
  const mapEmbedUrl = buildMapEmbedUrl({ address, city, country });
  return (
    <section id="visit" aria-labelledby="visit-heading" className="relative overflow-hidden border-t border-white/[0.06] bg-[#050807] py-20 md:py-28">
      <div aria-hidden="true" className="absolute left-0 top-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-dune-amber/[0.06] blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="eyebrow">Visit Us</p>
          <h2 id="visit-heading" className="mt-3 font-display text-5xl leading-none text-white sm:text-6xl">
            FIND US IN <span className="text-gradient-amber">RIYADH</span>
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-neutral-400">
            Come experience great food, warm hospitality, and the unmistakable flavor of the grill. We look forward to serving you.
          </p>

          <div className="mt-9 space-y-6">
            {locationLabel && <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dune-amber/35 bg-dune-amber/10 text-dune-amber"><MapPin className="h-5 w-5" /></span>
              <div><p className="text-sm text-neutral-500">Restaurant location</p><address className="mt-1 not-italic text-white">{locationLabel}</address></div>
            </div>}
            <div className="flex items-start gap-4 border-y border-white/10 py-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dune-amber/35 bg-dune-amber/10 text-dune-amber"><Clock3 className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-500">Opening hours · {timezone}</p>
                {groupedOpeningHours.length ? <dl className="mt-3 max-w-md space-y-2 text-sm">{groupedOpeningHours.map((group) => <div key={group.days.join("-")} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center"><dt className="text-neutral-300">{group.label}</dt><dd className={`border-l border-white/15 pl-5 ${group.isOpen ? "text-white" : "text-neutral-600"}`}>{group.schedule}</dd></div>)}</dl> : <p className="mt-2 text-sm text-neutral-500">Opening hours are currently unavailable.</p>}
              </div>
            </div>
          </div>

          {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-dune-amber px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight">
            <Navigation className="h-4 w-4" /> Get Directions <ArrowUpRight className="h-4 w-4" />
          </a>}
        </div>
        <MapEmbed src={mapEmbedUrl} locationLabel={locationLabel || "Riyadh"} />
      </div>
    </section>
  );
}
