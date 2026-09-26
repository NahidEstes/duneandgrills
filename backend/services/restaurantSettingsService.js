import { DELIVERY_FEE_SAR } from "../config/orders.js";
import RestaurantSettings, { RESTAURANT_DAYS } from "../models/RestaurantSettings.js";
import { recordAuditLog } from "./auditLogService.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const envNumber = (name, fallback, minimum, maximum) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const isLegacyDefaultOpeningHours = (openingHours) => (
  Array.isArray(openingHours)
  && openingHours.length === RESTAURANT_DAYS.length
  && openingHours.every((entry) => (
    entry?.isOpen === true
    && Array.isArray(entry.periods)
    && entry.periods.length === 1
    && entry.periods[0]?.open === "11:00"
    && entry.periods[0]?.close === "23:00"
  ))
);

export const upgradeLegacyOpeningHours = (openingHours) => isLegacyDefaultOpeningHours(openingHours)
  ? openingHours.map((entry) => entry.day === "friday"
    ? { ...entry, periods: [{ open: "13:00", close: "23:00" }] }
    : entry)
  : openingHours;

export const getRestaurantSettingsDefaults = () => ({
  timezone: "Asia/Riyadh",
  openingHours: RESTAURANT_DAYS.map((day) => ({
    day,
    isOpen: true,
    periods: [{ open: day === "friday" ? "13:00" : "11:00", close: "23:00" }],
  })),
  orders: {
    deliveryFee: envNumber("DELIVERY_FEE_SAR", DELIVERY_FEE_SAR, 0, 10000),
    minimumDeliveryOrder: envNumber("MINIMUM_DELIVERY_ORDER_SAR", 0, 0, 100000),
    channels: { website: true, pos: true, phone: true, jahez: true, hungerstation: true },
  },
  notifications: {
    adminSoundEnabled: true,
    kitchenSoundEnabled: true,
    alertRepeatIntervalSeconds: envNumber("ORDER_ALERT_REPEAT_SECONDS", 5, 2, 300),
    maximumAlertRepeats: envNumber("ORDER_ALERT_MAX_REPEATS", 60, 1, 500),
    pollingIntervalSeconds: envNumber("ORDER_NOTIFICATION_POLL_SECONDS", 5, 3, 60),
  },
  preparation: {
    defaultMinutes: envNumber("KITCHEN_DEFAULT_PREP_MINUTES", 20, 1, 240),
  },
  posShifts: {
    enabled: false,
    requireOpenShift: false,
    blindClose: false,
    varianceThreshold: 50,
  },
  procurement: {
    purchaseApprovalThreshold: 5000,
    overReceiveTolerancePercent: 0,
    invoiceQuantityTolerancePercent: 0,
    invoicePriceTolerancePercent: 2,
    invoicePriceToleranceAmount: 1,
    largePaymentThreshold: 10000,
    priceAlertPercent: 10,
    priceAlertAmount: 5,
    blockPriceIncrease: false,
  },
  receipt: {
    displayName: "Dune & Grills",
    header: "ORDER RECEIPT",
    footer: "Thank you for visiting Dune & Grills.",
    websiteUrl: "https://duneandgrills.com",
    logoUrl: "",
  },
  location: {
    address: "Wadi As Sarh, Al Wadi",
    city: "Riyadh",
    country: "Saudi Arabia",
    phone: "+9665082140327",
    whatsapp: "",
    email: "hello@duneandgrills.com",
    directionsUrl: "https://maps.app.goo.gl/fB8oDz42G7eb1JLs6",
  },
});

const mergeSettings = (defaults, stored) => ({
  ...defaults,
  ...stored,
  openingHours: Array.isArray(stored?.openingHours) && stored.openingHours.length
    ? upgradeLegacyOpeningHours(stored.openingHours)
    : defaults.openingHours,
  orders: {
    ...defaults.orders,
    ...(stored?.orders || {}),
    channels: { ...defaults.orders.channels, ...(stored?.orders?.channels || {}) },
  },
  notifications: { ...defaults.notifications, ...(stored?.notifications || {}) },
  preparation: { ...defaults.preparation, ...(stored?.preparation || {}) },
  posShifts: { ...defaults.posShifts, ...(stored?.posShifts || {}) },
  procurement: { ...defaults.procurement, ...(stored?.procurement || {}) },
  receipt: { ...defaults.receipt, ...(stored?.receipt || {}) },
  location: { ...defaults.location, ...(stored?.location || {}) },
});

export const getEffectiveRestaurantSettings = async () => {
  const stored = await RestaurantSettings.findOne({ key: "default" }).lean();
  return mergeSettings(getRestaurantSettingsDefaults(), stored || {});
};

const text = (value, label, maximum, fallback = "") => {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new ValidationError(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ValidationError(`${label} is too long`);
  return normalized;
};

const number = (value, label, minimum, maximum, fallback, integer = false) => {
  if (value === undefined || value === "") return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum || normalized > maximum || (integer && !Number.isInteger(normalized))) {
    throw new ValidationError(`${label} must be ${integer ? "a whole number " : ""}between ${minimum} and ${maximum}`);
  }
  return integer ? normalized : Number(normalized.toFixed(2));
};

const bool = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ValidationError("Toggle values must be true or false");
  return value;
};

const optionalUrl = (value, label, maximum, fallback) => {
  const normalized = text(value, label, maximum, fallback);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return normalized;
  } catch {
    throw new ValidationError(`${label} must be a valid HTTP or HTTPS URL`);
  }
};

const normalizeOpeningHours = (value, fallback) => {
  if (value === undefined) return clone(fallback);
  if (!Array.isArray(value) || value.length !== RESTAURANT_DAYS.length) {
    throw new ValidationError("Opening hours must include every day of the week");
  }
  const byDay = new Map(value.map((entry) => [entry?.day, entry]));
  if (byDay.size !== RESTAURANT_DAYS.length || RESTAURANT_DAYS.some((day) => !byDay.has(day))) {
    throw new ValidationError("Opening hours contain missing or duplicate days");
  }
  return RESTAURANT_DAYS.map((day) => {
    const entry = byDay.get(day);
    if (typeof entry.isOpen !== "boolean") {
      throw new ValidationError(`${day} open status must be true or false`);
    }
    const isOpen = entry.isOpen;
    const periods = Array.isArray(entry.periods) ? entry.periods : [];
    if (isOpen && (periods.length < 1 || periods.length > 2)) {
      throw new ValidationError(`${day} must have one or two service periods`);
    }
    if (!isOpen && periods.length > 2) {
      throw new ValidationError(`${day} cannot have more than two service periods`);
    }
    const normalizedPeriods = periods.slice(0, 2).map((period) => {
      if (!timePattern.test(period?.open || "") || !timePattern.test(period?.close || "")) {
        throw new ValidationError(`${day} contains an invalid time`);
      }
      if (period.open === period.close) throw new ValidationError(`${day} opening and closing times cannot be identical`);
      return { open: period.open, close: period.close };
    });
    return { day, isOpen, periods: normalizedPeriods };
  });
};

export const normalizeRestaurantSettings = (payload = {}, current = getRestaurantSettingsDefaults()) => {
  const channels = payload.orders?.channels || {};
  const normalized = {
    timezone: "Asia/Riyadh",
    openingHours: normalizeOpeningHours(payload.openingHours, current.openingHours),
    orders: {
      deliveryFee: number(payload.orders?.deliveryFee, "Delivery fee", 0, 10000, current.orders.deliveryFee),
      minimumDeliveryOrder: number(payload.orders?.minimumDeliveryOrder, "Minimum delivery order", 0, 100000, current.orders.minimumDeliveryOrder),
      channels: Object.fromEntries(Object.keys(current.orders.channels).map((channel) => [
        channel,
        bool(channels[channel], current.orders.channels[channel]),
      ])),
    },
    notifications: {
      adminSoundEnabled: bool(payload.notifications?.adminSoundEnabled, current.notifications.adminSoundEnabled),
      kitchenSoundEnabled: bool(payload.notifications?.kitchenSoundEnabled, current.notifications.kitchenSoundEnabled),
      alertRepeatIntervalSeconds: number(payload.notifications?.alertRepeatIntervalSeconds, "Alert repeat interval", 2, 300, current.notifications.alertRepeatIntervalSeconds, true),
      maximumAlertRepeats: number(payload.notifications?.maximumAlertRepeats, "Maximum alert repeats", 1, 500, current.notifications.maximumAlertRepeats, true),
      pollingIntervalSeconds: number(payload.notifications?.pollingIntervalSeconds, "Polling interval", 3, 60, current.notifications.pollingIntervalSeconds, true),
    },
    preparation: {
      defaultMinutes: number(payload.preparation?.defaultMinutes, "Default preparation time", 1, 240, current.preparation.defaultMinutes, true),
    },
    posShifts: {
      enabled: bool(payload.posShifts?.enabled, current.posShifts.enabled),
      requireOpenShift: bool(payload.posShifts?.requireOpenShift, current.posShifts.requireOpenShift),
      blindClose: bool(payload.posShifts?.blindClose, current.posShifts.blindClose),
      varianceThreshold: number(payload.posShifts?.varianceThreshold, "POS shift variance threshold", 0, 100000, current.posShifts.varianceThreshold),
    },
    procurement: {
      purchaseApprovalThreshold: number(payload.procurement?.purchaseApprovalThreshold, "Purchase approval threshold", 0, 10000000, current.procurement.purchaseApprovalThreshold),
      overReceiveTolerancePercent: number(payload.procurement?.overReceiveTolerancePercent, "Over receive tolerance", 0, 100, current.procurement.overReceiveTolerancePercent),
      invoiceQuantityTolerancePercent: number(payload.procurement?.invoiceQuantityTolerancePercent, "Invoice quantity tolerance", 0, 100, current.procurement.invoiceQuantityTolerancePercent),
      invoicePriceTolerancePercent: number(payload.procurement?.invoicePriceTolerancePercent, "Invoice price tolerance", 0, 100, current.procurement.invoicePriceTolerancePercent),
      invoicePriceToleranceAmount: number(payload.procurement?.invoicePriceToleranceAmount, "Invoice price tolerance amount", 0, 1000000, current.procurement.invoicePriceToleranceAmount),
      largePaymentThreshold: number(payload.procurement?.largePaymentThreshold, "Large supplier payment threshold", 0, 10000000, current.procurement.largePaymentThreshold),
      priceAlertPercent: number(payload.procurement?.priceAlertPercent, "Purchase price alert percent", 0, 1000, current.procurement.priceAlertPercent),
      priceAlertAmount: number(payload.procurement?.priceAlertAmount, "Purchase price alert amount", 0, 1000000, current.procurement.priceAlertAmount),
      blockPriceIncrease: bool(payload.procurement?.blockPriceIncrease, current.procurement.blockPriceIncrease),
    },
    receipt: {
      displayName: text(payload.receipt?.displayName, "Restaurant display name", 120, current.receipt.displayName),
      header: text(payload.receipt?.header, "Receipt header", 160, current.receipt.header),
      footer: text(payload.receipt?.footer, "Receipt footer", 500, current.receipt.footer),
      websiteUrl: optionalUrl(payload.receipt?.websiteUrl, "Website URL", 500, current.receipt.websiteUrl),
      logoUrl: optionalUrl(payload.receipt?.logoUrl, "Logo URL", 1000, current.receipt.logoUrl),
    },
    location: {
      address: text(payload.location?.address, "Restaurant address", 300, current.location.address),
      city: text(payload.location?.city, "City", 100, current.location.city),
      country: text(payload.location?.country, "Country", 100, current.location.country),
      phone: text(payload.location?.phone, "Contact phone", 40, current.location.phone),
      whatsapp: text(payload.location?.whatsapp, "WhatsApp number", 40, current.location.whatsapp),
      email: text(payload.location?.email, "Contact email", 200, current.location.email).toLowerCase(),
      directionsUrl: optionalUrl(payload.location?.directionsUrl, "Google Maps URL", 1000, current.location.directionsUrl),
    },
  };
  if (normalized.location.email && !emailPattern.test(normalized.location.email)) {
    throw new ValidationError("Contact email is invalid");
  }
  if (!normalized.receipt.displayName) throw new ValidationError("Restaurant display name is required");
  return normalized;
};

export const getRestaurantSettingsDiff = (before, after) => {
  const oldValues = [];
  const newValues = [];
  const changedFields = [];
  const walk = (oldValue, newValue, path) => {
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      const length = Math.max(oldValue.length, newValue.length);
      for (let index = 0; index < length; index += 1) {
        walk(oldValue[index], newValue[index], `${path}.${index}`);
      }
      return;
    }
    if (
      oldValue && newValue &&
      typeof oldValue === "object" && typeof newValue === "object" &&
      !Array.isArray(oldValue) && !Array.isArray(newValue)
    ) {
      for (const key of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) {
        walk(oldValue[key], newValue[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    oldValues.push({ field: path, value: oldValue ?? null });
    newValues.push({ field: path, value: newValue ?? null });
    changedFields.push(path);
  };
  for (const group of ["openingHours", "orders", "notifications", "preparation", "posShifts", "procurement", "receipt", "location"]) walk(before[group], after[group], group);
  return { oldValues, newValues, changedFields };
};

export const toAdminRestaurantSettings = (settings, configured = true) => ({
  configured,
  timezone: settings.timezone,
  openingHours: settings.openingHours,
  orders: settings.orders,
  notifications: settings.notifications,
  preparation: settings.preparation,
  posShifts: settings.posShifts,
  procurement: settings.procurement,
  receipt: settings.receipt,
  location: settings.location,
  updatedAt: settings.updatedAt || null,
});

export const toPublicRestaurantSettings = (settings) => ({
  timezone: settings.timezone,
  openingHours: settings.openingHours,
  orders: {
    deliveryFee: settings.orders.deliveryFee,
    minimumDeliveryOrder: settings.orders.minimumDeliveryOrder,
    channels: {
      website: settings.orders.channels.website,
      pos: settings.orders.channels.pos,
    },
  },
  preparation: settings.preparation,
  receipt: {
    ...settings.receipt,
    address: [settings.location.address, settings.location.city, settings.location.country].filter(Boolean).join(", "),
    phone: settings.location.phone,
    email: settings.location.email,
  },
  location: settings.location,
});

export const loadAdminRestaurantSettings = async () => {
  const stored = await RestaurantSettings.findOne({ key: "default" }).lean();
  return toAdminRestaurantSettings(mergeSettings(getRestaurantSettingsDefaults(), stored || {}), Boolean(stored));
};

export const updateRestaurantSettings = async (payload, actor) => {
  const existing = await RestaurantSettings.findOne({ key: "default" }).lean();
  const before = mergeSettings(getRestaurantSettingsDefaults(), existing || {});
  const normalized = normalizeRestaurantSettings(payload, before);
  const diff = getRestaurantSettingsDiff(before, normalized);
  if (!diff.changedFields.length && existing) return toAdminRestaurantSettings(before, true);

  const updated = await RestaurantSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { ...normalized, updatedBy: actor._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  if (diff.changedFields.length) {
    await recordAuditLog({
      actor,
      action: "RESTAURANT_SETTINGS_UPDATED",
      entityType: "RestaurantSettings",
      entityId: updated._id,
      entityLabel: "Restaurant settings",
      before: diff.oldValues,
      after: diff.newValues,
      metadata: { changedFields: diff.changedFields },
    });
  }
  return toAdminRestaurantSettings(mergeSettings(getRestaurantSettingsDefaults(), updated), true);
};
