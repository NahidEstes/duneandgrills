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
import { authorize, protect } from "../middleware/auth.js";

const router = express.Router();
const manageOffers = [protect, authorize("admin", "manager")];

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
