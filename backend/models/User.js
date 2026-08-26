import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { getMembershipDetails } from "../utils/rewards.js";

const addressSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 40 },
  fullAddress: { type: String, required: true, trim: true, maxlength: 300 },
  phone: { type: String, default: "", trim: true, maxlength: 30 },
  isDefault: { type: Boolean, default: false },
});

const paymentMethodSchema = new mongoose.Schema({
  cardBrand: {
    type: String,
    enum: ["Visa", "Mastercard", "Mada", "American Express"],
    required: true,
  },
  lastFourDigits: {
    type: String,
    required: true,
    match: [/^\d{4}$/, "Last four digits must contain exactly four numbers"],
  },
  expiryMonth: { type: Number, required: true, min: 1, max: 12 },
  expiryYear: { type: Number, required: true, min: 2024, max: 2200 },
  cardholderName: { type: String, required: true, trim: true, maxlength: 100 },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["customer", "manager", "admin"],
      default: "customer",
    },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    bio: { type: String, default: "", trim: true, maxlength: 240 },
    avatar: { type: String, default: "", trim: true },
    rewardPoints: { type: Number, default: 0, min: 0 },
    favorites: [
      { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    ],
    addresses: { type: [addressSchema], default: [] },
    paymentMethods: { type: [paymentMethodSchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.virtual("membershipTier").get(function () {
  return getMembershipDetails(this.rewardPoints).tier;
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
