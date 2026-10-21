// Read every page using the filters captured when the export starts. Never write records.
export async function collectInventoryReport(fetchPage, filters, onProgress = () => {}) {
  const rows = [];
  const ids = new Set();
  let expectedTotal;
  let pages = 1;
  for (let page = 1; page <= pages; page += 1) {
    const response = await fetchPage({ ...filters, page, limit: 100 });
    const pagination = response?.pagination;
    if (!Array.isArray(response?.data) || !Number.isInteger(pagination?.total) || pagination.total < 0
      || !Number.isInteger(pagination.pages) || pagination.pages < 0 || pagination.page !== page
      || !Number.isInteger(pagination.limit) || pagination.limit < 1
      || pagination.pages !== Math.ceil(pagination.total / pagination.limit)) {
      throw new Error("The report response was incomplete. Please refresh and retry the export.");
    }
    if (expectedTotal !== undefined && pagination.total !== expectedTotal) {
      throw new Error("Report records changed during export. Please retry to download a complete report.");
    }
    expectedTotal = pagination.total;
    pages = pagination.pages;
    if (response.data.length !== Math.min(pagination.limit, Math.max(0, expectedTotal - (page - 1) * pagination.limit))) {
      throw new Error("The report response was incomplete. No partial file was downloaded.");
    }
    for (const row of response.data) {
      const id = row?._id == null ? "" : String(row._id);
      if (!id || ids.has(id)) throw new Error("Report records changed during export. Please retry the export.");
      ids.add(id);
      rows.push(row);
    }
    onProgress({ loaded: rows.length, total: expectedTotal });
  }
  return rows;
}

export function inventoryReportCsvHeaders(rows) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => !key.startsWith("_") && typeof row[key] !== "object")))];
  return keys.map(key => [key, row => {
    const value = row[key] ?? "";
    return typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  }]);
}
