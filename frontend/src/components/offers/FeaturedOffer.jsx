import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { formatPrice } from "../../utils/currency.js";
import SmartImage from "../SmartImage.jsx";
import CountdownTimer from "./CountdownTimer.jsx";
import OfferBadge from "./OfferBadge.jsx";

const FeaturedOffer = ({ offer, onExpire }) => (
  <article className="relative overflow-hidden rounded-2xl border border-dune-amber/70 bg-[#0d0d0d] shadow-[0_24px_80px_-55px_rgba(245,158,11,0.8)]">
    <div className="grid min-h-[420px] lg:grid-cols-[0.95fr_0.62fr_1.25fr] lg:items-stretch">
      <div className="order-2 flex flex-col justify-center px-6 py-8 sm:px-9 lg:order-1 lg:px-10">
        <div>
          <OfferBadge>{offer.badge || "Featured Offer"}</OfferBadge>
        </div>
        <h3 className="mt-5 font-display text-5xl leading-[0.9] text-white sm:text-6xl">
          {offer.title}
        </h3>
        {offer.subtitle && (
          <p className="mt-2 font-display text-3xl leading-none text-dune-amber sm:text-4xl">
            {offer.subtitle}
          </p>
        )}
        <p className="mt-5 max-w-md text-sm leading-6 text-neutral-300">
          {offer.description}
        </p>

        {(offer.offerPrice !== null || offer.originalPrice !== null) && (
          <div className="mt-5 flex items-baseline gap-3">
            {offer.offerPrice !== null && (
              <span className="font-display text-3xl text-dune-amber">
                {formatPrice(offer.offerPrice)}
              </span>
            )}
            {offer.originalPrice !== null && (
              <span className="text-sm text-neutral-500 line-through">
                {formatPrice(offer.originalPrice)}
              </span>
            )}
          </div>
        )}

        <Link
          href={offer.ctaLink || "/menu"}
          className="group mt-7 inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-dune-amber to-dune-amberLight px-7 py-3 text-sm font-bold uppercase tracking-[0.08em] text-black shadow-amberGlow transition hover:brightness-110"
        >
          {offer.ctaText || "Order Now"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="order-3 flex flex-col justify-center gap-4 px-6 pb-8 sm:px-9 lg:order-2 lg:px-2 lg:py-10">
        <CountdownTimer expiresAt={offer.expiresAt} onExpire={onExpire} />
        {offer.promoCode && (
          <div className="rounded-lg border border-dune-amber/45 bg-black/70 p-3 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Use code
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 font-display text-2xl tracking-[0.08em] text-dune-amber">
              <Tag className="h-4 w-4" aria-hidden="true" />
              {offer.promoCode}
            </p>
          </div>
        )}
      </div>

      <figure className="relative order-1 min-h-[260px] overflow-hidden lg:order-3 lg:min-h-full">
        <SmartImage
          src={offer.image}
          alt={`${offer.title}${offer.subtitle ? ` — ${offer.subtitle}` : ""}`}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover transition-transform duration-700 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#0d0d0d] lg:via-transparent lg:to-transparent" />
        {offer.discountText && (
          <div className="absolute right-5 top-5 flex h-24 w-24 rotate-3 items-center justify-center rounded-full border-2 border-dune-amber bg-dune-amber text-center font-display text-2xl uppercase leading-[0.9] text-black shadow-amberGlow sm:h-28 sm:w-28 sm:text-3xl">
            <span className="max-w-[78px]">{offer.discountText}</span>
          </div>
        )}
      </figure>
    </div>
  </article>
);

export default FeaturedOffer;
