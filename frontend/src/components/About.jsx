import React from "react";
import { Flame, Clock, MapPin } from "lucide-react";
import DuneDivider from "./DuneDivider.jsx";

const FEATURES = [
  {
    icon: Flame,
    title: "Open-Flame Grilling",
    text: "Every protein passes over real fire — never a shortcut, never microwaved.",
  },
  {
    icon: Clock,
    title: "Fresh Daily",
    text: "Ingredients are sourced and prepped each morning, never held over.",
  },
  {
    icon: MapPin,
    title: "Rooted Locally",
    text: "A neighborhood kitchen serving bold, desert-inspired flavor since day one.",
  },
];

const About = () => {
  return (
    <section id="about" className="relative bg-black py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-14 items-center">
        <div className="relative">
          <div className="rounded-2xl overflow-hidden border border-dune-border">
            <img
              src="https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=1000&q=80"
              alt="Chef grilling skewers over open flame"
              className="w-full h-[420px] object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute -bottom-6 -right-6 hidden md:block bg-dune-amber text-black rounded-2xl px-6 py-4 shadow-amberGlow">
            <p className="font-display text-3xl leading-none">100%</p>
            <p className="text-xs font-semibold uppercase tracking-wide mt-1">
              Flame Grilled
            </p>
          </div>
        </div>

        <div>
          <p className="eyebrow">Our Story</p>
          <h2 className="mt-3 text-4xl md:text-5xl text-white leading-tight">
            BORN FROM FIRE,
            <br />
            <span className="text-gradient-amber">SHAPED BY THE DUNES.</span>
          </h2>
          <p className="mt-5 text-neutral-400 leading-relaxed">
            Dune &amp; Grills started with a simple idea: take the boldest
            grilling traditions of the desert and pair them with modern,
            craveable comfort food. Every burger, wrap and skewer is
            char-grilled to order and finished with house-made sauces.
          </p>

          <div className="mt-9 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <div className="shrink-0 w-11 h-11 rounded-full bg-dune-amber/10 border border-dune-amber/40 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-dune-amber" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{title}</h3>
                  <p className="text-sm text-neutral-400 mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-20">
        <DuneDivider />
      </div>
    </section>
  );
};

export default About;
