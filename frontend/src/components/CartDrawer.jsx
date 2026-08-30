"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Pencil,
  Check,
  AlertTriangle,
  LoaderCircle,
  PackageCheck,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { formatPrice } from "../utils/currency.js";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  cancelRewardRedemption,
  fetchOrderConfig,
  placeOrder,
  updateMe,
} from "../api/api.js";
import LoginPromptModal from "./LoginPromptModal.jsx";
import SmartImage from "./SmartImage.jsx";

const ORDER_TYPE_ICONS = {
  "dine-in": UtensilsCrossed,
  pickup: PackageCheck,
  delivery: Truck,
};

const OrderTypeSelector = ({ options, value, onChange, disabled = false }) => (
  <fieldset disabled={disabled}>
    <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
      Order Type
    </legend>
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const Icon = ORDER_TYPE_ICONS[option.value] || ShoppingBag;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-dune-amber bg-dune-amber/10 text-dune-amber"
                : "border-dune-border bg-black/30 text-neutral-400 hover:border-dune-amber/60 hover:text-dune-amber"
            }`}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

const CartDrawer = ({ open, onClose }) => {
  const {
    cart,
    incrementItem,
    decrementItem,
    removeFromCart,
    clearCart,
    subtotal,
    cartReady,
    syncing,
    syncError,
    dismissCartError,
  } = useCart();
  const { user, setUser } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState("cart"); // cart | checkout | success
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [editPhone, setEditPhone] = useState(false);
  const [editAddress, setEditAddress] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [orderType, setOrderType] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");

  const loadOrderConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const config = await fetchOrderConfig();
      setOrderConfig(config);
      setOrderType((current) =>
        config.orderTypes.some((option) => option.value === current)
          ? current
          : config.defaultOrderType
      );
    } catch (requestError) {
      setConfigError(
        requestError.response?.data?.message ||
          "Order options could not be loaded."
      );
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrderConfig();
  }, [loadOrderConfig]);

  const selectedOrderType = orderConfig?.orderTypes.find(
    (option) => option.value === orderType
  );
  const deliveryFee = Number(selectedOrderType?.deliveryFee) || 0;
  const orderTotal = Number((subtotal + deliveryFee).toFixed(2));

  // Prefill checkout fields from the logged-in user's saved profile
  useEffect(() => {
    if (user) {
      setCustomer({
        name: user.name || "",
        phone: user.phone || "",
        address: user.address || "",
      });
    }
  }, [user, step]);

  const handleProceed = () => {
    if (!orderConfig || !orderType) return;
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setStep("checkout");
  };

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    setStep("checkout");
  };

  const handleFieldSave = async (field) => {
    setSavingField(true);
    setError("");
    try {
      const updated = await updateMe({ [field]: customer[field] });
      setUser(updated);
      if (field === "phone") setEditPhone(false);
      if (field === "address") setEditAddress(false);
    } catch (err) {
      setError("Couldn't save your changes. Please try again.");
    } finally {
      setSavingField(false);
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const order = await placeOrder({
        customer: {
          ...customer,
          address: orderType === "delivery" ? customer.address : "",
        },
        orderType,
        items: cart
          .filter((line) => !line.isReward)
          .map((line) => ({
            productId: line._id,
            productType: line.productType || "menuItem",
            quantity: line.quantity,
          })),
        rewardRedemptionId:
          cart.find((line) => line.isReward)?.rewardRedemptionId || undefined,
      });
      setPlacedOrder(order);
      clearCart();
      setStep("success");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Couldn't place your order. Please make sure the API server is running."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveLine = async (line) => {
    if (line.isReward && line.rewardRedemptionId) {
      try {
        await cancelRewardRedemption(line.rewardRedemptionId);
        toast.success("Reward removed and your points were returned.");
      } catch (requestError) {
        if ([404, 409].includes(requestError.response?.status)) {
          removeFromCart(line._id);
          toast.info("This reward reservation is no longer active.");
          return;
        }
        toast.error(
          requestError.response?.data?.message ||
            "The reward could not be removed from your cart."
        );
        return;
      }
    }
    removeFromCart(line._id);
  };

  const reset = () => {
    setStep("cart");
    setEditPhone(false);
    setEditAddress(false);
    setError("");
    onClose();
  };

  return (
    <>
      <div
        onClick={reset}
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

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
              {syncError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3 text-xs text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 flex-1">{syncError}</p>
                  <button
                    type="button"
                    onClick={dismissCartError}
                    aria-label="Dismiss cart error"
                    className="text-red-300 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {!cartReady ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-neutral-500">
                  <LoaderCircle className="h-8 w-8 animate-spin text-dune-amber" />
                  <p>Loading your saved cart...</p>
                </div>
              ) : cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500 gap-3">
                  <ShoppingBag className="w-10 h-10" />
                  <p>Your cart is empty. Add something delicious.</p>
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={`${line.productType || "menuItem"}-${line._id}`}
                    className="flex gap-4 border-b border-dune-border pb-5"
                  >
                    <SmartImage
                      src={line.image}
                      alt={line.name}
                      width={128}
                      height={128}
                      sizes="64px"
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-white truncate">
                          {line.name}
                        </h3>
                        <button
                          onClick={() => handleRemoveLine(line)}
                          className="text-neutral-500 hover:text-red-400 shrink-0"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* <p className="text-dune-amber text-sm mt-1">
                        ${line.price.toFixed(2)}
                      </p> */}
                      <p className="text-dune-amber text-sm mt-1">
                        {line.isReward ? "Points Reward · FREE" : formatPrice(line.price)}
                      </p>
                      {line.productType === "combo" && line.includedItems?.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-neutral-500">
                          {line.includedItems
                            .map(
                              (entry) =>
                                `${entry.menuItem?.name || "Item"} ×${entry.quantity}`
                            )
                            .join(" · ")}
                        </p>
                      )}

                      {!line.isReward && <div className="mt-2 flex items-center gap-3">
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
                      </div>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {cartReady && cart.length > 0 && (
              <div className="space-y-4 border-t border-dune-border px-6 py-5">
                {configLoading && (
                  <p className="flex items-center gap-2 text-xs text-neutral-500">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-dune-amber" />
                    Loading order options...
                  </p>
                )}
                {configError && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3 text-xs text-red-200">
                    <span>{configError}</span>
                    <button
                      type="button"
                      onClick={loadOrderConfig}
                      className="shrink-0 font-semibold text-dune-amber hover:text-dune-amberLight"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {orderConfig && (
                  <OrderTypeSelector
                    options={orderConfig.orderTypes}
                    value={orderType}
                    onChange={setOrderType}
                    disabled={submitting}
                  />
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex items-center justify-between text-neutral-400">
                      <span>Delivery fee</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-dune-border pt-3 text-white">
                    <span>Total</span>
                    <span className="font-display text-2xl text-dune-amber">
                      {formatPrice(orderTotal)}
                    </span>
                  </div>
                </div>
                {syncing && (
                  <p className="flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> Saving cart...
                  </p>
                )}
                <button
                  onClick={handleProceed}
                  disabled={!orderConfig || configLoading}
                  className="w-full rounded-full bg-dune-amber py-3.5 font-semibold text-black transition-colors hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="space-y-5 flex-1">
              {orderConfig && (
                <OrderTypeSelector
                  options={orderConfig.orderTypes}
                  value={orderType}
                  onChange={setOrderType}
                  disabled={submitting}
                />
              )}

              {/* Name — always read-only, tied to the account */}
              <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Full Name
                </label>
                <input
                  disabled
                  value={customer.name}
                  className="w-full rounded-lg bg-black/60 border border-dune-border px-4 py-3 text-neutral-300 cursor-not-allowed"
                />
              </div>

              {/* Phone — editable via Edit/Save toggle */}
              <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Phone Number
                </label>
                <input
                  required
                  disabled={!editPhone}
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  className={`w-full rounded-lg border px-4 py-3 outline-none transition-colors ${
                    editPhone
                      ? "bg-black border-dune-amber text-white"
                      : "bg-black/60 border-dune-border text-neutral-300 cursor-not-allowed"
                  }`}
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    disabled={savingField}
                    onClick={() =>
                      editPhone ? handleFieldSave("phone") : setEditPhone(true)
                    }
                    className="inline-flex items-center gap-1 text-xs text-dune-amber hover:text-dune-amberLight"
                  >
                    {editPhone ? (
                      <>
                        <Check className="w-3 h-3" />{" "}
                        {savingField ? "Saving..." : "Save"}
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3 h-3" /> Edit
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Delivery address is only needed for delivery orders. */}
              {orderType === "delivery" && <div>
                <label className="block text-sm text-neutral-400 mb-1.5">
                  Delivery Address
                </label>
                <textarea
                  required
                  rows={3}
                  disabled={!editAddress}
                  value={customer.address}
                  onChange={(e) =>
                    setCustomer({ ...customer, address: e.target.value })
                  }
                  className={`w-full rounded-lg border px-4 py-3 outline-none resize-none transition-colors ${
                    editAddress
                      ? "bg-black border-dune-amber text-white"
                      : "bg-black/60 border-dune-border text-neutral-300 cursor-not-allowed"
                  }`}
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    disabled={savingField}
                    onClick={() =>
                      editAddress
                        ? handleFieldSave("address")
                        : setEditAddress(true)
                    }
                    className="inline-flex items-center gap-1 text-xs text-dune-amber hover:text-dune-amberLight"
                  >
                    {editAddress ? (
                      <>
                        <Check className="w-3 h-3" />{" "}
                        {savingField ? "Saving..." : "Save"}
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3 h-3" /> Edit
                      </>
                    )}
                  </button>
                </div>
              </div>}

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="mt-5 border-t border-dune-border pt-5">
              <div className="mb-4 space-y-2 text-sm">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>Delivery fee</span>
                    <span>{formatPrice(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-dune-border pt-3 text-white">
                  <span>Total</span>
                  <span className="font-display text-2xl text-dune-amber">
                    {formatPrice(orderTotal)}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !orderConfig}
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
            {placedOrder && (
              <p className="text-dune-amber text-sm font-medium">
                Order #{placedOrder.orderNumber}
              </p>
            )}
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

      {showLoginModal && (
        <LoginPromptModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
          onGoRegister={() => {
            setShowLoginModal(false);
            onClose();
            router.push("/login");
          }}
        />
      )}
    </>
  );
};

export default CartDrawer;
