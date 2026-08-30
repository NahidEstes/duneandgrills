import express from "express";
import { protect } from "../middleware/auth.js";
import {
  addAddress,
  addFavorite,
  addComboFavorite,
  addPaymentMethod,
  deleteAddress,
  deletePaymentMethod,
  getAddresses,
  getDashboard,
  getFavorites,
  getPaymentMethods,
  getProfileStats,
  removeFavorite,
  removeComboFavorite,
  getSavedBlogPosts,
  removeSavedBlogPost,
  saveBlogPost,
  setDefaultAddress,
  setDefaultPaymentMethod,
  updateAddress,
  updatePaymentMethod,
} from "../controllers/profileController.js";

const router = express.Router();
router.use(protect);

router.get("/dashboard", getDashboard);
router.get("/stats", getProfileStats);

router.route("/favorites").get(getFavorites);
router
  .route("/favorites/:menuItemId")
  .post(addFavorite)
  .delete(removeFavorite);
router
  .route("/favorite-combos/:comboId")
  .post(addComboFavorite)
  .delete(removeComboFavorite);

router.route("/saved-posts").get(getSavedBlogPosts);
router
  .route("/saved-posts/:blogPostId")
  .post(saveBlogPost)
  .delete(removeSavedBlogPost);

router.route("/addresses").get(getAddresses).post(addAddress);
router
  .route("/addresses/:id")
  .patch(updateAddress)
  .delete(deleteAddress);
router.patch("/addresses/:id/default", setDefaultAddress);

router
  .route("/payment-methods")
  .get(getPaymentMethods)
  .post(addPaymentMethod);
router
  .route("/payment-methods/:id")
  .patch(updatePaymentMethod)
  .delete(deletePaymentMethod);
router.patch("/payment-methods/:id/default", setDefaultPaymentMethod);

export default router;
