import { ArrowUpRight, Clock3, MapPin, Navigation } from "lucide-react";

const FALLBACK_DIRECTIONS_URL = "https://maps.app.goo.gl/fB8oDz42G7eb1JLs6";

const DAY_LABELS = { sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat" };

const displayTime = (value = "") => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};

const scheduleLabel = (day) => !day.isOpen
  ? "Closed"
  : (day.periods || []).map((period) => `${displayTime(period.open)} – ${displayTime(period.close)}`).join(" · ");

const MapPlaceholder = ({ directionsUrl, locationLabel }) => (
  <div
    role="img"
    aria-label={`Map placeholder showing Dune and Grills in ${locationLabel}`}
    className="relative min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#101b22] sm:min-h-[380px]"
  >
    <div
      aria-hidden="true"
      className="absolute inset-0 opacity-70"
      style={{
        backgroundImage:
          "linear-gradient(28deg, transparent 45%, rgba(148,163,184,.18) 46%, rgba(148,163,184,.18) 48%, transparent 49%), linear-gradient(118deg, transparent 43%, rgba(148,163,184,.12) 44%, rgba(148,163,184,.12) 46%, transparent 47%), repeating-linear-gradient(0deg, transparent 0 48px, rgba(148,163,184,.08) 49px 51px), repeating-linear-gradient(90deg, transparent 0 68px, rgba(148,163,184,.08) 69px 71px)",
      }}
    />
    <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,rgba(5,10,13,.14)_45%,rgba(5,10,13,.72)_100%)]" />
    {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" aria-label="Get directions to Dune and Grills">
      <span className="grid h-16 w-16 place-items-center rounded-full border border-dune-amber/50 bg-black/75 text-dune-amber shadow-amberGlow transition-transform hover:scale-105">
        <MapPin className="h-8 w-8 fill-dune-amber/20" />
      </span>
      <span className="mt-3 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
        Dune &amp; Grills
      </span>
    </a> : <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"><span className="grid h-16 w-16 place-items-center rounded-full border border-dune-amber/30 bg-black/75 text-dune-amber"><MapPin className="h-8 w-8 fill-dune-amber/20" /></span><span className="mt-3 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-sm font-semibold text-white">Dune &amp; Grills</span></div>}
    <span className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-neutral-300 backdrop-blur-sm">
      {locationLabel}
    </span>
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
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dune-amber/35 bg-dune-amber/10 text-dune-amber"><Clock3 className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm text-neutral-500">Opening hours · Asia/Riyadh</p>{openingHours.length ? <dl className="mt-2 grid max-w-md gap-x-5 gap-y-1 text-sm sm:grid-cols-2">{openingHours.map((day) => <div key={day.day} className="flex justify-between gap-4"><dt className="text-neutral-500">{DAY_LABELS[day.day] || day.day}</dt><dd className={day.isOpen ? "text-white" : "text-neutral-600"}>{scheduleLabel(day)}</dd></div>)}</dl> : <p className="mt-1 font-medium text-white">Open daily · 11:00 AM – 11:00 PM</p>}</div>
            </div>
          </div>

          {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-dune-amber px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight">
            <Navigation className="h-4 w-4" /> Get Directions <ArrowUpRight className="h-4 w-4" />
          </a>}
        </div>
        <MapPlaceholder directionsUrl={directionsUrl} locationLabel={locationLabel || "Riyadh"} />
      </div>
    </section>
  );
}
