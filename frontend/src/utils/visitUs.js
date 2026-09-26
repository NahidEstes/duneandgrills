export const OPENING_HOUR_GROUPS = [
  {
    id: "sat-thu",
    label: "Sat–Thu",
    days: ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"],
    defaultOpen: "11:00",
  },
  { id: "friday", label: "Friday", days: ["friday"], defaultOpen: "13:00" },
];

export const displayOpeningTime = (value = "") => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};

export const openingScheduleLabel = (entry) => {
  if (!entry?.isOpen) return "Closed";
  return (entry.periods || [])
    .map((period) => `${displayOpeningTime(period.open)} – ${displayOpeningTime(period.close)}`)
    .join(" · ");
};

const scheduleSignature = (entry) => JSON.stringify({
  isOpen: Boolean(entry?.isOpen),
  periods: (entry?.periods || []).map(({ open, close }) => ({ open, close })),
});

export const groupOpeningHours = (openingHours = []) => {
  const byDay = new Map(openingHours.map((entry) => [entry.day, entry]));
  return OPENING_HOUR_GROUPS.flatMap((group) => {
    const entry = group.days.map((day) => byDay.get(day)).find(Boolean);
    return entry ? [{
      days: group.days,
      isOpen: entry.isOpen,
      label: group.label,
      schedule: openingScheduleLabel(entry),
    }] : [];
  });
};

export const getOpeningHoursGroup = (openingHours = [], group) => {
  const entries = group.days.map((day) => openingHours.find((entry) => entry.day === day)).filter(Boolean);
  const representative = entries[0] || {
    isOpen: true,
    periods: [{ open: group.defaultOpen, close: "23:00" }],
  };
  return {
    isOpen: representative.isOpen,
    periods: representative.periods || [],
    mixed: entries.some((entry) => scheduleSignature(entry) !== scheduleSignature(representative)),
  };
};

export const applyOpeningHoursGroup = (openingHours = [], group, nextValue) => openingHours.map((entry) => (
  group.days.includes(entry.day)
    ? {
      ...entry,
      isOpen: nextValue.isOpen,
      periods: (nextValue.periods || []).map(({ open, close }) => ({ open, close })),
    }
    : entry
));

export const buildMapEmbedUrl = (location = {}) => {
  const locationLabel = [location.address, location.city, location.country].filter(Boolean).join(", ");
  if (!locationLabel) return "";
  const params = new URLSearchParams({ q: locationLabel, z: "12", output: "embed" });
  return `https://www.google.com/maps?${params.toString()}`;
};
