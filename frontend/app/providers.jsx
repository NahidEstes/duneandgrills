"use client";

import { AuthProvider } from "@/src/context/AuthContext.jsx";
import { CartProvider } from "@/src/context/CartContext.jsx";
import { FavoritesProvider } from "@/src/context/FavoritesContext.jsx";
import PwaExperience from "@/src/components/pwa/PwaExperience.jsx";
import DuneToaster from "@/src/components/ui/DuneToaster.jsx";
import { usePathname } from "next/navigation";
import { PublicRestaurantProvider } from "@/src/context/PublicRestaurantContext.jsx";

export default function Providers({ children }) {
  const pathname = usePathname();
  // The read-only second monitor must not load auth, cart, or customer data.
  if (pathname === "/pos/customer-display") return <><PwaExperience />{children}</>;
  if (pathname === "/rider" || pathname.startsWith("/rider/")) return (
    <CartProvider><AuthProvider readOnlyStaff>{children}<DuneToaster /></AuthProvider></CartProvider>
  );
  return (
    <CartProvider>
      <AuthProvider>
        <FavoritesProvider>
          <PwaExperience inlineOptions={/^\/(?:$|menu\/?$|login\/?$|blog(?:\/|$)|item\/|combo\/|offer\/)/.test(pathname)} />
          <PublicRestaurantProvider enabled={!/^\/(admin|inventory|pos|kitchen|staff-clock|tips-and-tricks)(\/|$)/.test(pathname)}>{children}</PublicRestaurantProvider>
          <DuneToaster />
        </FavoritesProvider>
      </AuthProvider>
    </CartProvider>
  );
}
