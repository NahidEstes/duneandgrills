import React from "react";
import { ArrowRight, Flame } from "lucide-react";
import DuneDivider from "./DuneDivider.jsx";
import SmartImage from "./SmartImage.jsx";

const Hero = () => {
  return (
    <section
      id="home"
      className="relative flex flex-col justify-end min-h-[92vh] pt-24 overflow-hidden"
    >
      {/* Background image + gradient scrim */}
      <SmartImage
        src="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1800&q=80"
        alt="Char-grilled food over an open flame"
        className="object-cover object-center"
        sizes="100vw"
        priority
        fill
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />

      <div className="relative max-w-7xl mx-auto w-full px-5 md:px-8 pb-16 md:pb-24">
        <div className="flex items-center gap-2 eyebrow animate-fadeUp">
          <Flame className="w-4 h-4" />
          Fire-grilled, desert-inspired
        </div>

        <h1
          className="mt-4 text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] text-white animate-fadeUp"
          style={{ animationDelay: "0.1s" }}
        >
          FLAVOR FORGED
          <br />
          IN THE <span className="text-gradient-amber">FIRE.</span>
        </h1>

        <p
          className="mt-6 max-w-xl text-base md:text-lg text-neutral-300 animate-fadeUp"
          style={{ animationDelay: "0.2s" }}
        >
          Dune &amp; Grills brings bold, char-grilled flavor to every plate — from
          smoked burgers to spiced shawarma. Order online and taste the fire.
        </p>

        <div
          className="mt-9 flex flex-wrap items-center gap-4 animate-fadeUp"
          style={{ animationDelay: "0.3s" }}
        >
          <a
            href="#menu"
            className="group inline-flex items-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-7 py-3.5 rounded-full transition-all duration-300 shadow-amberGlow"
          >
            Order Now
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="#about"
            className="inline-flex items-center gap-2 border border-dune-border hover:border-dune-amber text-white px-7 py-3.5 rounded-full transition-colors duration-300"
          >
            Our Story
          </a>
        </div>
      </div>

      <div className="relative">
        <DuneDivider />
      </div>
    </section>
  );
};

export default Hero;
