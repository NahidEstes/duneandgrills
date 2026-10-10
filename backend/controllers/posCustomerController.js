import User from "../models/User.js";
import { escapeRegex, ValidationError } from "../utils/inventoryValidation.js";
import mongoose from "mongoose";
import { getRewardAccount } from "../services/rewardService.js";
import Reward from "../models/Reward.js";
import { recordAuditLog } from "../services/auditLogService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { resolveCartLines } from "../services/catalogService.js";
import { calculateCoupon } from "../services/couponService.js";

export const validatePosCoupon = async (req, res, next) => {
  try {
    if (req.body.customerId && (!mongoose.isValidObjectId(req.body.customerId) || !await User.exists({ _id: req.body.customerId, role: "customer", isActive: { $ne: false } }))) throw new ValidationError("Invalid customer");
    const coupon = await calculateCoupon({ code: req.body.code, lines: await resolveCartLines(req.body.items), userId: req.body.customerId });
    res.json({ success: true, data: { code: coupon.code, discountAmount: coupon.discountAmount } });
  } catch (error) { next(error); }
};

export const createPosCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, password } = req.body;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || typeof phone !== "string" || !/^[+\d][\d\s()-]{5,29}$/.test(phone.trim()) || typeof email !== "string" || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 10 || password.length > 128) throw new ValidationError("Name, valid phone/email and a customer-chosen password of 10–128 characters are required");
    const normalizedEmail = email.trim().toLowerCase();
    const data = await runInventoryTransaction(async session => {
      if (await User.findOne({ $or: [{ email: normalizedEmail }, { phone: phone.trim() }] }).session(session)) throw Object.assign(new Error("Customer already exists; use customer lookup"), { status: 409 });
      const [customer] = await User.create([{ name: name.trim(), phone: phone.trim(), email: normalizedEmail, password, role: "customer" }], { session });
      await recordAuditLog({ actor: req.user, action: "POS_CUSTOMER_CREATED", entityType: "User", entityId: customer._id, entityLabel: customer.customerNumber, correlationId: req.correlationId, after: { role: "customer" } }, { session });
      return { _id: customer._id, name: customer.name, phone: customer.phone, customerNumber: customer.customerNumber };
    });
    res.status(201).json({ success: true, data });
  } catch (error) { if (error.code === 11000) error.status = 409; next(error); }
};

export const getPosCustomerRewards = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !await User.exists({ _id: req.params.id, role: "customer", isActive: { $ne: false } })) throw Object.assign(new Error("Customer not found"), { status: 404 });
    const account = await getRewardAccount(req.params.id);
    const rewards = await Reward.find({ isActive: true, isDeleted: { $ne: true }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).populate("menuItem", "name image isAvailable").lean();
    res.json({ success: true, data: { ...account, rewards: rewards.filter(row => row.menuItem?.isAvailable) } });
  } catch (error) { next(error); }
};

export const searchPosCustomers = async (req, res, next) => {
  try {
    const { search = "", limit = "8" } = req.query;
    if (typeof search !== "string" || search.trim().length < 2 || search.trim().length > 80 || /[\x00-\x1f\x7f]/.test(search)) throw new ValidationError("Customer search must contain 2–80 characters");
    if (typeof limit !== "string" || !/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 20) throw new ValidationError("Customer search limit must be between 1 and 20");
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    const rows = await User.find({ role: "customer", isActive: { $ne: false }, $or: [{ name: pattern }, { phone: pattern }, { customerNumber: pattern }] })
      .select("_id name phone customerNumber").sort({ name: 1, _id: 1 }).limit(Number(limit)).maxTimeMS(2000).lean();
    res.json({ success: true, data: rows.map(row => ({ _id: row._id, name: row.name, phone: row.phone || "", customerNumber: row.customerNumber || "" })) });
  } catch (error) { next(error); }
};
