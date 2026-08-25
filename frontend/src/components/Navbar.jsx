"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingCart, Menu, X, Flame, User } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_LINKS = [
  { label: "Home", hash: "home" },
  { label: "Menu", hash: "menu" },
  { label: "About Us", hash: "about" },
  { label: "Contact", hash: "contact" },
];

const Navbar = ({ onCartClick }) => {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Smoothly scrolls to a section, waiting a tick if we just navigated
  // from another page so the home page has time to render first.
  const scrollToSection = (hash, delay = 0) => {
    setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, delay);
  };

  // Handles clicks on Home / Menu / About / Contact — navigates to "/"
  // first if we're on another page, then scrolls to the section.
  const handleNavClick = (e, hash) => {
    e.preventDefault();
    setMobileOpen(false);

    if (pathname !== "/") {
      router.push(`/#${hash}`);
      scrollToSection(hash, 100); // small delay lets the home page mount
    } else {
      scrollToSection(hash);
    }
  };

  const handleLogoClick = (e) => {
    e.preventDefault();
    setMobileOpen(false);

    if (pathname !== "/") {
      router.push("/");
    } else {
      scrollToSection("home");
    }
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "bg-black/90 backdrop-blur-md border-b border-dune-border"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 h-16 md:h-20">
        <Link
          href="/"
          onClick={handleLogoClick}
          className="flex items-center gap-2 group cursor-pointer"
        >
          <Flame className="w-6 h-6 text-dune-amber group-hover:animate-flicker" />
          <span className="font-display text-2xl md:text-3xl tracking-widest text-white">
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
        </Link>

        <ul className="hidden md:flex items-center gap-9">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={`/#${link.hash}`}
                onClick={(e) => handleNavClick(e, link.hash)}
                className="text-sm font-medium tracking-wide text-neutral-300 hover:text-dune-amber transition-colors cursor-pointer"
              >
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <Link
              href="/blog"
              className="text-sm font-medium tracking-wide text-neutral-300 hover:text-dune-amber transition-colors"
            >
              Blog
            </Link>
          </li>
        </ul>

        <div className="flex items-center gap-3">
          <Link
            href={user ? "/profile" : "/login"}
            className="flex items-center gap-2 px-3 py-2 rounded-full border border-dune-border hover:border-dune-amber transition-colors"
          >
            <User className="w-5 h-5 text-white" />
            {user && (
              <span className="hidden sm:inline text-sm text-white font-medium">
                {user.name.split(" ")[0]}
              </span>
            )}
          </Link>

          <button
            onClick={onCartClick}
            aria-label={`Open cart, ${itemCount} items`}
            className="relative p-2.5 rounded-full border border-dune-border hover:border-dune-amber hover:shadow-amberGlow transition-all duration-300"
          >
            <ShoppingCart className="w-5 h-5 text-white" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-dune-amber text-black text-xs font-bold">
                {itemCount}
              </span>
            )}
          </button>

          <button
            className="md:hidden p-2.5 rounded-full border border-dune-border text-white"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden bg-black border-t border-dune-border animate-fadeUp">
          <ul className="flex flex-col px-5 py-4 gap-4">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={`/#${link.hash}`}
                  onClick={(e) => handleNavClick(e, link.hash)}
                  className="block text-base font-medium text-neutral-200 hover:text-dune-amber transition-colors cursor-pointer"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/blog"
                onClick={() => setMobileOpen(false)}
                className="block text-base font-medium text-neutral-200 hover:text-dune-amber transition-colors"
              >
                Blog
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
};

export default Navbar;
