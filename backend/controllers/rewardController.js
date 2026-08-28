import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import Reward from "../models/Reward.js";
import User from "../models/User.js";
import {
  getRewardAccount,
  reserveReward,
  restoreRedemption,
} from "../services/rewardService.js";

const populateMenuItem = {
  path: "menuItem",
  select: "name description image price category isAvailable",
};

const rewardPayload = (body) => ({
  title: body.title?.trim(),
  description: body.description?.trim(),
  image: body.image?.trim(),
  pointsRequired: Number(body.pointsRequired),
  menuItem: body.menuItem,
  isActive: body.isActive !== false,
  sortOrder: Number(body.sortOrder) || 0,
});

const validateRewardPayload = async (payload) => {
  if (
    !payload.title ||
    !payload.description ||
    !payload.image ||
    !Number.isInteger(payload.pointsRequired) ||
    payload.pointsRequired < 1 ||
    !mongoose.isValidObjectId(payload.menuItem)
  ) {
    return "Title, description, image, linked menu item, and positive whole points are required";
  }

  const menuItem = await MenuItem.findById(payload.menuItem).select("_id");
  return menuItem ? null : "Linked menu item was not found";
};

export const getRewards = async (req, res) => {
  try {
    const rewards = await Reward.find({ isActive: true, isDeleted: { $ne: true } })
      .sort({ sortOrder: 1, pointsRequired: 1, createdAt: 1 })
      .populate(populateMenuItem)
      .lean();
    const available = rewards.filter((reward) => reward.menuItem);
    return res.status(200).json({ success: true, count: available.length, data: available });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load rewards",
      error: error.message,
    });
  }
};

export const getRewardById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reward" });
    }
    const reward = await Reward.findOne({
      _id: req.params.id,
      isActive: true,
      isDeleted: { $ne: true },
    }).populate(populateMenuItem);
    if (!reward) {
      return res.status(404).json({ success: false, message: "Reward not found" });
    }
    return res.status(200).json({ success: true, data: reward });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load reward" });
  }
};

export const getMyRewardAccount = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getRewardAccount(req.user._id),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load your rewards account",
      error: error.message,
    });
  }
};

export const redeemReward = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reward" });
    }
    const reward = await Reward.findOne({
      _id: req.params.id,
      isActive: true,
      isDeleted: { $ne: true },
    }).populate(populateMenuItem);
    if (!reward) {
      return res.status(404).json({ success: false, message: "Reward not found" });
    }
    if (!reward.menuItem?.isAvailable) {
      return res.status(409).json({
        success: false,
        message: "This reward item is not currently available",
      });
    }

    const result = await reserveReward(req.user._id, reward);
    if (!result) {
      const user = await User.findById(req.user._id)
        .select("pointsBalance rewardRedemptions")
        .lean();
      const hasReservation = user?.rewardRedemptions?.some(
        (entry) => entry.status === "reserved" && new Date(entry.expiresAt) > new Date()
      );
      return res.status(409).json({
        success: false,
        message: hasReservation
          ? "You already have a reward reserved in your cart"
          : "You do not have enough points for this reward",
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        pointsBalance: result.balance,
        redemption: result.redemption,
        reward,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Reward could not be redeemed",
      error: error.message,
    });
  }
};

export const cancelRewardRedemption = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.redemptionId)) {
      return res.status(400).json({ success: false, message: "Invalid redemption" });
    }
    const user = await User.findOne({
      _id: req.user._id,
      rewardRedemptions: {
        $elemMatch: { _id: req.params.redemptionId, status: "reserved" },
      },
    })
      .select("rewardRedemptions")
      .lean();
    const redemption = user?.rewardRedemptions?.find(
      (entry) => entry._id.toString() === req.params.redemptionId
    );
    if (!redemption) {
      return res.status(404).json({
        success: false,
        message: "Active reward reservation not found",
      });
    }
    const updated = await restoreRedemption({
      userId: req.user._id,
      redemptionId: redemption._id,
      expectedStatuses: ["reserved"],
      status: "cancelled",
      description: `${redemption.title} removed from cart — points returned`,
    });
    return res.status(200).json({
      success: true,
      data: { pointsBalance: updated.pointsBalance },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Reward reservation could not be cancelled",
      error: error.message,
    });
  }
};

export const getManagedRewards = async (req, res) => {
  try {
    const rewards = await Reward.find({ isDeleted: { $ne: true } })
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate(populateMenuItem);
    return res.status(200).json({ success: true, count: rewards.length, data: rewards });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load rewards" });
  }
};

export const createReward = async (req, res) => {
  try {
    const payload = rewardPayload(req.body);
    const validationError = await validateRewardPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
    const reward = await Reward.create(payload);
    await reward.populate(populateMenuItem);
    return res.status(201).json({ success: true, data: reward });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Reward could not be created",
      error: error.message,
    });
  }
};

export const updateReward = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reward" });
    }
    const payload = rewardPayload(req.body);
    const validationError = await validateRewardPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
    const reward = await Reward.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      payload,
      { new: true, runValidators: true }
    ).populate(populateMenuItem);
    if (!reward) {
      return res.status(404).json({ success: false, message: "Reward not found" });
    }
    return res.status(200).json({ success: true, data: reward });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Reward could not be updated",
      error: error.message,
    });
  }
};

export const deleteReward = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid reward" });
    }
    const reward = await Reward.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { isActive: false, isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!reward) {
      return res.status(404).json({ success: false, message: "Reward not found" });
    }
    return res.status(200).json({ success: true, message: "Reward deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Reward could not be deleted" });
  }
};
