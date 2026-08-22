import React from "react";

// The signature motif of the site: a dune horizon line that recurs between
// sections, tying "Dune" (the sand silhouette) to "Grills" (the amber glow).
const DuneDivider = ({ flip = false }) => (
  <div className={`w-full overflow-hidden leading-none ${flip ? "rotate-180" : ""}`} aria-hidden="true">
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className="w-full h-12 md:h-16"
    >
      <defs>
        <linearGradient id="duneStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#92400E" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path
        d="M0 50 C 180 10, 340 70, 520 40 S 860 10, 1040 45 S 1300 60, 1440 30"
        fill="none"
        stroke="url(#duneStroke)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  </div>
);

export default DuneDivider;
