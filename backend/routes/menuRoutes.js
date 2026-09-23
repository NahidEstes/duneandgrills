import express from "express";
import {
  getMenuItems,
  getAllMenuItemsForAdmin,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menuController.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import {
  createMenuAddOn,
  deleteMenuAddOn,
  listMenuAddOns,
  updateMenuAddOn,
} from "../controllers/menuAddOnController.js";

const router = express.Router();

router.get(
  "/manage",
  protect,
  requireCapability(CAPABILITIES.CATALOG_MANAGE),
  getAllMenuItemsForAdmin
);

router
  .route("/manage/add-ons")
  .get(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), listMenuAddOns)
  .post(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), createMenuAddOn);
router
  .route("/manage/add-ons/:addOnId")
  .put(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateMenuAddOn)
  .delete(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), deleteMenuAddOn);

router
  .route("/")
  .get(getMenuItems)
  .post(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), createMenuItem);
router
  .route("/:id")
  .get(getMenuItemById)
  .put(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), updateMenuItem)
  .delete(protect, requireCapability(CAPABILITIES.CATALOG_MANAGE), deleteMenuItem);

export default router;

// import express from "express";
// import {
//   getMenuItems,
//   getMenuItemById,
//   createMenuItem,
//   updateMenuItem,
//   deleteMenuItem,
// } from "../controllers/menuController.js";

// const router = express.Router();

// router.route("/").get(getMenuItems).post(createMenuItem);
// router.route("/:id").get(getMenuItemById).put(updateMenuItem).delete(deleteMenuItem);

// export default router;
