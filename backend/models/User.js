import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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

const pointTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["EARN", "REDEEM", "REVERSAL"],
    required: true,
  },
  points: { type: Number, required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  reward: { type: mongoose.Schema.Types.ObjectId, ref: "Reward", default: null },
  description: { type: String, required: true, trim: true, maxlength: 240 },
  balanceAfter: { type: Number, required: true, min: 0 },
  sourceKey: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const rewardRedemptionSchema = new mongoose.Schema({
  reward: { type: mongoose.Schema.Types.ObjectId, ref: "Reward", required: true },
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true,
  },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  title: { type: String, required: true, trim: true },
  image: { type: String, default: "", trim: true },
  pointsSpent: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ["reserved", "applied", "cancelled", "expired", "restored"],
    default: "reserved",
  },
  expiresAt: { type: Date, required: true },
  appliedAt: { type: Date, default: null },
  restoredAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
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
    pointsBalance: { type: Number, min: 0 },
    pointTransactions: { type: [pointTransactionSchema], default: [] },
    rewardRedemptions: { type: [rewardRedemptionSchema], default: [] },
    favorites: [
      { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    ],
    favoriteCombos: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Combo" },
    ],
    savedBlogPosts: [
      { type: mongoose.Schema.Types.ObjectId, ref: "BlogPost" },
    ],
    addresses: { type: [addressSchema], default: [] },
    paymentMethods: { type: [paymentMethodSchema], default: [] },
  },
  { timestamps: true }
);

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
