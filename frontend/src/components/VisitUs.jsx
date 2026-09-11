import { ArrowUpRight, Clock3, MapPin, Navigation } from "lucide-react";

const DIRECTIONS_URL = "https://maps.app.goo.gl/fB8oDz42G7eb1JLs6";

const MapPlaceholder = () => (
  <div
    role="img"
    aria-label="Map placeholder showing Dune and Grills in Al Wadi, Riyadh"
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
    <a
      href={DIRECTIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
      aria-label="Get directions to Dune and Grills"
    >
      <span className="grid h-16 w-16 place-items-center rounded-full border border-dune-amber/50 bg-black/75 text-dune-amber shadow-amberGlow transition-transform hover:scale-105">
        <MapPin className="h-8 w-8 fill-dune-amber/20" />
      </span>
      <span className="mt-3 rounded-full border border-white/10 bg-black/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
        Dune &amp; Grills
      </span>
    </a>
    <span className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-neutral-300 backdrop-blur-sm">
      Al Wadi, Riyadh
    </span>
  </div>
);

export default function VisitUs() {
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
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dune-amber/35 bg-dune-amber/10 text-dune-amber"><MapPin className="h-5 w-5" /></span>
              <div><p className="text-sm text-neutral-500">Restaurant location</p><address className="mt-1 not-italic text-white">Wadi As Sarh, Al Wadi<br />Riyadh 18738, Saudi Arabia</address></div>
            </div>
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dune-amber/35 bg-dune-amber/10 text-dune-amber"><Clock3 className="h-5 w-5" /></span>
              <div><p className="text-sm text-neutral-500">Open daily</p><p className="mt-1 font-medium text-white">11:00 AM – 11:00 PM</p></div>
            </div>
          </div>

          <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-dune-amber px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-dune-amberLight">
            <Navigation className="h-4 w-4" /> Get Directions <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <MapPlaceholder />
      </div>
    </section>
  );
}
