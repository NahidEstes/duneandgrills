const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const roundSar = (value) =>
  Math.round((asNonNegativeNumber(value) + Number.EPSILON) * 100) / 100;

export const calculateRecipeCosts = ({ ingredients = [], sellingPrice = 0 }) => {
  const lines = ingredients.map((line) => {
    const rawCostPerUnit = asNonNegativeNumber(line?.inventoryItem?.unitCost);
    const costPerUnit = roundSar(rawCostPerUnit);
    const quantityPerSale = asNonNegativeNumber(line?.quantityPerSale);
    const ingredientCostPerDish = line?.isActive === false
      ? 0
      : roundSar(quantityPerSale * rawCostPerUnit);

    return { costPerUnit, ingredientCostPerDish };
  });

  const totalEstimatedIngredientCost = roundSar(
    lines.reduce((total, line) => total + line.ingredientCostPerDish, 0)
  );
  const normalizedSellingPrice = roundSar(sellingPrice);
  const estimatedProfit = Number(
    (normalizedSellingPrice - totalEstimatedIngredientCost).toFixed(2)
  );
  const profitMargin = normalizedSellingPrice > 0
    ? Number(((estimatedProfit / normalizedSellingPrice) * 100).toFixed(1))
    : 0;

  return {
    lines,
    totalEstimatedIngredientCost,
    sellingPrice: normalizedSellingPrice,
    estimatedProfit,
    profitMargin,
    currency: "SAR",
  };
};
