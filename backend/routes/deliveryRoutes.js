import express from "express";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { riderConfiguration } from "../config/rider.js";
import { actOnDelivery, enrollDelivery, getWorkflowDelivery } from "../services/deliveryWorkflowService.js";
import { listAssignableRiders, listWorkflowDeliveries, findEnrollmentOrder } from "../services/deliveryReadService.js";
import { adminDeliveryPreview } from "../services/deliveryPreviewService.js";

export const deliveryHandler = work => async (req, res) => {
  try { res.json(await work(req)); }
  catch (error) { res.status(error.status || 500).json({ success: false, code: error.code === "LIVE_DELIVERY_DISABLED" ? error.code : "DELIVERY_REQUEST_FAILED", message: error.status ? error.message : "Delivery request failed; reload before retrying." }); }
};
export function validateDeliveryPayload(action, body) {
  const fields = { enroll: ["reason", "pickupInstructions", "deliveryNote"], availability: ["available"], assign: ["riderId", "reason"],
    pickup: [], deliver: [], issue: ["reason"], resolve_issue: ["reason"], report_cash: ["amount", "reason"], acknowledge_cash: ["reason"], confirm_cash: ["terminal"] };
  if (!fields[action] || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["idempotencyKey", "expectedRevision", ...fields[action]].includes(key))) throw Object.assign(new Error("Invalid delivery action fields"), { status: 400 });
  return body;
}
const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); res.set("Vary", "Cookie, Authorization"); next(); });
router.use(protect, requireCapability(CAPABILITIES.DELIVERY_CASH_CONFIRM));
router.get("/config", (req, res) => res.json({ success: true, operationalEnabled: false, workflowEnabled: riderConfiguration().workflowEnabled, previewAvailable: riderConfiguration().previewEnabled }));
router.get("/preview", requireCapability(CAPABILITIES.DELIVERY_MANAGE), deliveryHandler(req => adminDeliveryPreview(req.user)));
router.get("/preview/:id", requireCapability(CAPABILITIES.DELIVERY_MANAGE), deliveryHandler(req => ({ success: true, mode: "preview", operationalEnabled: false, data: adminDeliveryPreview(req.user, req.params.id) })));
router.get("/", deliveryHandler(req => listWorkflowDeliveries(req.user, req.query)));
router.get("/riders", requireCapability(CAPABILITIES.DELIVERY_MANAGE), deliveryHandler(async req => ({ success: true, data: await listAssignableRiders(req.user) })));
router.get("/enrollment-order", requireCapability(CAPABILITIES.DELIVERY_MANAGE), deliveryHandler(async req => ({ success: true, data: await findEnrollmentOrder(req.user, req.query.orderNumber) })));
router.post("/orders/:orderId/enroll", requireCapability(CAPABILITIES.DELIVERY_MANAGE), deliveryHandler(async req => ({ success: true,
  ...await enrollDelivery({ actor: req.user, orderId: req.params.orderId, payload: validateDeliveryPayload("enroll", req.body), correlationId: req.correlationId }) })));
router.get("/:id", deliveryHandler(async req => ({ success: true, mode: "rehearsal", operationalEnabled: false, data: await getWorkflowDelivery(req.user, req.params.id) })));
router.post("/:id/:action", deliveryHandler(async req => ({ success: true,
  ...await actOnDelivery({ actor: req.user, id: req.params.id, action: req.params.action, payload: validateDeliveryPayload(req.params.action, req.body), correlationId: req.correlationId }) })));
export default router;
