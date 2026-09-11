const asNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const roundSar = (value) =>
  Math.round((asNonNegativeNumber(value) + Number.EPSILON) * 100) / 100;

export const calculateIngredientCost = ({ quantityPerSale, costPerUnit, isActive = true }) =>
  isActive ? roundSar(asNonNegativeNumber(quantityPerSale) * asNonNegativeNumber(costPerUnit)) : 0;

export const calculateRecipeSummary = ({ ingredients, sellingPrice, detailsFor, doNotTrack = false }) => {
  const totalEstimatedIngredientCost = doNotTrack
    ? 0
    : roundSar(ingredients.reduce((total, line) => {
        const item = detailsFor(line);
        return total + calculateIngredientCost({
          quantityPerSale: line.quantityPerSale,
          costPerUnit: item?.unitCost,
          isActive: line.isActive,
        });
      }, 0));
  const normalizedSellingPrice = roundSar(sellingPrice);
  const estimatedProfit = Number(
    (normalizedSellingPrice - totalEstimatedIngredientCost).toFixed(2)
  );
  const profitMargin = normalizedSellingPrice > 0
    ? Number(((estimatedProfit / normalizedSellingPrice) * 100).toFixed(1))
    : 0;

  return {
    totalEstimatedIngredientCost,
    sellingPrice: normalizedSellingPrice,
    estimatedProfit,
    profitMargin,
  };
};
