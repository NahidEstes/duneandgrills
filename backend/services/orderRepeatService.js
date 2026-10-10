import { resolveCartLines } from "./catalogService.js";

// Revalidate every historical line against today's catalog, including add-ons.
export async function repeatOrderLines(order) {
  const data = []; const warnings = [];
  for (const item of order.items || []) {
    if (item.isReward) continue;
    try {
      const [line] = await resolveCartLines([{ productId: item.productType === "combo" ? item.combo : item.menuItem,
        productType: item.productType, quantity: item.quantity,
        customization: { selectedAddOns: item.selectedAddOns, spiceLevel: item.spiceLevel, note: item.itemNote } }]);
      data.push({ _id: line.product._id, productType: line.productType, name: line.product.name, image: line.product.image,
        price: line.unitPrice, quantity: line.quantity, selectedAddOns: line.customization.selectedAddOns.map(add => ({ ...add, _id: add.addOn })),
        spiceLevel: line.customization.spiceLevel, note: line.customization.note, customizationKey: line.customization.key });
    } catch (error) {
      if (!error.status) throw error;
      warnings.push(`${item.name}: ${error.message}`);
    }
  }
  return { data, warnings };
}
