import mongoose from "mongoose";

const MAX_CART_QUANTITY = 99;

const cartItemSchema = new mongoose.Schema(
  {
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
          const keys = items.map((item) => {
            const type = item.productType === "combo" ? "combo" : "menuItem";
            const id = type === "combo" ? item.combo : item.menuItem;
            return `${type}:${id?.toString()}`;
          });
          return (
            keys.every((key) => !key.endsWith(":undefined")) &&
            keys.length === new Set(keys).size
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
