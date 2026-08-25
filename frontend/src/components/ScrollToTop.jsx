"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Scrolls to top only when the user navigates to a NEW page (clicking a
// link, i.e. "PUSH"). If they use the browser's Back/Forward buttons
// ("POP"), the browser's native scroll restoration takes over instead,
// returning them to where they were on that page.
const ScrollToTop = () => {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      window.scrollTo(0, 0);
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
