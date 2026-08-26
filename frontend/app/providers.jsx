"use client";

import { AuthProvider } from "@/src/context/AuthContext.jsx";
import { CartProvider } from "@/src/context/CartContext.jsx";
import { FavoritesProvider } from "@/src/context/FavoritesContext.jsx";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>{children}</CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
