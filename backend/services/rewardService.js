import mongoose from "mongoose";
import User from "../models/User.js";
import { REWARD_CONFIG } from "../config/rewards.js";

const legacySourceKey = "MIGRATION:LEGACY_REWARD_BALANCE";

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);

export const ensurePointsBalance = async (userId) => {
  const _id = toObjectId(userId);
  await User.collection.updateOne(
    { _id, pointsBalance: { $exists: false } },
    [
      {
        $set: {
          pointsBalance: {
            $max: [{ $ifNull: ["$rewardPoints", 0] }, 0],
          },
        },
      },
      {
        $set: {
          pointTransactions: {
            $cond: [
              {
                $and: [
                  { $gt: ["$pointsBalance", 0] },
                  {
                    $not: {
                      $in: [
                        legacySourceKey,
                        { $ifNull: ["$pointTransactions.sourceKey", []] },
                      ],
                    },
                  },
                ],
              },
              {
                $concatArrays: [
                  { $ifNull: ["$pointTransactions", []] },
                  [
                    {
                      _id: new mongoose.Types.ObjectId(),
                      type: "EARN",
                      points: "$pointsBalance",
                      order: null,
                      reward: null,
                      description: "Opening points balance migrated from the previous rewards system",
                      balanceAfter: "$pointsBalance",
                      sourceKey: legacySourceKey,
                      createdAt: new Date(),
                    },
                  ],
                ],
              },
              { $ifNull: ["$pointTransactions", []] },
            ],
          },
        },
      },
    ]
  );
};

export const restoreRedemption = async ({
  userId,
  redemptionId,
  expectedStatuses,
  status,
  description,
}) => {
  const _id = toObjectId(userId);
  const embeddedId = toObjectId(redemptionId);
  const user = await User.findOne({
    _id,
    rewardRedemptions: {
      $elemMatch: { _id: embeddedId, status: { $in: expectedStatuses } },
    },
  })
    .select("pointsBalance rewardRedemptions pointTransactions")
    .lean();

  const redemption = user?.rewardRedemptions?.find(
    (entry) => entry._id.toString() === embeddedId.toString()
  );
  if (!redemption) return null;

  const sourceKey = `REDEMPTION_REVERSAL:${embeddedId}`;
  const restoredAt = new Date();
  const updated = await User.findOneAndUpdate(
    {
      _id,
      rewardRedemptions: {
        $elemMatch: { _id: embeddedId, status: { $in: expectedStatuses } },
      },
      "pointTransactions.sourceKey": { $ne: sourceKey },
    },
    [
      {
        $set: {
          pointsBalance: {
            $add: [{ $ifNull: ["$pointsBalance", 0] }, redemption.pointsSpent],
          },
          rewardRedemptions: {
            $map: {
              input: { $ifNull: ["$rewardRedemptions", []] },
              as: "redemption",
              in: {
                $cond: [
                  { $eq: ["$$redemption._id", embeddedId] },
                  {
                    $mergeObjects: [
                      "$$redemption",
                      { status, restoredAt },
                    ],
                  },
                  "$$redemption",
                ],
              },
            },
          },
          pointTransactions: {
            $concatArrays: [
              { $ifNull: ["$pointTransactions", []] },
              [
                {
                  _id: new mongoose.Types.ObjectId(),
                  type: "REVERSAL",
                  points: redemption.pointsSpent,
                  order: redemption.order || null,
                  reward: redemption.reward,
                  description,
                  balanceAfter: {
                    $add: [
                      { $ifNull: ["$pointsBalance", 0] },
                      redemption.pointsSpent,
                    ],
                  },
                  sourceKey,
                  createdAt: restoredAt,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true }
  );

  return updated;
};

export const releaseExpiredRedemptions = async (userId) => {
  const user = await User.findById(userId)
    .select("rewardRedemptions")
    .lean();
  const now = Date.now();
  const expired = (user?.rewardRedemptions || []).filter(
    (entry) =>
      entry.status === "reserved" && new Date(entry.expiresAt).getTime() <= now
  );

  await Promise.all(
    expired.map((entry) =>
      restoreRedemption({
        userId,
        redemptionId: entry._id,
        expectedStatuses: ["reserved"],
        status: "expired",
        description: `${entry.title} reservation expired — points returned`,
      })
    )
  );
};

export const reserveReward = async (userId, reward) => {
  await ensurePointsBalance(userId);
  await releaseExpiredRedemptions(userId);

  const _id = toObjectId(userId);
  const redemptionId = new mongoose.Types.ObjectId();
  const transactionId = new mongoose.Types.ObjectId();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + REWARD_CONFIG.redemptionReservationMinutes * 60_000
  );
  const sourceKey = `REWARD_REDEEM:${redemptionId}`;
  const pointsRequired = Number(reward.pointsRequired);

  const updated = await User.findOneAndUpdate(
    {
      _id,
      pointsBalance: { $gte: pointsRequired },
      rewardRedemptions: {
        $not: { $elemMatch: { status: "reserved", expiresAt: { $gt: now } } },
      },
    },
    [
      {
        $set: {
          pointsBalance: { $subtract: ["$pointsBalance", pointsRequired] },
          pointTransactions: {
            $concatArrays: [
              { $ifNull: ["$pointTransactions", []] },
              [
                {
                  _id: transactionId,
                  type: "REDEEM",
                  points: -pointsRequired,
                  order: null,
                  reward: reward._id,
                  description: reward.title,
                  balanceAfter: {
                    $subtract: ["$pointsBalance", pointsRequired],
                  },
                  sourceKey,
                  createdAt: now,
                },
              ],
            ],
          },
          rewardRedemptions: {
            $concatArrays: [
              { $ifNull: ["$rewardRedemptions", []] },
              [
                {
                  _id: redemptionId,
                  reward: reward._id,
                  menuItem: reward.menuItem._id,
                  order: null,
                  title: reward.title,
                  image: reward.image,
                  pointsSpent: pointsRequired,
                  status: "reserved",
                  expiresAt,
                  appliedAt: null,
                  restoredAt: null,
                  createdAt: now,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) return null;
  return {
    balance: updated.pointsBalance,
    redemption: updated.rewardRedemptions.id(redemptionId),
  };
};

export const applyRedemptionToOrder = async ({ userId, redemptionId, orderId }) => {
  const now = new Date();
  return User.findOneAndUpdate(
    {
      _id: userId,
      rewardRedemptions: {
        $elemMatch: {
          _id: redemptionId,
          status: "reserved",
          expiresAt: { $gt: now },
        },
      },
    },
    {
      $set: {
        "rewardRedemptions.$.status": "applied",
        "rewardRedemptions.$.appliedAt": now,
        "rewardRedemptions.$.order": orderId,
      },
    },
    { new: true }
  );
};

export const reopenRedemption = async ({ userId, redemptionId, orderId }) =>
  User.updateOne(
    {
      _id: userId,
      rewardRedemptions: {
        $elemMatch: { _id: redemptionId, status: "applied", order: orderId },
      },
    },
    {
      $set: {
        "rewardRedemptions.$.status": "reserved",
        "rewardRedemptions.$.appliedAt": null,
        "rewardRedemptions.$.order": null,
      },
    }
  );

export const creditOrderPoints = async ({
  userId,
  orderId,
  orderNumber,
  points,
}) => {
  if (!userId || points <= 0) return null;
  await ensurePointsBalance(userId);
  const sourceKey = `ORDER_EARN:${orderId}`;
  const now = new Date();

  return User.findOneAndUpdate(
    { _id: userId, "pointTransactions.sourceKey": { $ne: sourceKey } },
    [
      {
        $set: {
          pointsBalance: { $add: [{ $ifNull: ["$pointsBalance", 0] }, points] },
          pointTransactions: {
            $concatArrays: [
              { $ifNull: ["$pointTransactions", []] },
              [
                {
                  _id: new mongoose.Types.ObjectId(),
                  type: "EARN",
                  points,
                  order: toObjectId(orderId),
                  reward: null,
                  description: `Order #${orderNumber}`,
                  balanceAfter: {
                    $add: [{ $ifNull: ["$pointsBalance", 0] }, points],
                  },
                  sourceKey,
                  createdAt: now,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true }
  );
};

export const reverseOrderPoints = async ({ userId, orderId, orderNumber }) => {
  if (!userId) return null;
  await ensurePointsBalance(userId);
  const earnKey = `ORDER_EARN:${orderId}`;
  const reversalKey = `ORDER_REVERSAL:${orderId}`;
  const user = await User.findOne({
    _id: userId,
    pointTransactions: { $elemMatch: { sourceKey: earnKey } },
    "pointTransactions.sourceKey": { $ne: reversalKey },
  })
    .select("pointsBalance pointTransactions")
    .lean();
  const earned = user?.pointTransactions?.find(
    (entry) => entry.sourceKey === earnKey
  );
  if (!earned) return null;

  const now = new Date();
  const amount = Math.max(0, Number(earned.points) || 0);
  return User.findOneAndUpdate(
    {
      _id: userId,
      "pointTransactions.sourceKey": earnKey,
      pointTransactions: { $not: { $elemMatch: { sourceKey: reversalKey } } },
    },
    [
      {
        $set: {
          pointsBalance: {
            $subtract: [
              { $ifNull: ["$pointsBalance", 0] },
              { $min: [{ $ifNull: ["$pointsBalance", 0] }, amount] },
            ],
          },
          pointTransactions: {
            $concatArrays: [
              { $ifNull: ["$pointTransactions", []] },
              [
                {
                  _id: new mongoose.Types.ObjectId(),
                  type: "REVERSAL",
                  points: {
                    $multiply: [
                      -1,
                      { $min: [{ $ifNull: ["$pointsBalance", 0] }, amount] },
                    ],
                  },
                  order: toObjectId(orderId),
                  reward: null,
                  description: `Points reversed for Order #${orderNumber}`,
                  balanceAfter: {
                    $subtract: [
                      { $ifNull: ["$pointsBalance", 0] },
                      { $min: [{ $ifNull: ["$pointsBalance", 0] }, amount] },
                    ],
                  },
                  sourceKey: reversalKey,
                  createdAt: now,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true }
  );
};

export const getRewardAccount = async (userId) => {
  await ensurePointsBalance(userId);
  await releaseExpiredRedemptions(userId);
  const user = await User.findById(userId)
    .select("pointsBalance pointTransactions rewardRedemptions")
    .populate("pointTransactions.order", "orderNumber")
    .populate("pointTransactions.reward", "title")
    .lean();

  const history = [...(user?.pointTransactions || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100);
  const activeRedemption = (user?.rewardRedemptions || []).find(
    (entry) => entry.status === "reserved" && new Date(entry.expiresAt) > new Date()
  );

  return {
    pointsBalance: Math.max(0, Number(user?.pointsBalance) || 0),
    pointsPerSAR: REWARD_CONFIG.pointsPerSAR,
    history,
    activeRedemption: activeRedemption || null,
  };
};
