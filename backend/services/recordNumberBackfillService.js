import Counter from "../models/Counter.js";
import { RECORD_SEARCH_TYPES } from "./recordSearchService.js";
import { RECORD_NUMBERS, formatRecordNumber, highestRecordSequence, recordCounterKey, recordNumberStem, reserveRecordNumber } from "./recordNumberService.js";

const missing = field => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }] });

export async function backfillRecordNumbers({ apply = false } = {}) {
  const report = { mode: apply ? "apply" : "dry-run", assigned: 0, missing: 0, collisions: [], types: [] };
  // Preflight every collection before making any write. Missing IDs are excluded from unique indexes.
  for (const [type, definition] of Object.entries(RECORD_NUMBERS)) {
    const Model = Object.values(RECORD_SEARCH_TYPES).find(row => row.model.modelName === (definition.model || type))?.model;
    const duplicates = await Model.aggregate([{ $match: { [definition.field]: { $type: "string", $ne: "" } } }, { $group: { _id: { $toUpper: `$${definition.field}` }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 100 }]);
    report.collisions.push(...duplicates.map(row => ({ type, number: row._id, count: row.count })));
  }
  if (report.collisions.length) return { ...report, blocked: true };

  for (const [type, definition] of Object.entries(RECORD_NUMBERS)) {
    const Model = Object.values(RECORD_SEARCH_TYPES).find(row => row.model.modelName === (definition.model || type)).model;
    const rowReport = { type, missing: 0, assigned: 0, skipped: 0, examples: [], remaining: 0 };
    const simulated = new Map();
    const cursor = Model.find({ $and: [definition.filter || {}, missing(definition.field)] }).select("_id createdAt").sort({ createdAt: 1, _id: 1 }).lean().cursor();
    for await (const row of cursor) {
      rowReport.missing += 1;
      const date = row.createdAt || row._id.getTimestamp();
      const stem = recordNumberStem(definition, date);
      let number;
      if (apply) number = await reserveRecordNumber(type, { date, Model });
      else {
        if (!simulated.has(stem)) {
          const highest = await highestRecordSequence(Model, definition, stem);
          const counter = await Counter.findById(recordCounterKey(stem)).lean();
          simulated.set(stem, Math.max(highest, Number(counter?.seq || 0)));
        }
        simulated.set(stem, simulated.get(stem) + 1);
        number = formatRecordNumber(stem, simulated.get(stem));
      }
      if (rowReport.examples.length < 5) rowReport.examples.push({ id: String(row._id), number });
      if (apply) {
        // Raw guarded update bypasses immutability ONLY here; never touches timestamps or relationships.
        const result = await Model.collection.updateOne({ $and: [{ _id: row._id }, missing(definition.field)] }, { $set: { [definition.field]: number } });
        if (result.modifiedCount) rowReport.assigned += 1; else rowReport.skipped += 1;
      }
    }
    if (apply) {
      await Model.collection.createIndex({ [definition.field]: 1 }, { unique: true, partialFilterExpression: { [definition.field]: { $type: "string" } } });
      rowReport.remaining = await Model.countDocuments({ $and: [definition.filter || {}, missing(definition.field)] });
      const highest = new Map();
      for await (const existing of Model.find({ [definition.field]: new RegExp(`^${definition.prefix}-${definition.annual ? "\\d{4}-" : ""}\\d{6}$`, "i") }).select(definition.field).lean().cursor()) {
        const number = existing[definition.field].toUpperCase(); const stem = number.slice(0, -6);
        highest.set(stem, Math.max(highest.get(stem) || 0, Number(number.slice(-6))));
      }
      rowReport.counters = [];
      for (const [stem, floor] of highest) {
        const counter = await Counter.findOneAndUpdate({ _id: recordCounterKey(stem) }, { $max: { seq: floor } }, { upsert: true, new: true });
        rowReport.counters.push({ stem, highestAssigned: floor, counter: counter.seq });
      }
    } else rowReport.remaining = rowReport.missing;
    report.missing += rowReport.missing; report.assigned += rowReport.assigned; report.types.push(rowReport);
  }
  if (apply) {
    for (const spec of Object.values(RECORD_SEARCH_TYPES)) for (const field of spec.fields) {
      await spec.model.collection.createIndex({ [field]: 1 }, { name: `record_search_${field}`, collation: { locale: "en", strength: 2 } });
    }
  }
  return { ...report, validated: apply && report.types.every(row => row.remaining === 0) };
}
