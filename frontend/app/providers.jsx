"use client";

import { AuthProvider } from "@/src/context/AuthContext.jsx";
import { CartProvider } from "@/src/context/CartContext.jsx";
import { FavoritesProvider } from "@/src/context/FavoritesContext.jsx";
import PwaExperience from "@/src/components/pwa/PwaExperience.jsx";
import DuneToaster from "@/src/components/ui/DuneToaster.jsx";
import { usePathname } from "next/navigation";

export default function Providers({ children }) {
  const pathname = usePathname();
  // The read-only second monitor must not load auth, cart, or customer data.
  if (pathname === "/pos/customer-display") return <><PwaExperience />{children}</>;
  return (
    <CartProvider>
      <AuthProvider>
        <FavoritesProvider>
          <PwaExperience />
          {children}
          <DuneToaster />
        </FavoritesProvider>
      </AuthProvider>
    </CartProvider>
  );
}
