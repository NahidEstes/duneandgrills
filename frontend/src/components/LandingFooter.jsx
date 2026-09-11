import Link from "next/link";
import { Facebook, Flame, Instagram, Twitter } from "lucide-react";

const quickLinks = [
  ["Home", "#home"],
  ["Menu", "#menu"],
  ["Offers", "#offers"],
  ["Our Story", "#about"],
  ["Contact", "#contact"],
];

const socialLinks = [
  ["Instagram", "https://www.instagram.com/", Instagram],
  ["Facebook", "https://www.facebook.com/", Facebook],
  ["X / Twitter", "https://x.com/", Twitter],
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#030504]">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.75fr_0.85fr_1.2fr] lg:gap-12">
          <div>
            <Link href="#home" aria-label="Dune and Grills home" className="inline-flex items-center gap-3">
              <Flame className="h-8 w-8 fill-dune-amber/20 text-dune-amber" />
              <span className="font-display text-3xl tracking-widest text-white">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-6 text-neutral-500">Fire-grilled favorites, bold desert-inspired flavor, and warm Riyadh hospitality.</p>
            <p className="mt-5 font-display text-xl tracking-[0.14em] text-dune-amber">GOOD FOOD. BRIGHTER DAYS.</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Quick Links</h2>
            <nav aria-label="Footer navigation" className="mt-5 flex flex-col items-start gap-3">
              {quickLinks.map(([label, href]) => <Link key={label} href={href} className="text-sm text-neutral-500 transition-colors hover:text-dune-amber">{label}</Link>)}
            </nav>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Follow Us</h2>
            <div className="mt-5 flex gap-3">
              {socialLinks.map(([label, href, Icon]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-400 transition-colors hover:border-dune-amber/50 hover:text-dune-amber"><Icon className="h-4 w-4" /></a>)}
            </div>
            <p className="mt-5 text-sm leading-6 text-neutral-500">Follow along for fresh dishes, offers, and restaurant news.</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">Newsletter</h2>
            <p className="mt-5 text-sm leading-6 text-neutral-500">Get special offers and updates delivered to your inbox.</p>
            <div className="mt-4 flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
              <input type="email" disabled aria-label="Newsletter email address" placeholder="Newsletter coming soon" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-neutral-500 outline-none placeholder:text-neutral-600 disabled:cursor-not-allowed" />
              <span aria-hidden="true" className="grid w-12 place-items-center bg-dune-amber/50 text-black">→</span>
            </div>
            <p className="mt-2 text-xs text-neutral-600">Online signup will be available soon.</p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/[0.08] pt-6 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Dune &amp; Grills. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal information"><span>Privacy Policy</span><span>Terms of Service</span></div>
        </div>
      </div>
    </footer>
  );
}
