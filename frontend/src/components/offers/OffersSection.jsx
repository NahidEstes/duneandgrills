"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { toast } from "sonner";
import { fetchOffers } from "../../api/api.js";
import { useCart } from "../../context/CartContext.jsx";
import FeaturedOffer from "./FeaturedOffer.jsx";
import OfferCard from "./OfferCard.jsx";

const OffersSection = ({ initialOffers = [], onCartOpen }) => {
  const { addItemsToCart, suggestCoupon } = useCart();
  const [offers, setOffers] = useState(initialOffers);
  const [status, setStatus] = useState(
    initialOffers.length ? "success" : "loading"
  );

  useEffect(() => {
    if (initialOffers.length) return undefined;

    let cancelled = false;
    fetchOffers()
      .then((data) => {
        if (!cancelled) {
          setOffers(data);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [initialOffers.length]);

  useEffect(() => {
    const removeExpired = () => {
      const now = Date.now();
      setOffers((current) => {
        const active = current.filter(
          (offer) => new Date(offer.expiresAt).getTime() > now
        );
        return active.length === current.length ? current : active;
      });
    };

    removeExpired();
    const interval = window.setInterval(removeExpired, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const removeExpiredOffer = useCallback((offerId) => {
    setOffers((current) => current.filter((offer) => offer._id !== offerId));
  }, []);

  const handleOrderNow = useCallback(
    (offer) => {
      const target = offer.orderProduct;
      if (!target?.product?._id) {
        toast.error("This offer is temporarily unavailable to order.");
        return;
      }

      addItemsToCart([
        {
          ...target.product,
          productType: target.productType,
          quantity: target.quantity || 1,
        },
      ]);
      if (offer.promoCode) suggestCoupon(offer.promoCode);
      onCartOpen?.();
      toast.success(
        offer.promoCode
          ? `Offer added — use ${offer.promoCode} at checkout.`
          : "Offer added to cart."
      );
    },
    [addItemsToCart, onCartOpen, suggestCoupon]
  );

  if (status === "success" && offers.length === 0) return null;

  const featured = offers.find((offer) => offer.isFeatured) || offers[0];
  const otherOffers = offers.filter((offer) => offer._id !== featured?._id);

  return (
    <section
      id="offers"
      aria-labelledby="offers-heading"
      className="relative overflow-hidden bg-[#080909] py-20 md:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(217,119,6,0.1),transparent_32%),radial-gradient(circle_at_85%_70%,rgba(146,64,14,0.09),transparent_28%)]" />
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-5 md:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-4 text-dune-amber">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-dune-amber/80 sm:w-32" />
            <span className="inline-flex items-center gap-2 font-display text-xl tracking-[0.24em] text-white sm:text-2xl">
              <Flame className="h-6 w-6 fill-dune-amber text-dune-amber" />
              DUNE <span className="text-dune-amber">&amp;</span> GRILLS
            </span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-dune-amber/80 sm:w-32" />
          </div>
          <h2
            id="offers-heading"
            className="mt-4 font-display text-5xl leading-none text-white sm:text-6xl md:text-7xl"
          >
            EXCLUSIVE <span className="text-gradient-amber">OFFERS</span>
          </h2>
          <p className="mt-4 text-sm text-neutral-400 sm:text-base">
            Delicious deals you don&apos;t want to miss.
          </p>
        </header>

        {status === "loading" && (
          <div className="mt-12 space-y-4" aria-label="Loading offers">
            <div className="h-[420px] animate-pulse rounded-2xl border border-dune-border bg-dune-surface" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[430px] animate-pulse rounded-2xl border border-dune-border bg-dune-surface"
                />
              ))}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-dune-border bg-dune-surface px-6 py-10 text-center">
            <p className="text-sm text-neutral-400">
              Our latest offers are temporarily unavailable. Please check again
              soon.
            </p>
          </div>
        )}

        {status === "success" && featured && (
          <div className="mt-12">
            <FeaturedOffer
              offer={featured}
              onExpire={() => removeExpiredOffer(featured._id)}
              onOrderNow={() => handleOrderNow(featured)}
            />

            {otherOffers.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {otherOffers.map((offer) => (
                  <OfferCard
                    key={offer._id}
                    offer={offer}
                    onOrderNow={() => handleOrderNow(offer)}
                  />
                ))}
              </div>
            )}

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-neutral-400">
              <Flame className="h-4 w-4 text-dune-amber" aria-hidden="true" />
              Hurry up! Offers are valid for a limited time only.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default OffersSection;
