const pad = (value) => String(value).padStart(2, "0");

export const parseDateValue = (value) => {
  if (typeof value !== "string" || !value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
    || date.getHours() !== Number(hour)
    || date.getMinutes() !== Number(minute)
  ) return null;
  return date;
};

export const formatDateValue = (date, type = "date") => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return type === "datetime-local"
    ? `${datePart}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    : datePart;
};

export const formatDateEntry = (date, type = "date") => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const datePart = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  return type === "datetime-local"
    ? `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : datePart;
};

export const parseDateEntry = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const localMatch = normalized.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
  if (localMatch) {
    const [, day, month, year, hour = "0", minute = "0"] = localMatch;
    return parseDateValue(`${year}-${month}-${day}T${hour}:${minute}`);
  }
  return parseDateValue(normalized.replace(" ", "T"));
};

export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date, amount) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

export const addDays = (date, amount) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, date.getHours(), date.getMinutes());

export const buildCalendarDays = (month) => {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
};

export const sameDay = (left, right) => Boolean(left && right)
  && left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

export const isDateAllowed = (date, type, min, max) => {
  const value = formatDateValue(date, type);
  return (!min || value >= min) && (!max || value <= max);
};
