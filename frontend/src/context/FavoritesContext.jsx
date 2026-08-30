"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import {
  addFavorite as addFavoriteRequest,
  addComboFavorite,
  fetchFavorites,
  removeFavorite as removeFavoriteRequest,
  removeComboFavorite,
} from "../api/api.js";

const FavoritesContext = createContext(null);

export const FavoritesProvider = ({ children }) => {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      return [];
    }
    setLoading(true);
    try {
      const items = await fetchFavorites();
      setFavorites(items);
      return items;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshFavorites().catch(() => setFavorites([]));
  }, [refreshFavorites]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((item) => item._id)),
    [favorites]
  );

  const toggleFavorite = async (item) => {
    if (!user) return { requiresLogin: true };
    const wasFavorite = favoriteIds.has(item._id);

    setFavorites((current) =>
      wasFavorite
        ? current.filter((favorite) => favorite._id !== item._id)
        : [...current, item]
    );

    try {
      if (wasFavorite) {
        await (item.productType === "combo"
          ? removeComboFavorite(item._id)
          : removeFavoriteRequest(item._id));
      } else {
        const storedItem = await (item.productType === "combo"
          ? addComboFavorite(item._id)
          : addFavoriteRequest(item._id));
        setFavorites((current) =>
          current.map((favorite) =>
            favorite._id === storedItem._id ? storedItem : favorite
          )
        );
      }
      return { favorite: !wasFavorite };
    } catch (error) {
      await refreshFavorites().catch(() => {});
      throw error;
    }
  };

  return (
    <FavoritesContext.Provider
      value={{ favorites, favoriteIds, loading, toggleFavorite, refreshFavorites }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
};
