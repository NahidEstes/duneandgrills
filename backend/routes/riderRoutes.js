import express from "express";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { buildRiderPortal } from "../services/riderPortalService.js";

const router = express.Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie, Authorization");
  next();
});
router.use(protect, requireCapability(CAPABILITIES.RIDER_PORTAL_READ));
// No operational action is implemented or enabled in this phase.
router.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) return res.status(503).json({
    success: false, code: "LIVE_DELIVERY_DISABLED", message: "Live delivery disabled. Phase 1 is read-only.",
  });
  next();
});
for (const [path, preview] of [["/portal", false], ["/preview", true]]) {
  router.get(path, (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ success: false, message: "Rider identity comes from your session, not query parameters." });
    try { res.json({ success: true, ...buildRiderPortal(req.user, { preview }) }); }
    catch (error) { res.status(error.status || 500).json({ success: false, message: error.message }); }
  });
}
router.use((req, res) => res.status(404).json({ success: false, message: "Delivery unavailable. No live assignments exist in Phase 1." }));
export default router;
