import express from "express";
import {
  createOffer,
  deleteOffer,
  getAllOffersForAdmin,
  getOfferById,
  getOffers,
  updateOffer,
  validateCoupon,
} from "../controllers/offerController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";

const router = express.Router();
const manageOffers = [protect, requireCapability(CAPABILITIES.CATALOG_MANAGE)];

router
  .route("/")
  .get(getOffers)
  .post(...manageOffers, createOffer);

router.get("/manage", ...manageOffers, getAllOffersForAdmin);
router.post("/validate-coupon", validateCoupon);

router
  .route("/:id")
  .get(getOfferById)
  .put(...manageOffers, updateOffer)
  .patch(...manageOffers, updateOffer)
  .delete(...manageOffers, deleteOffer);

export default router;
