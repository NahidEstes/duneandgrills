import React, { createContext, useContext, useMemo, useReducer } from "react";

const CartContext = createContext(null);

const cartReducer = (state, action) => {
  switch (action.type) {
    case "ADD_ITEM": {
      const item = action.payload;
      const existing = state.find((line) => line._id === item._id);
      if (existing) {
        return state.map((line) =>
          line._id === item._id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...state, { ...item, quantity: 1 }];
    }
    case "INCREMENT":
      return state.map((line) =>
        line._id === action.payload ? { ...line, quantity: line.quantity + 1 } : line
      );
    case "DECREMENT":
      return state
        .map((line) =>
          line._id === action.payload ? { ...line, quantity: line.quantity - 1 } : line
        )
        .filter((line) => line.quantity > 0);
    case "REMOVE_ITEM":
      return state.filter((line) => line._id !== action.payload);
    case "CLEAR":
      return [];
    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [cart, dispatch] = useReducer(cartReducer, []);

  const addToCart = (item) => dispatch({ type: "ADD_ITEM", payload: item });
  const incrementItem = (id) => dispatch({ type: "INCREMENT", payload: id });
  const decrementItem = (id) => dispatch({ type: "DECREMENT", payload: id });
  const removeFromCart = (id) => dispatch({ type: "REMOVE_ITEM", payload: id });
  const clearCart = () => dispatch({ type: "CLEAR" });

  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );

  const value = {
    cart,
    addToCart,
    incrementItem,
    decrementItem,
    removeFromCart,
    clearCart,
    itemCount,
    subtotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};
