import { buildAdminAnalytics } from "../services/adminAnalyticsService.js";

export const getAdminAnalytics = async (req, res, next) => {
  try {
    res.json({ success: true, data: await buildAdminAnalytics(req.query) });
  } catch (error) {
    next(error);
  }
};
