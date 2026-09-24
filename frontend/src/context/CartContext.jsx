"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  addItemToCart,
  clearUserCart,
  fetchUserCart,
  migrateCart as migrateCartRequest,
  removeCartItem,
  updateCartItem,
} from "../api/api.js";

const CartContext = createContext(null);

const GUEST_CART_KEY = "dg_cart_guest";
const USER_CART_KEY_PREFIX = "dg_cart_user:";
const GUEST_COUPON_KEY = "dg_coupon_guest";
const USER_COUPON_KEY_PREFIX = "dg_coupon_user:";
const MAX_CART_QUANTITY = 99;
const objectIdPattern = /^[a-f\d]{24}$/i;

const userCartKey = (userId) => `${USER_CART_KEY_PREFIX}${userId}`;
const userCouponKey = (userId) => `${USER_COUPON_KEY_PREFIX}${userId}`;
const productTypeOf = (line) =>
  line?.productType === "combo" ? "combo" : "menuItem";
const addOnId = (addOn) => String(addOn?._id || addOn?.addOn || addOn || "");
const addOnRequest = (addOn) => ({
  id: addOnId(addOn),
  quantity: Math.max(1, Math.min(99, Number(addOn?.quantity) || 1)),
});
const customizationKeyOf = (line = {}) => {
  if (typeof line.customizationKey === "string") return line.customizationKey;
  const addOns = (line.selectedAddOns || []).map(addOnRequest).filter((addOn) => addOn.id).sort((a, b) => a.id.localeCompare(b.id));
  const spiceLevel = line.spiceLevel || "";
  const note = line.note || "";
  if (!addOns.length && !spiceLevel && !note) return "";
  return JSON.stringify({
    addOns,
    spiceLevel,
    note,
  });
};
const lineKey = (line) =>
  `${productTypeOf(line)}:${line._id}:${customizationKeyOf(line)}`;
const matchesLine = (line, locator) =>
  typeof locator === "object" && locator
    ? lineKey(line) === lineKey(locator)
    : String(line.cartLineId || "") === String(locator) || line._id === locator;

const normalizeLine = (line) => {
  if (!line || typeof line !== "object" || !line._id) return null;
  const quantity = Number(line.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  return {
    _id: String(line._id),
    name: typeof line.name === "string" ? line.name : "Menu item",
    description:
      typeof line.description === "string" ? line.description : "",
    price: Number.isFinite(Number(line.price)) ? Number(line.price) : 0,
    basePrice: Number.isFinite(Number(line.basePrice))
      ? Number(line.basePrice)
      : Number.isFinite(Number(line.price))
        ? Number(line.price)
        : 0,
    image: typeof line.image === "string" ? line.image : "",
    category: typeof line.category === "string" ? line.category : "",
    tags: Array.isArray(line.tags) ? line.tags : [],
    isAvailable: line.isAvailable !== false,
    isFeatured: Boolean(line.isFeatured),
    calories: Number(line.calories) || 0,
    ingredients: Array.isArray(line.ingredients) ? line.ingredients : [],
    productType: productTypeOf(line),
    regularPrice: Number(line.regularPrice) || Number(line.price) || 0,
    comboPrice: Number(line.comboPrice) || Number(line.price) || 0,
    discountAmount: Number(line.discountAmount) || 0,
    discountPercentage: Number(line.discountPercentage) || 0,
    includedItems: Array.isArray(line.includedItems)
      ? line.includedItems
      : Array.isArray(line.items)
        ? line.items
        : [],
    isReward: Boolean(line.isReward),
    rewardRedemptionId:
      typeof line.rewardRedemptionId === "string"
        ? line.rewardRedemptionId
        : undefined,
    menuItem: line.menuItem,
    cartLineId:
      typeof line.cartLineId === "string" ? line.cartLineId : undefined,
    selectedAddOns: Array.isArray(line.selectedAddOns)
      ? line.selectedAddOns
          .map((addOn) => ({
            _id: addOnId(addOn),
            name: typeof addOn?.name === "string" ? addOn.name : "Add-on",
            image: typeof addOn?.image === "string" ? addOn.image : "",
            price: Number(addOn?.price) || 0,
            quantity: Math.max(1, Math.min(99, Number(addOn?.quantity) || 1)),
          }))
          .filter((addOn) => addOn._id)
      : [],
    spiceLevel: typeof line.spiceLevel === "string" ? line.spiceLevel : "",
    note: typeof line.note === "string" ? line.note.slice(0, 240) : "",
    customizationKey: customizationKeyOf(line),
    quantity: Math.min(quantity, MAX_CART_QUANTITY),
  };
};

const normalizeCart = (items) => {
  if (!Array.isArray(items)) return [];
  const unique = new Map();
  items.forEach((item) => {
    const normalized = normalizeLine(item);
    if (normalized) unique.set(lineKey(normalized), normalized);
  });
  return [...unique.values()];
};

const readCart = (key) => {
  if (typeof window === "undefined") return [];
  try {
    return normalizeCart(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    localStorage.removeItem(key);
    return [];
  }
};

const writeCart = (key, items) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(items));
};

const readCoupon = (key) => {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(key) || "").trim().toUpperCase();
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case "REPLACE":
      return normalizeCart(action.payload);
    case "ADD_ITEM": {
      const item = normalizeLine({
        ...action.payload,
        quantity: Math.min(
          MAX_CART_QUANTITY,
          Math.max(1, Number(action.payload.quantity) || 1)
        ),
      });
      if (!item) return state;
      const existing = state.find((line) => lineKey(line) === lineKey(item));
      if (existing) {
        if (existing.isReward) return state;
        return state.map((line) =>
          lineKey(line) === lineKey(item)
            ? {
                ...line,
                quantity: Math.min(
                  MAX_CART_QUANTITY,
                  line.quantity + item.quantity
                ),
              }
            : line
        );
      }
      return [...state, item];
    }
    case "ADD_ITEMS":
      return action.payload.reduce((nextState, rawItem) => {
        const quantity = Math.min(
          MAX_CART_QUANTITY,
          Math.max(1, Number(rawItem.quantity) || 1)
        );
        const item = normalizeLine({ ...rawItem, quantity });
        if (!item) return nextState;
        const existing = nextState.find((line) => lineKey(line) === lineKey(item));
        if (existing) {
          if (existing.isReward) return nextState;
          return nextState.map((line) =>
            lineKey(line) === lineKey(item)
              ? {
                  ...line,
                  quantity: Math.min(
                    MAX_CART_QUANTITY,
                    line.quantity + quantity
                  ),
                }
              : line
          );
        }
        return [...nextState, item];
      }, state);
    case "INCREMENT":
      return state.map((line) =>
        matchesLine(line, action.payload) && !line.isReward
          ? {
              ...line,
              quantity: Math.min(MAX_CART_QUANTITY, line.quantity + 1),
            }
          : line
      );
    case "DECREMENT":
      return state
        .map((line) =>
          matchesLine(line, action.payload) && !line.isReward
            ? { ...line, quantity: line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0);
    case "REMOVE_ITEM":
      return state.filter((line) => !matchesLine(line, action.payload));
    case "CLEAR":
      return [];
    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [cartReady, setCartReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [suggestedCouponCode, setSuggestedCouponCode] = useState("");
  const cartRef = useRef([]);
  const scopeRef = useRef({ type: "initializing", userId: null });
  const sessionVersionRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const pendingSyncRef = useRef(0);
  const syncQueueRef = useRef(Promise.resolve());

  const persistCurrentScope = useCallback((items) => {
    const scope = scopeRef.current;
    if (scope.type === "guest") writeCart(GUEST_CART_KEY, items);
    if (scope.type === "user" && scope.userId) {
      writeCart(userCartKey(scope.userId), items);
    }
  }, []);

  const persistCouponForCurrentScope = useCallback((code) => {
    const scope = scopeRef.current;
    const key =
      scope.type === "user" && scope.userId
        ? userCouponKey(scope.userId)
        : GUEST_COUPON_KEY;
    if (code) localStorage.setItem(key, code);
    else localStorage.removeItem(key);
  }, []);

  const suggestCoupon = useCallback(
    (code) => {
      const normalized =
        typeof code === "string" ? code.trim().toUpperCase() : "";
      setSuggestedCouponCode(normalized);
      persistCouponForCurrentScope(normalized);
    },
    [persistCouponForCurrentScope]
  );

  const removeSuggestedCoupon = useCallback(() => {
    setSuggestedCouponCode("");
    persistCouponForCurrentScope("");
  }, [persistCouponForCurrentScope]);

  const commitCart = useCallback(
    (items, { persist = true } = {}) => {
      const normalized = normalizeCart(items);
      cartRef.current = normalized;
      dispatch({ type: "REPLACE", payload: normalized });
      if (persist) persistCurrentScope(normalized);
      return normalized;
    },
    [persistCurrentScope]
  );

  const applyLocalAction = useCallback(
    (action) => commitCart(cartReducer(cartRef.current, action)),
    [commitCart]
  );

  const withCurrentRewards = useCallback((serverCart) => {
    const rewards = cartRef.current.filter((line) => line.isReward);
    return [...normalizeCart(serverCart), ...rewards];
  }, []);

  const enqueueUserSync = useCallback(
    (task) => {
      const scope = scopeRef.current;
      if (scope.type !== "user" || !scope.userId) return;

      const sessionVersion = sessionVersionRef.current;
      const mutationVersion = ++mutationVersionRef.current;
      let taskFailed = false;
      pendingSyncRef.current += 1;
      setSyncing(true);
      setSyncError("");

      syncQueueRef.current = syncQueueRef.current
        .then(async () => {
          if (sessionVersion !== sessionVersionRef.current) return;
          await task();
        })
        .catch((error) => {
          if (sessionVersion !== sessionVersionRef.current) return;
          taskFailed = true;
          setSyncError(
            error.response?.data?.message ||
              "Your cart could not be synchronized. Please try again."
          );
        })
        .finally(async () => {
          pendingSyncRef.current = Math.max(0, pendingSyncRef.current - 1);
          if (
            pendingSyncRef.current !== 0 ||
            sessionVersion !== sessionVersionRef.current
          ) {
            return;
          }

          try {
            const serverCart = await fetchUserCart();
            if (
              sessionVersion === sessionVersionRef.current &&
              mutationVersion === mutationVersionRef.current
            ) {
              commitCart(withCurrentRewards(serverCart));
              if (!taskFailed) setSyncError("");
            }
          } catch (error) {
            if (sessionVersion === sessionVersionRef.current) {
              setSyncError(
                error.response?.data?.message ||
                  "Your saved cart could not be refreshed."
              );
            }
          } finally {
            if (
              sessionVersion === sessionVersionRef.current &&
              pendingSyncRef.current === 0
            ) {
              setSyncing(false);
            }
          }
        });
    },
    [commitCart, withCurrentRewards]
  );

  const restoreGuestCart = useCallback(() => {
    sessionVersionRef.current += 1;
    mutationVersionRef.current = 0;
    pendingSyncRef.current = 0;
    scopeRef.current = { type: "guest", userId: null };
    setSyncing(false);
    setSyncError("");
    commitCart(readCart(GUEST_CART_KEY));
    setSuggestedCouponCode(readCoupon(GUEST_COUPON_KEY));
    setCartReady(true);
  }, [commitCart]);

  const restoreUserCart = useCallback(
    async (userId) => {
      const sessionVersion = ++sessionVersionRef.current;
      mutationVersionRef.current = 0;
      pendingSyncRef.current = 0;
      scopeRef.current = { type: "user", userId };
      setCartReady(false);
      setSyncing(false);
      setSyncError("");

      const cachedCart = readCart(userCartKey(userId));
      commitCart(cachedCart);
      setSuggestedCouponCode(readCoupon(userCouponKey(userId)));

      try {
        const serverCart = await fetchUserCart();
        if (sessionVersion === sessionVersionRef.current) {
          commitCart(serverCart);
          setCartReady(true);
        }
        return serverCart;
      } catch (error) {
        if (sessionVersion === sessionVersionRef.current) {
          setSyncError(
            error.response?.data?.message ||
              "Your saved cart could not be loaded. Showing the local copy."
          );
          setCartReady(true);
        }
        throw error;
      }
    },
    [commitCart]
  );

  const migrateGuestCart = useCallback(
    async (userId) => {
      const guestCart = readCart(GUEST_CART_KEY);
      const guestCoupon = readCoupon(GUEST_COUPON_KEY);
      const migrationItems = guestCart
        .filter((line) => !line.isReward && objectIdPattern.test(line._id))
        .map((line) => ({
          menuItem: line._id,
          productId: line._id,
          productType: productTypeOf(line),
          quantity: line.quantity,
          ...(line.customizationKey
            ? {
                customization: {
                  selectedAddOns: line.selectedAddOns.map(addOnRequest),
                  spiceLevel: line.spiceLevel,
                  note: line.note,
                },
              }
            : {}),
        }));
      const sessionVersion = ++sessionVersionRef.current;
      mutationVersionRef.current = 0;
      pendingSyncRef.current = 0;
      scopeRef.current = { type: "user", userId };
      setCartReady(false);
      setSyncing(false);
      setSyncError("");

      try {
        const mergedCart = await migrateCartRequest(migrationItems);
        if (sessionVersion === sessionVersionRef.current) {
          localStorage.removeItem(GUEST_CART_KEY);
          localStorage.removeItem(GUEST_COUPON_KEY);
          commitCart(mergedCart);
          setSuggestedCouponCode(guestCoupon);
          if (guestCoupon) {
            localStorage.setItem(userCouponKey(userId), guestCoupon);
          }
          setCartReady(true);
        }
        return mergedCart;
      } catch (migrationError) {
        if (sessionVersion === sessionVersionRef.current) {
          setSyncError(
            migrationError.response?.data?.message ||
              "Your guest cart could not be merged. Your saved cart is still available."
          );
          try {
            commitCart(await fetchUserCart());
          } catch {
            commitCart(readCart(userCartKey(userId)));
          }
          setCartReady(true);
        }
        throw migrationError;
      }
    },
    [commitCart]
  );

  const clearCartOnLogout = useCallback((userId) => {
    sessionVersionRef.current += 1;
    mutationVersionRef.current = 0;
    pendingSyncRef.current = 0;
    scopeRef.current = { type: "initializing", userId: null };
    cartRef.current = [];
    dispatch({ type: "CLEAR" });
    localStorage.removeItem(GUEST_CART_KEY);
    localStorage.removeItem(GUEST_COUPON_KEY);
    if (userId) localStorage.removeItem(userCartKey(userId));
    if (userId) localStorage.removeItem(userCouponKey(userId));
    scopeRef.current = { type: "guest", userId: null };
    setSyncing(false);
    setSyncError("");
    setSuggestedCouponCode("");
    setCartReady(true);
  }, []);

  const addToCart = useCallback(
    (item) => {
      const current = cartRef.current.find(
        (line) => lineKey(line) === lineKey(item)
      );
      const requestedQuantity = Math.min(
        MAX_CART_QUANTITY,
        Math.max(1, Number(item.quantity) || 1)
      );
      if (
        current &&
        (current.isReward || current.quantity + requestedQuantity > MAX_CART_QUANTITY)
      ) {
        return false;
      }
      applyLocalAction({ type: "ADD_ITEM", payload: item });
      if (!item.isReward && objectIdPattern.test(item._id)) {
        enqueueUserSync(() =>
          addItemToCart(
            item._id,
            requestedQuantity,
            productTypeOf(item),
            customizationKeyOf(item)
              ? {
                  selectedAddOns: (item.selectedAddOns || []).map(addOnRequest),
                  spiceLevel: item.spiceLevel || "",
                  note: item.note || "",
                }
              : undefined
          )
        );
      }
      return true;
    },
    [applyLocalAction, enqueueUserSync]
  );

  const addItemsToCart = useCallback(
    (items) => {
      applyLocalAction({ type: "ADD_ITEMS", payload: items });
      const regularItems = items
        .filter((item) => !item.isReward && objectIdPattern.test(item._id))
        .map((item) => ({
          menuItem: item._id,
          productId: item._id,
          productType: productTypeOf(item),
          quantity: Math.min(
            MAX_CART_QUANTITY,
            Math.max(1, Number(item.quantity) || 1)
          ),
          ...(customizationKeyOf(item)
            ? {
                customization: {
                  selectedAddOns: (item.selectedAddOns || []).map(addOnRequest),
                  spiceLevel: item.spiceLevel || "",
                  note: item.note || "",
                },
              }
            : {}),
        }));

      if (regularItems.length) {
        enqueueUserSync(async () => {
          for (const item of regularItems) {
            await addItemToCart(
              item.productId,
              item.quantity,
              item.productType,
              item.customization
            );
          }
        });
      }
    },
    [applyLocalAction, enqueueUserSync]
  );

  const incrementItem = useCallback(
    (locator) => {
      const current = cartRef.current.find((line) => matchesLine(line, locator));
      if (
        !current ||
        current.isReward ||
        current.quantity >= MAX_CART_QUANTITY
      ) {
        return;
      }
      applyLocalAction({ type: "INCREMENT", payload: current });
      if (objectIdPattern.test(current._id)) {
        enqueueUserSync(() =>
          updateCartItem(
            current._id,
            current.quantity + 1,
            productTypeOf(current),
            current.cartLineId
          )
        );
      }
    },
    [applyLocalAction, enqueueUserSync]
  );

  const decrementItem = useCallback(
    (locator) => {
      const current = cartRef.current.find((line) => matchesLine(line, locator));
      if (!current || current.isReward) return;
      const quantity = current.quantity - 1;
      applyLocalAction({ type: "DECREMENT", payload: current });
      if (objectIdPattern.test(current._id)) {
        enqueueUserSync(() =>
          quantity > 0
            ? updateCartItem(current._id, quantity, productTypeOf(current), current.cartLineId)
            : removeCartItem(current._id, productTypeOf(current), current.cartLineId)
        );
      }
    },
    [applyLocalAction, enqueueUserSync]
  );

  const removeFromCart = useCallback(
    (locator) => {
      const current = cartRef.current.find((line) => matchesLine(line, locator));
      if (!current) return;
      applyLocalAction({ type: "REMOVE_ITEM", payload: current });
      if (!current.isReward && objectIdPattern.test(current._id)) {
        enqueueUserSync(() =>
          removeCartItem(current._id, productTypeOf(current), current.cartLineId)
        );
      }
    },
    [applyLocalAction, enqueueUserSync]
  );

  const clearCart = useCallback(() => {
    applyLocalAction({ type: "CLEAR" });
    removeSuggestedCoupon();
    enqueueUserSync(clearUserCart);
  }, [applyLocalAction, enqueueUserSync, removeSuggestedCoupon]);

  const itemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );

  const value = {
    cart,
    addToCart,
    addItemsToCart,
    incrementItem,
    decrementItem,
    removeFromCart,
    clearCart,
    itemCount,
    subtotal,
    cartReady,
    syncing,
    syncError,
    dismissCartError: () => setSyncError(""),
    restoreGuestCart,
    restoreUserCart,
    migrateGuestCart,
    clearCartOnLogout,
    suggestedCouponCode,
    suggestCoupon,
    removeSuggestedCoupon,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
};
