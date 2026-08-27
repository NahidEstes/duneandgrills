"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingCart, Menu, X, Flame, User, LogOut } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_LINKS = [
  { label: "Home", hash: "home" },
  { label: "Menu", hash: "menu" },
  { label: "About Us", hash: "about" },
  { label: "Contact", hash: "contact" },
];

const Navbar = ({
  onCartClick,
  alwaysSolid = false,
  wide = false,
  accountMenuItems = [],
  activeAccountItem,
  onAccountItemClick,
  onAccountLogout,
}) => {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hasAccountMenu = accountMenuItems.length > 0;
  const hideDesktopNav = pathname === "/profile";

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
        scrolled || alwaysSolid
          ? "bg-black/90 backdrop-blur-md border-b border-dune-border"
          : "bg-transparent"
      }`}
    >
      <nav
        className={`mx-auto flex h-16 items-center justify-between md:h-20 ${
          hasAccountMenu ? "px-3 sm:px-5 md:px-8" : "px-5 md:px-8"
        } ${wide ? "max-w-[1440px]" : "max-w-7xl"}
        `}
      >
        <Link
          href="/"
          onClick={handleLogoClick}
          className={`group flex cursor-pointer items-center ${
            hasAccountMenu ? "gap-1 sm:gap-2" : "gap-2"
          }`}
        >
          <Flame
            className={`text-dune-amber group-hover:animate-flicker ${
              hasAccountMenu ? "h-[18px] w-[18px] sm:h-6 sm:w-6" : "h-6 w-6"
            }`}
          />
          <span
            className={`font-display tracking-widest text-white md:text-3xl ${
              hasAccountMenu
                ? "text-[17px] min-[375px]:text-xl sm:text-2xl"
                : "text-2xl"
            }`}
          >
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
        </Link>

        {!hideDesktopNav && (
          <ul
            className={`items-center gap-9 ${
              hasAccountMenu ? "hidden lg:flex" : "hidden md:flex"
            }`}
          >
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
        )}

        <div
          className={`flex items-center ${
            hasAccountMenu ? "gap-1 sm:gap-3" : "gap-3"
          }`}
        >
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
            className={`p-2.5 rounded-full border border-dune-border text-white ${
              hasAccountMenu ? "lg:hidden" : "md:hidden"
            }`}
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
        <div
          className={`bg-black border-t border-dune-border animate-fadeUp ${
            hasAccountMenu ? "lg:hidden" : "md:hidden"
          }`}
        >
          {hasAccountMenu ? (
            <nav
              className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-2"
              aria-label="Mobile account navigation"
            >
              {accountMenuItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onAccountItemClick?.(id);
                  }}
                  className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-4 py-2.5 text-left text-sm transition-colors ${
                    activeAccountItem === id
                      ? "border-dune-amber bg-white/10 text-white"
                      : "border-transparent text-neutral-300 hover:bg-white/5 hover:text-dune-amber"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      activeAccountItem === id
                        ? "text-dune-amber"
                        : "text-neutral-500"
                    }`}
                  />
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onAccountLogout?.();
                }}
                className="flex min-h-11 items-center gap-3 rounded-lg border-l-2 border-transparent px-4 py-2.5 text-left text-sm text-neutral-300 transition-colors hover:bg-red-500/5 hover:text-red-400"
              >
                <LogOut className="h-4 w-4 text-neutral-500" />
                Logout
              </button>
            </nav>
          ) : (
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
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
