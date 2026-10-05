import assert from "node:assert/strict";
import { test } from "node:test";
import { recordExportRows, RECORD_EXPORT_HEADINGS } from "../src/utils/recordIdExports.js";

test("record exports preserve readable and external identifiers without inventing IDs", () => {
  const [row] = recordExportRows([{ type: "refund", readableId: "RFN-2026-000123", identifiers: { refundNumber: "RFN-2026-000123", externalOrderId: "legacy-ref" }, title: "Refund", status: "completed", date: "2026-10-05", context: "PO-legacy" }]);
  assert.equal(row[1], "RFN-2026-000123"); assert.ok(row[2].includes("legacy-ref")); assert.equal(row.length, RECORD_EXPORT_HEADINGS.length);
});
test("CSV record summaries neutralize spreadsheet formulas", () => {
  const [row] = recordExportRows([{ title: "=HYPERLINK(\"unsafe\")", context: "+cmd", readableId: "-custom" }]);
  assert.equal(row[1], "'-custom"); assert.ok(row[3].startsWith("'=")); assert.equal(row[6], "'+cmd");
});
