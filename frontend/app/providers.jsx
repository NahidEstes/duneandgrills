"use client";

import { AuthProvider } from "@/src/context/AuthContext.jsx";
import { CartProvider } from "@/src/context/CartContext.jsx";
import { FavoritesProvider } from "@/src/context/FavoritesContext.jsx";
import { Toaster } from "sonner";
import { usePathname } from "next/navigation";

export default function Providers({ children }) {
  const pathname = usePathname();
  // The read-only second monitor must not load auth, cart, or customer data.
  if (pathname === "/pos/customer-display") return children;
  return (
    <CartProvider>
      <AuthProvider>
        <FavoritesProvider>
          {children}
          <Toaster
            position="top-right"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "#121110",
                border: "1px solid #2A2320",
                color: "#f5f5f5",
              },
            }}
          />
        </FavoritesProvider>
      </AuthProvider>
    </CartProvider>
  );
}
