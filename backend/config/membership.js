export const MEMBERSHIP_TIERS = Object.freeze([{ name: "Bronze", minimumPoints: 0 }, { name: "Silver", minimumPoints: 1000 }, { name: "Gold", minimumPoints: 5000 }]);
export const membershipFor = transactions => {
  const lifetimePoints = Math.max(0, (transactions || []).reduce((sum, row) => row.type === "EARN" || (row.type === "REVERSAL" && Number(row.points) < 0) ? sum + Number(row.points || 0) : sum, 0));
  const tier = [...MEMBERSHIP_TIERS].reverse().find(row => lifetimePoints >= row.minimumPoints);
  return { tier: tier.name, lifetimePoints, nextTier: MEMBERSHIP_TIERS.find(row => row.minimumPoints > lifetimePoints) || null, tiers: MEMBERSHIP_TIERS };
};
