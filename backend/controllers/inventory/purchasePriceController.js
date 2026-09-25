import { getPriceHistoryReport } from "../../services/purchasePriceService.js";

export const listPurchasePriceHistory = async (req, res, next) => {
  try { res.json({ success: true, data: await getPriceHistoryReport(req.query) }); } catch (error) { next(error); }
};
