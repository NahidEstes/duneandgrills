import React from "react";
import { Flame, Instagram, Facebook, Twitter } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-black border-t border-dune-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-dune-amber" />
          <span className="font-display text-xl tracking-widest text-white">
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
        </div>

        <p className="text-sm text-neutral-500 text-center">
          &copy; {new Date().getFullYear()} Dune &amp; Grills. All rights reserved.
        </p>

        <div className="flex items-center gap-4">
          <a href="#" aria-label="Instagram" className="text-neutral-400 hover:text-dune-amber transition-colors">
            <Instagram className="w-5 h-5" />
          </a>
          <a href="#" aria-label="Facebook" className="text-neutral-400 hover:text-dune-amber transition-colors">
            <Facebook className="w-5 h-5" />
          </a>
          <a href="#" aria-label="Twitter" className="text-neutral-400 hover:text-dune-amber transition-colors">
            <Twitter className="w-5 h-5" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
