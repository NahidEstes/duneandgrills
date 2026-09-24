import { ValidationError } from "./inventoryValidation.js";

export const toHalala = (value, label = "Amount") => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ValidationError(`${label} must be a valid non-negative SAR amount`);
  return Math.round((number + Number.EPSILON) * 100);
};

export const fromHalala = (value) => Number((Number(value || 0) / 100).toFixed(2));

export const positiveHalala = (value, label = "Amount") => {
  const amount = toHalala(value, label);
  if (amount <= 0) throw new ValidationError(`${label} must be greater than zero`);
  return amount;
};
