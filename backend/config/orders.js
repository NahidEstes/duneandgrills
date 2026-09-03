const deliveryFeeSetting = process.env.DELIVERY_FEE_SAR?.trim();
const configuredDeliveryFee = deliveryFeeSetting
  ? Number(deliveryFeeSetting)
  : Number.NaN;

export const DELIVERY_FEE_SAR =
  Number.isFinite(configuredDeliveryFee) && configuredDeliveryFee >= 0
    ? Number(configuredDeliveryFee.toFixed(2))
    : 10;

export const DEFAULT_ORDER_TYPE = "delivery";

export const ORDER_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: "dine-in", label: "Dine-in" }),
  Object.freeze({ value: "pickup", label: "Pickup" }),
  Object.freeze({ value: "delivery", label: "Delivery" }),
]);

export const ORDER_TYPES = [
  ...ORDER_TYPE_OPTIONS.map(({ value }) => value),
  "takeaway",
];

export const isValidOrderType = (value) => ORDER_TYPES.includes(value);

export const getDeliveryFee = (orderType) =>
  orderType === "delivery" ? DELIVERY_FEE_SAR : 0;

export const getPublicOrderConfig = () => ({
  currency: "SAR",
  defaultOrderType: DEFAULT_ORDER_TYPE,
  orderTypes: ORDER_TYPE_OPTIONS.map((option) => ({
    ...option,
    deliveryFee: getDeliveryFee(option.value),
  })),
});
