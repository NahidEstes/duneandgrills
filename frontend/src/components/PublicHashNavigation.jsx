"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export default function PublicHashNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") return;
    let observer;
    const scroll = () => {
      observer?.disconnect();
      const id = window.location.hash.slice(1);
      if (!["home", "menu", "about", "offers", "visit"].includes(id)) return;
      const find = () => { const node = document.getElementById(id); if (!node) return false; node.scrollIntoView({ behavior: "auto", block: "start" }); node.setAttribute("tabindex", "-1"); node.focus({ preventScroll: true }); observer?.disconnect(); return true; };
      if (!find()) { observer = new MutationObserver(find); observer.observe(document.body, { childList: true, subtree: true }); }
    };
    scroll(); window.addEventListener("hashchange", scroll); window.addEventListener("popstate", scroll);
    return () => { observer?.disconnect(); window.removeEventListener("hashchange", scroll); window.removeEventListener("popstate", scroll); };
  }, [pathname]);
  return null;
}
