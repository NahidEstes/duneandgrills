import { getAdminOperations } from "../services/adminOperationsService.js";

export async function getOperationsOverview(req, res, next) {
  res.setHeader("Cache-Control", "private, no-store");
  try { res.json({ success: true, data: await getAdminOperations({ role: req.user.role }) }); }
  catch (error) { next(error); }
}
