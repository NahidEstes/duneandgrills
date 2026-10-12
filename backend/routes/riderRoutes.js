import express from "express";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { buildRiderPortal, buildPreviewDelivery } from "../services/riderPortalService.js";
import { deliveryHandler, validateDeliveryPayload } from "./deliveryRoutes.js";
import { actOnDelivery, getWorkflowDelivery, setRiderAvailability } from "../services/deliveryWorkflowService.js";
import { listWorkflowDeliveries } from "../services/deliveryReadService.js";

const router = express.Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie, Authorization");
  next();
});
router.use(protect, requireCapability(CAPABILITIES.RIDER_PORTAL_READ));
router.get("/preview/deliveries/:id", deliveryHandler(req => ({ success: true, mode: "preview", operationalEnabled: false, data: buildPreviewDelivery(req.user, req.params.id) })));
router.get("/workflow", requireCapability(CAPABILITIES.RIDER_DELIVERY_OPERATE), deliveryHandler(req => listWorkflowDeliveries(req.user, req.query)));
router.post("/workflow/availability", requireCapability(CAPABILITIES.RIDER_DELIVERY_OPERATE), deliveryHandler(async req => ({ success: true,
  ...await setRiderAvailability({ actor: req.user, payload: validateDeliveryPayload("availability", req.body), correlationId: req.correlationId }) })));
router.get("/workflow/deliveries/:id", requireCapability(CAPABILITIES.RIDER_DELIVERY_OPERATE), deliveryHandler(async req => ({ success: true, mode: "rehearsal", operationalEnabled: false, data: await getWorkflowDelivery(req.user, req.params.id) })));
router.post("/workflow/deliveries/:id/:action", requireCapability(CAPABILITIES.RIDER_DELIVERY_OPERATE), deliveryHandler(async req => ({ success: true,
  ...await actOnDelivery({ actor: req.user, id: req.params.id, action: req.params.action, payload: validateDeliveryPayload(req.params.action, req.body), correlationId: req.correlationId }) })));
// Unknown/legacy write routes remain disabled; only guarded isolated workflows exist.
router.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) return res.status(503).json({
    success: false, code: "LIVE_DELIVERY_DISABLED", message: "Live delivery disabled. Use an explicitly isolated workflow rehearsal.",
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
router.use((req, res) => res.status(404).json({ success: false, message: "Delivery unavailable. Live delivery remains disabled." }));
export default router;
