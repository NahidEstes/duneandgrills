import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Scrolls to top only when the user navigates to a NEW page (clicking a
// link, i.e. "PUSH"). If they use the browser's Back/Forward buttons
// ("POP"), the browser's native scroll restoration takes over instead,
// returning them to where they were on that page.
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
};

export default ScrollToTop;
