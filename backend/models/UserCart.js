import mongoose from "mongoose";
import { MAX_ITEM_NOTE_LENGTH, SPICE_LEVELS } from "../config/menuCustomization.js";

const MAX_CART_QUANTITY = 99;

const cartItemSchema = new mongoose.Schema(
  {
    lineId: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
      required: true,
    },
    productType: {
      type: String,
      enum: ["menuItem", "combo"],
      default: "menuItem",
      required: true,
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required() {
        return this.productType !== "combo";
      },
      default: null,
    },
    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      required() {
        return this.productType === "combo";
      },
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_CART_QUANTITY,
    },
    // Mixed keeps legacy ObjectId-only carts readable while allowing the
    // quantity-aware { addOn, quantity } shape used by Phase 2.
    selectedAddOns: [{ type: mongoose.Schema.Types.Mixed }],
    spiceLevel: { type: String, enum: ["", ...SPICE_LEVELS], default: "" },
    note: { type: String, trim: true, maxlength: MAX_ITEM_NOTE_LENGTH, default: "" },
    customizationKey: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false }
);

const userCartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: {
        validator(items) {
          const identities = items.map((item) => {
            const type = item.productType === "combo" ? "combo" : "menuItem";
            const id = type === "combo" ? item.combo : item.menuItem;
            return {
              id,
              key: `${type}:${id?.toString()}:${item.customizationKey || ""}`,
            };
          });
          return (
            identities.every(({ id }) => Boolean(id)) &&
            identities.length === new Set(identities.map(({ key }) => key)).size
          );
        },
        message: "Cart cannot contain duplicate products",
      },
    },
  },
  { timestamps: true }
);

const UserCart = mongoose.model("UserCart", userCartSchema);

export { MAX_CART_QUANTITY };
export default UserCart;
