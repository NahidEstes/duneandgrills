import { previewStockAction, confirmStockAction, findStockAction } from "../../services/inventoryMovementReviewService.js";
import { refreshAffectedSuggestions } from "../../services/reorderService.js";
const handle = work => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, data: await work(req) }); } catch (error) { next(error); }
};
export const preview = handle(req => previewStockAction(req.user, req.body));
export const confirm = handle(async req => {
  const result = await confirmStockAction(req.user, req.body);
  // Post-commit suggestions must not turn a known successful posting into an
  // apparent failure; inventory itself remains authoritative.
  await refreshAffectedSuggestions([result.item?._id || result.item]).catch(() => undefined);
  return result;
});
export const savedResult = handle(req => findStockAction(req.user, req.params.key));
