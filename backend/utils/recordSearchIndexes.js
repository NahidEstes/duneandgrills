// Keep exact, case-insensitive ID lookups indexable without rewriting historical values.
export function addRecordSearchIndexes(schema, fields) {
  for (const field of fields) schema.index({ [field]: 1 }, { name: `record_search_${field}`, collation: { locale: "en", strength: 2 } });
}
