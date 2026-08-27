import { Clock3, Flame, Gem, Star } from "lucide-react";

const BadgeIcon = ({ badge = "" }) => {
  const value = badge.toLowerCase();
  const iconClass = "h-3.5 w-3.5";

  if (value.includes("feature") || value.includes("special")) {
    return <Star className={iconClass} aria-hidden="true" />;
  }
  if (value.includes("today")) {
    return <Flame className={iconClass} aria-hidden="true" />;
  }
  if (value.includes("value")) {
    return <Gem className={iconClass} aria-hidden="true" />;
  }
  return <Clock3 className={iconClass} aria-hidden="true" />;
};

const OfferBadge = ({ children }) => (
  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dune-amber/60 bg-black/75 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-dune-amber backdrop-blur-sm">
    <BadgeIcon badge={children} />
    {children}
  </span>
);

export default OfferBadge;
