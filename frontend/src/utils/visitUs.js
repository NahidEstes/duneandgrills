const DAY_ORDER = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

const DAY_SHORT_LABELS = {
  saturday: "Sat",
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

const DAY_FULL_LABELS = {
  saturday: "Saturday",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

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

const groupLabel = (days) => days.length === 1
  ? DAY_FULL_LABELS[days[0]] || days[0]
  : `${DAY_SHORT_LABELS[days[0]] || days[0]}–${DAY_SHORT_LABELS[days.at(-1)] || days.at(-1)}`;

export const groupOpeningHours = (openingHours = []) => {
  const byDay = new Map(openingHours.map((entry) => [entry.day, entry]));
  return DAY_ORDER.reduce((groups, day) => {
    const entry = byDay.get(day);
    if (!entry) return groups;
    const signature = scheduleSignature(entry);
    const previous = groups.at(-1);
    if (previous?.signature === signature) {
      previous.days.push(day);
      previous.label = groupLabel(previous.days);
      return groups;
    }
    groups.push({
      days: [day],
      isOpen: entry.isOpen,
      label: groupLabel([day]),
      schedule: openingScheduleLabel(entry),
      signature,
    });
    return groups;
  }, []).map(({ signature: _signature, ...group }) => group);
};

export const buildMapEmbedUrl = (location = {}) => {
  const locationLabel = [location.address, location.city, location.country].filter(Boolean).join(", ");
  if (!locationLabel) return "";
  const params = new URLSearchParams({ q: locationLabel, z: "12", output: "embed" });
  return `https://www.google.com/maps?${params.toString()}`;
};
