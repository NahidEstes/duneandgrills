const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const when = value => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
export function productionLabelHtml(record) {
  if (record.status !== "completed" || !record.productionNumber || !record.recipeSnapshot?.name || !record.preparedAt) throw Error("A confirmed, completed batch is required for a label.");
  const expiry = record.expiryDate ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(record.expiryDate)) : "Not expiry-tracked";
  const finishedName = record.finishedName || `Name not recorded (${record.finishedItem})`;
  const compact = record.recipeSnapshot.name.length + finishedName.length > 120;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Batch label ${escape(record.productionNumber)}</title><style>
    @page { size: 80mm 80mm; margin: 4mm; }
    * { box-sizing: border-box; } body { margin: 0; background: white; color: black; font-family: Arial, sans-serif; font-size: 10pt; }
    article { width: 72mm; max-width: 100%; padding: 2mm; border: 1px solid black; overflow-wrap: anywhere; }
    h1 { font-size: 13pt; margin: 0 0 2mm; } p { margin: 1.5mm 0; } .batch { font-weight: bold; border-block: 1px solid black; padding: 2mm 0; }
    small { font-size: 8pt; } @media screen { body { padding: 4mm; } }
    ${compact ? "body { font-size: 8pt; line-height: 1.15; } article { padding: 1.5mm; } h1 { font-size: 9pt; } p { margin: 1mm 0; } .batch { padding: 1mm 0; }" : ""}
    </style></head><body><article><h1>${escape(record.recipeSnapshot.name)}</h1>
    <p><strong>Finished item:</strong> ${escape(finishedName)}</p>
    <p class="batch">${escape(record.productionNumber)}</p>
    <p><strong>Prepared:</strong> ${escape(when(record.preparedAt))}</p>
    <p><strong>Use by:</strong> ${escape(expiry)}</p><small>Asia/Riyadh</small>
    </article></body></html>`;
}
