import { ValidationError } from "./inventoryValidation.js";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
export const ADMIN_DAY_MS = 24 * 60 * 60 * 1000;

export const parseRiyadhDate = (value, label = "date") => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new ValidationError(`${label} must use YYYY-MM-DD`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) - RIYADH_OFFSET_MS);
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  if (
    shifted.getUTCFullYear() !== year ||
    shifted.getUTCMonth() !== month - 1 ||
    shifted.getUTCDate() !== day
  ) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return date;
};
