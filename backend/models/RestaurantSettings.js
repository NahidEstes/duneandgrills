import mongoose from "mongoose";

export const RESTAURANT_DAYS = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const httpUrlPattern = /^https?:\/\//i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const servicePeriodSchema = new mongoose.Schema(
  {
    open: { type: String, required: true, match: timePattern },
    close: { type: String, required: true, match: timePattern },
  },
  { _id: false }
);

const openingDaySchema = new mongoose.Schema(
  {
    day: { type: String, required: true, enum: RESTAURANT_DAYS },
    isOpen: { type: Boolean, default: true },
    periods: {
      type: [servicePeriodSchema],
      default: () => [{ open: "11:00", close: "23:00" }],
      validate: {
        validator(value) {
          return !this.isOpen || (value.length >= 1 && value.length <= 2);
        },
        message: "Open days require one or two service periods",
      },
    },
  },
  { _id: false }
);

const restaurantSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, immutable: true },
    timezone: { type: String, enum: ["Asia/Riyadh"], default: "Asia/Riyadh", immutable: true },
    openingHours: {
      type: [openingDaySchema],
      default: () => RESTAURANT_DAYS.map((day) => ({
        day,
        isOpen: true,
        periods: [{ open: "11:00", close: "23:00" }],
      })),
    },
    orders: {
      deliveryFee: { type: Number, default: 10, min: 0, max: 10000 },
      minimumDeliveryOrder: { type: Number, default: 0, min: 0, max: 100000 },
      channels: {
        website: { type: Boolean, default: true },
        pos: { type: Boolean, default: true },
        phone: { type: Boolean, default: true },
        jahez: { type: Boolean, default: true },
        hungerstation: { type: Boolean, default: true },
      },
    },
    notifications: {
      adminSoundEnabled: { type: Boolean, default: true },
      kitchenSoundEnabled: { type: Boolean, default: true },
      alertRepeatIntervalSeconds: { type: Number, default: 5, min: 2, max: 300 },
      maximumAlertRepeats: { type: Number, default: 60, min: 1, max: 500 },
      pollingIntervalSeconds: { type: Number, default: 5, min: 3, max: 60 },
    },
    preparation: {
      defaultMinutes: { type: Number, default: 20, min: 1, max: 240 },
    },
    receipt: {
      displayName: { type: String, default: "Dune & Grills", trim: true, maxlength: 120 },
      header: { type: String, default: "ORDER RECEIPT", trim: true, maxlength: 160 },
      footer: { type: String, default: "Thank you for visiting Dune & Grills.", trim: true, maxlength: 500 },
      websiteUrl: { type: String, default: "https://duneandgrills.com", trim: true, maxlength: 500, validate: { validator: (value) => !value || httpUrlPattern.test(value), message: "Website URL must use HTTP or HTTPS" } },
      logoUrl: { type: String, default: "", trim: true, maxlength: 1000, validate: { validator: (value) => !value || httpUrlPattern.test(value), message: "Logo URL must use HTTP or HTTPS" } },
    },
    location: {
      address: { type: String, default: "Wadi As Sarh, Al Wadi", trim: true, maxlength: 300 },
      city: { type: String, default: "Riyadh", trim: true, maxlength: 100 },
      country: { type: String, default: "Saudi Arabia", trim: true, maxlength: 100 },
      phone: { type: String, default: "+9665082140327", trim: true, maxlength: 40 },
      whatsapp: { type: String, default: "", trim: true, maxlength: 40 },
      email: { type: String, default: "hello@duneandgrills.com", trim: true, lowercase: true, maxlength: 200, validate: { validator: (value) => !value || emailPattern.test(value), message: "Contact email is invalid" } },
      directionsUrl: { type: String, default: "https://maps.app.goo.gl/fB8oDz42G7eb1JLs6", trim: true, maxlength: 1000, validate: { validator: (value) => !value || httpUrlPattern.test(value), message: "Directions URL must use HTTP or HTTPS" } },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("RestaurantSettings", restaurantSettingsSchema);
