export const REWARD_CONFIG = Object.freeze({
  pointsPerSAR: 10,
  redemptionReservationMinutes: 30,
});

export const calculateOrderPoints = (eligibleAmount = 0) => {
  const amount = Math.max(0, Number(eligibleAmount) || 0);
  return Math.floor((Math.round(amount * 100) / 100) * REWARD_CONFIG.pointsPerSAR);
};
