const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const roundSar = (value) =>
  Math.round((asNonNegativeNumber(value) + Number.EPSILON) * 100) / 100;

export const calculateIngredientCost = ({ quantityPerSale, costPerUnit, isActive = true }) => {
  if (!isActive) return 0;
  if (costPerUnit == null || String(costPerUnit).trim() === "" || !["number", "string"].includes(typeof costPerUnit) || !Number.isFinite(Number(costPerUnit)) || Number(costPerUnit) < 0 || Number(costPerUnit) > Number.MAX_SAFE_INTEGER / 100 || !Number.isFinite(Number(quantityPerSale)) || Number(quantityPerSale) <= 0 || Number(quantityPerSale) * Number(costPerUnit) > Number.MAX_SAFE_INTEGER / 100) return null;
  return roundSar(Number(quantityPerSale) * Number(costPerUnit));
};

export const calculateRecipeSummary = ({ ingredients, sellingPrice, detailsFor, doNotTrack = false }) => {
  const lineCosts = ingredients.map(line => {
        const item = detailsFor(line);
        return calculateIngredientCost({
          quantityPerSale: line.quantityPerSale,
          costPerUnit: item?.unitCost,
          isActive: line.isActive,
        });
      });
  const complete = !doNotTrack && ingredients.some(line => line.isActive !== false) && lineCosts.every(value => value != null) && lineCosts.reduce((sum, value) => sum + value, 0) <= Number.MAX_SAFE_INTEGER / 100;
  const totalEstimatedIngredientCost = complete ? roundSar(lineCosts.reduce((sum, value) => sum + value, 0)) : null;
  const normalizedSellingPrice = roundSar(sellingPrice);
  const estimatedProfit = complete ? Number(
    (normalizedSellingPrice - totalEstimatedIngredientCost).toFixed(2)
  ) : null;
  const profitMargin = !complete ? null : normalizedSellingPrice > 0
    ? Number(((estimatedProfit / normalizedSellingPrice) * 100).toFixed(1))
    : 0;

  return {
    totalEstimatedIngredientCost,
    sellingPrice: normalizedSellingPrice,
    estimatedProfit,
    profitMargin,
  };
};
