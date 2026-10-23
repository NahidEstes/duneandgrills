const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const roundSar = (value) =>
  Math.round((asNonNegativeNumber(value) + Number.EPSILON) * 100) / 100;

export const calculateRecipeCosts = ({ ingredients = [], sellingPrice = 0, doNotTrack = false }) => {
  const known = value => value != null && String(value).trim() !== "" && ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= Number.MAX_SAFE_INTEGER / 100;
  const lines = ingredients.map((line) => {
    const valid = known(line?.inventoryItem?.unitCost) && Number(line?.quantityPerSale) > 0 && Number.isFinite(Number(line?.quantityPerSale)) && Number(line.quantityPerSale) * Number(line.inventoryItem.unitCost) <= Number.MAX_SAFE_INTEGER / 100 && (!line.unit || !line.inventoryItem?.unit || line.unit === line.inventoryItem.unit);
    const rawCostPerUnit = valid ? Number(line.inventoryItem.unitCost) : null;
    const costPerUnit = valid ? roundSar(rawCostPerUnit) : null;
    const quantityPerSale = asNonNegativeNumber(line?.quantityPerSale);
    const ingredientCostPerDish = line?.isActive === false
      ? 0
      : valid ? roundSar(quantityPerSale * rawCostPerUnit) : null;

    return { costPerUnit, ingredientCostPerDish };
  });

  const sum = lines.reduce((total, line) => total + (line.ingredientCostPerDish ?? 0), 0);
  const knownEstimatedIngredientCost = sum <= Number.MAX_SAFE_INTEGER / 100 ? roundSar(sum) : null;
  const complete = knownEstimatedIngredientCost != null && !doNotTrack && ingredients.some(line => line.isActive !== false) && lines.every(line => line.ingredientCostPerDish != null);
  const totalEstimatedIngredientCost = complete ? knownEstimatedIngredientCost : null;
  const normalizedSellingPrice = roundSar(sellingPrice);
  const estimatedProfit = complete ? Number(
    (normalizedSellingPrice - totalEstimatedIngredientCost).toFixed(2)
  ) : null;
  const profitMargin = !complete ? null : normalizedSellingPrice > 0
    ? Number(((estimatedProfit / normalizedSellingPrice) * 100).toFixed(1))
    : 0;

  return {
    lines,
    totalEstimatedIngredientCost,
    sellingPrice: normalizedSellingPrice,
    estimatedProfit,
    profitMargin,
    currency: "SAR",
    knownEstimatedIngredientCost,
    costConfidence: doNotTrack ? "not_tracked" : complete ? "reference_complete" : "incomplete",
    basis: "current_reference_costs",
  };
};
