import React, { useEffect, useState } from "react";
import { ShoppingCart, Menu, X, Flame, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Menu", href: "#menu" },
  { label: "About Us", href: "#about" },
  { label: "Contact", href: "#contact" },
  { label: "Blog", href: "/blog" },
];

const Navbar = ({ onCartClick }) => {
  const { itemCount } = useCart();
  const { user } = useAuth();
  // const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "bg-black/90 backdrop-blur-md border-b border-dune-border"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 h-16 md:h-20">
        {/* <a href="#home" className="flex items-center gap-2 group">
          <Flame className="w-6 h-6 text-dune-amber group-hover:animate-flicker" />
          <span className="font-display text-2xl md:text-3xl tracking-widest text-white">
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
        </a> */}
        <a href="#home" className="flex items-center gap-2 group">
          <img
            src="/src/Assets/logo.png"
            alt="Dune & Grills Logo"
            className="w-80 h-80 md:w-50 md:h-50 object-contain"
          />
        </a>

        <ul className="hidden md:flex items-center gap-9">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="text-sm font-medium tracking-wide text-neutral-300 hover:text-dune-amber transition-colors"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          {/* <Link
            to={user ? "/profile" : "/login"}
            className="p-2.5 rounded-full border border-dune-border hover:border-dune-amber transition-colors"
            aria-label={user ? "My profile" : "Log in"}
          >
            <User className="w-5 h-5 text-white" />
          </Link> */}
          <Link
            to={user ? "/profile" : "/login"}
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
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-base font-medium text-neutral-200 hover:text-dune-amber transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
};

export default Navbar;
