import express from "express";
import { protect } from "../middleware/auth.js";
import { rateLimit } from "../middleware/security.js";
import { getRecordDetails, searchRecords } from "../services/recordSearchService.js";

const router = express.Router();
router.use(protect, rateLimit({ max: 60, windowMs: 60000, keyPrefix: "record-id-search" }));
router.get("/", async (req, res, next) => {
  try { res.json({ success: true, ...await searchRecords(req.user, req.query) }); } catch (error) { next(error); }
});
router.get("/:type/:id", async (req, res, next) => {
  try { res.json({ success: true, data: await getRecordDetails(req.user, req.params.type, req.params.id) }); } catch (error) { next(error); }
});
export default router;
