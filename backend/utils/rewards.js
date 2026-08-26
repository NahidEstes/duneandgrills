const TIERS = [
  { name: "Bronze", minimumPoints: 0 },
  { name: "Silver", minimumPoints: 500 },
  { name: "Gold", minimumPoints: 1000 },
  { name: "Platinum", minimumPoints: 2000 },
];

export const getMembershipDetails = (rawPoints = 0) => {
  const points = Math.max(0, Number(rawPoints) || 0);
  const currentIndex = TIERS.reduce(
    (matchedIndex, tier, index) =>
      points >= tier.minimumPoints ? index : matchedIndex,
    0
  );
  const currentTier = TIERS[currentIndex];
  const nextTier = TIERS[currentIndex + 1] || null;
  const tierRange = nextTier
    ? nextTier.minimumPoints - currentTier.minimumPoints
    : 1;
  const earnedWithinTier = points - currentTier.minimumPoints;

  return {
    tier: currentTier.name,
    pointsAvailable: points,
    currentTierMinimum: currentTier.minimumPoints,
    nextTier: nextTier?.name || null,
    nextTierPoints: nextTier?.minimumPoints || null,
    pointsToNextTier: nextTier
      ? Math.max(0, nextTier.minimumPoints - points)
      : 0,
    progressPercent: nextTier
      ? Math.min(100, Math.round((earnedWithinTier / tierRange) * 100))
      : 100,
  };
};

