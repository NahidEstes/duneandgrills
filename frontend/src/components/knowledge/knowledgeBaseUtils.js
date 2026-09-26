const normalize = (value) => String(value || "").trim().toLowerCase();

export const filterKnowledgeGuides = (guides, filters = {}) => {
  const query = normalize(filters.query);
  const role = normalize(filters.role);
  const category = normalize(filters.category);
  const type = normalize(filters.type);

  return guides.filter((guide) => {
    if (role && role !== "all" && !guide.roles.map(normalize).includes(role)) return false;
    if (category && normalize(guide.category) !== category) return false;
    if (type && normalize(guide.type) !== type) return false;
    if (!query) return true;
    const searchable = [
      guide.title,
      guide.description,
      guide.category,
      guide.type,
      ...guide.roles,
      ...(guide.keywords || []),
    ].map(normalize).join(" ");
    return searchable.includes(query);
  });
};

export const formatKnowledgeDate = (value) => new Intl.DateTimeFormat("en-SA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Riyadh",
}).format(new Date(`${value}T12:00:00+03:00`));

export const lastUpdatedLabel = (value, now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return value === today ? "Last updated today" : `Last updated ${formatKnowledgeDate(value)}`;
};
