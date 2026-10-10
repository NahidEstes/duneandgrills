const tiers = ["Bronze", "Silver", "Gold"];
export const rewardEligible = (reward, account, now = Date.now()) => (!reward.expiresAt || new Date(reward.expiresAt).getTime() > now) && tiers.indexOf(account?.membership?.tier || "Bronze") >= tiers.indexOf(reward.minimumTier || "Bronze");
