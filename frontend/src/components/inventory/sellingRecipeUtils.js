export const draftFromRecipe = (record, kind) => ({
  doNotTrack: record.recipe?.doNotTrack === true, isActive: record.recipe?.isActive !== false,
  ingredients: (record.recipe?.ingredients || []).map(line => ({
    inventoryItem: String(line.inventoryItem?._id || line.inventoryItem || ""), quantity: String(line.enteredQuantity ?? line[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"] ?? ""),
    enteredUnit: line.enteredUnit || line.unit || "", isActive: line.isActive !== false,
  })),
});
export const formatReferenceCost = value => value == null || !Number.isFinite(Number(value)) ? "Unavailable" : "SAR " + Number(value).toFixed(2);
export const draftEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
