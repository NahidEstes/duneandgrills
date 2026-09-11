const roundQuantity = (value) => Number(Number(value).toFixed(6));
const roundCost = (value) => Number(Number(value).toFixed(6));

export const getPurchaseConfiguration = (item) => {
  const baseUnit = item?.unit;
  const purchaseUnit = item?.purchaseUnit || baseUnit;
  const configuredFactor = Number(item?.purchaseConversionFactor);
  const conversionFactor = Number.isFinite(configuredFactor) && configuredFactor > 0
    ? configuredFactor
    : 1;
  return { baseUnit, purchaseUnit, conversionFactor };
};

export const toBaseQuantity = (purchaseQuantity, conversionFactor) =>
  roundQuantity(Number(purchaseQuantity) * Number(conversionFactor));

export const toBaseUnitCost = (purchaseUnitCost, conversionFactor) =>
  roundCost(Number(purchaseUnitCost) / Number(conversionFactor));

export const describePurchaseConversion = (item) => {
  const { baseUnit, purchaseUnit, conversionFactor } = getPurchaseConfiguration(item);
  return `1 ${purchaseUnit} = ${conversionFactor} ${baseUnit}`;
};
