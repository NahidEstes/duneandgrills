import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { formatPrice } from "../../utils/currency.js";
import SmartImage from "../SmartImage.jsx";
import OfferBadge from "./OfferBadge.jsx";

const OfferCard = ({ offer }) => (
  <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-dune-border bg-[#111] transition duration-300 hover:-translate-y-1 hover:border-dune-amber/60 hover:shadow-amberGlow">
    <figure className="relative h-56 overflow-hidden">
      <SmartImage
        src={offer.image}
        alt={`${offer.title}${offer.subtitle ? ` — ${offer.subtitle}` : ""}`}
        width={900}
        height={560}
        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/20" />
      <div className="absolute left-4 top-4">
        <OfferBadge>{offer.badge || "Limited Time"}</OfferBadge>
      </div>
      {offer.discountText && (
        <div className="absolute bottom-3 right-3 flex h-20 w-20 items-center justify-center rounded-full border border-dune-amber bg-black/85 p-2 text-center font-display text-xl uppercase leading-none text-dune-amber backdrop-blur-sm">
          {offer.discountText}
        </div>
      )}
    </figure>

    <div className="flex flex-1 flex-col p-5">
      <h3 className="font-display text-3xl leading-none text-white">
        {offer.title}
      </h3>
      {offer.subtitle && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-dune-amber">
          {offer.subtitle}
        </p>
      )}
      <p className="mt-3 flex-1 text-sm leading-6 text-neutral-400">
        {offer.description}
      </p>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-dune-border pt-4">
        <div>
          {offer.offerPrice !== null && (
            <p className="font-display text-2xl text-dune-amber">
              {formatPrice(offer.offerPrice)}
            </p>
          )}
          {offer.originalPrice !== null && (
            <p className="text-xs text-neutral-600 line-through">
              {formatPrice(offer.originalPrice)}
            </p>
          )}
        </div>
        {offer.promoCode && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
            <Tag className="h-3.5 w-3.5 text-dune-amber" aria-hidden="true" />
            {offer.promoCode}
          </p>
        )}
      </div>

      <Link
        href={offer.ctaLink || "/menu"}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dune-amber/70 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-dune-amber transition hover:bg-dune-amber hover:text-black"
      >
        {offer.ctaText || "Order Now"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  </article>
);

export default OfferCard;
