// Presentation/planning only. No stock balances or costs are posted from here.
export function preparationSequence(recipe, recipes, items, limit = 100) {
  if (!recipe?.finishedItem) return { nodes: [], truncated: false };
  const definitions = new Map(recipes.map(row => [String(row.finishedItem), row]));
  definitions.set(String(recipe.finishedItem), recipe);
  const seen = new Set(), nodes = [], work = [{ id: String(recipe.finishedItem), exit: false }];
  let truncated = false;
  while (work.length) {
    const entry = work.pop();
    if (entry.exit) { nodes.push({ item: items.find(row => String(row._id) === entry.id), id: entry.id, recipe: definitions.get(entry.id) }); continue; }
    if (seen.has(entry.id)) continue;
    if (seen.size >= limit) { truncated = true; continue; }
    seen.add(entry.id); work.push({ ...entry, exit: true });
    for (const line of [...(definitions.get(entry.id)?.ingredients || [])].reverse()) if (line.inventoryItem) work.push({ id: String(line.inventoryItem), exit: false });
  }
  return { nodes, truncated };
}
export function stockImpact(plan) {
  const after = (before, delta) => Number.isFinite(before) ? Number((before + delta).toFixed(6)) : null;
  return [...plan.ingredients.map(line => ({ name: line.name, unit: line.unit, before: line.physicalStock, change: -line.quantity, after: after(line.physicalStock, -line.quantity) })), { name: plan.finishedName, unit: plan.unit, before: plan.finishedPhysicalStock, change: plan.actualQuantity, after: after(plan.finishedPhysicalStock, plan.actualQuantity) }];
}
