import express from "express";
import {
  getMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menuController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router
  .route("/")
  .get(getMenuItems)
  .post(protect, authorize("admin", "manager"), createMenuItem);
router
  .route("/:id")
  .get(getMenuItemById)
  .put(protect, authorize("admin", "manager"), updateMenuItem)
  .delete(protect, authorize("admin", "manager"), deleteMenuItem);

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
