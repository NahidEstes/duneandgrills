import { buildProfitReport } from "../services/profitReportingService.js";
export async function getProfitReport(req, res, next) {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, data: await buildProfitReport({ role: req.user.role, query: req.query }) }); }
  catch (error) { next(error); }
}
