import mongoose from "mongoose";

const MAX_CART_QUANTITY = 99;

const cartItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
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
          const ids = items.map((item) => item.menuItem.toString());
          return ids.length === new Set(ids).size;
        },
        message: "Cart cannot contain duplicate menu items",
      },
    },
  },
  { timestamps: true }
);

const UserCart = mongoose.model("UserCart", userCartSchema);

export { MAX_CART_QUANTITY };
export default UserCart;
