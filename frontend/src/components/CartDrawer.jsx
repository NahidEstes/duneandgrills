import React, { useState } from "react";
import { X, Plus, Minus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext.jsx";
import { placeOrder } from "../api/api.js";

const CartDrawer = ({ open, onClose }) => {
  const {
    cart,
    incrementItem,
    decrementItem,
    removeFromCart,
    clearCart,
    subtotal,
  } = useCart();
  const [step, setStep] = useState("cart"); // cart | checkout | success
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await placeOrder({
        customer,
        items: cart.map((line) => ({
          menuItem: line._id,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
        })),
      });
      clearCart();
      setStep("success");
    } catch (err) {
      setError(
        "Couldn't place your order. Please make sure the API server is running."
      );
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("cart");
    setCustomer({ name: "", phone: "", address: "" });
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={reset}
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-dune-ink border-l border-dune-border z-[70] transform transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-dune-border">
          <h2 className="font-display text-2xl text-white tracking-wide">
            {step === "checkout"
              ? "Checkout"
              : step === "success"
              ? "Order Placed"
              : "Your Cart"}
          </h2>
          <button
            onClick={reset}
            aria-label="Close cart"
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "cart" && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500 gap-3">
                  <ShoppingBag className="w-10 h-10" />
                  <p>Your cart is empty. Add something delicious.</p>
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line._id}
                    className="flex gap-4 border-b border-dune-border pb-5"
                  >
                    <img
                      src={line.image}
                      alt={line.name}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-white truncate">
                          {line.name}
                        </h3>
                        <button
                          onClick={() => removeFromCart(line._id)}
                          className="text-neutral-500 hover:text-red-400 shrink-0"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-dune-amber text-sm mt-1">
                        ${line.price.toFixed(2)}
                      </p>

                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => decrementItem(line._id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-white text-sm w-4 text-center">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => incrementItem(line._id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-dune-border px-6 py-5">
                <div className="flex items-center justify-between text-white mb-4">
                  <span className="text-neutral-400">Subtotal</span>
                  <span className="font-display text-2xl text-dune-amber">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={() => setStep("checkout")}
                  className="w-full bg-dune-amber hover:bg-dune-amberLight text-black font-semibold py-3.5 rounded-full transition-colors"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </>
        )}

        {step === "checkout" && (
          <form
            onSubmit={handleCheckout}
            className="flex-1 overflow-y-auto px-6 py-5 flex flex-col"
          >
            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Full Name
                </label>
                <input
                  required
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none text-sm"
                  placeholder="Your Name"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Phone Number
                </label>
                <input
                  required
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none text-sm"
                  placeholder="Your Number"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Delivery Address (optional for pickup)
                </label>
                <textarea
                  rows={3}
                  value={customer.address}
                  onChange={(e) =>
                    setCustomer({ ...customer, address: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-3 text-white focus:border-dune-amber outline-none resize-none text-sm"
                  placeholder="Your Address..."
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="border-t border-dune-border pt-5 mt-5">
              <div className="flex items-center justify-between text-white mb-4">
                <span className="text-neutral-400">Total</span>
                <span className="font-display text-2xl text-dune-amber">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-dune-amber hover:bg-dune-amberLight disabled:opacity-60 text-black font-semibold py-3.5 rounded-full transition-colors"
              >
                {submitting ? "Placing Order..." : "Place Order"}
              </button>
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="w-full mt-3 text-sm text-neutral-400 hover:text-white"
              >
                Back to cart
              </button>
            </div>
          </form>
        )}

        {step === "success" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-dune-amber/10 border border-dune-amber flex items-center justify-center">
              <ShoppingBag className="w-7 h-7 text-dune-amber" />
            </div>
            <h3 className="text-xl font-semibold text-white">
              Thanks — your order is in!
            </h3>
            <p className="text-neutral-400 text-sm">
              We&apos;re firing up the grill. You&apos;ll get a call to confirm
              details shortly.
            </p>
            <button
              onClick={reset}
              className="mt-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-6 py-3 rounded-full transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

export default CartDrawer;
