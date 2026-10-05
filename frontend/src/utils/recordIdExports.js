export const RECORD_EXPORT_HEADINGS = ["Record type", "Readable ID", "Identifiers", "Title", "Status", "Date", "Context"];
const safeCell = value => {
  const text = String(value ?? "");
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
};
export const recordExportRows = records => records.map(record => [
  record.type, record.readableId,
  Object.entries(record.identifiers || {}).map(([key, value]) => `${key}: ${value}`).join(" | "),
  record.title, record.status, record.date, record.context,
].map(safeCell));
