import User from "../models/User.js";
import { escapeRegex, ValidationError } from "../utils/inventoryValidation.js";

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
