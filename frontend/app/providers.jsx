"use client";

import { AuthProvider } from "@/src/context/AuthContext.jsx";
import { CartProvider } from "@/src/context/CartContext.jsx";
import { FavoritesProvider } from "@/src/context/FavoritesContext.jsx";
import { Toaster } from "sonner";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>
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
        </CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
