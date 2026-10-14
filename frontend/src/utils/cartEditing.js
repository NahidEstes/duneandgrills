export function cartConfigurationKey(line) {
  const addOns = (line.selectedAddOns || []).map(row => ({ id: String(row._id || row.addOn || row.id), quantity: row.quantity || 1 })).sort((a, b) => a.id.localeCompare(b.id));
  const spiceLevel = line.spiceLevel || "", note = (line.note || "").trim();
  return addOns.length || spiceLevel || note ? JSON.stringify({ addOns, spiceLevel, note }) : "";
}
export function replaceCartConfiguration(cart, original, replacement) {
  if (original.isReward || original.productType === "combo") throw new Error("Rewards and combos cannot be customized here.");
  const type = row => row.productType || "menuItem";
  const index = cart.findIndex(row => original.cartLineId ? row.cartLineId === original.cartLineId : row._id === original._id && type(row) === type(original) && row.customizationKey === original.customizationKey);
  if (index < 0 || cart[index].quantity !== original.quantity || cart[index].customizationKey !== original.customizationKey) throw new Error("This cart item changed. Close and reopen Edit to review it.");
  if (!Number.isInteger(replacement.quantity) || replacement.quantity < 1 || replacement.quantity > 99) throw new Error("Choose a quantity from 1 to 99.");
  const updated = { ...replacement, _id: original._id, productType: type(original), cartLineId: original.cartLineId, customizationKey: cartConfigurationKey(replacement) };
  if (cart.some((row, n) => n !== index && row._id === original._id && type(row) === type(original) && cartConfigurationKey(row) === updated.customizationKey)) throw new Error("This configuration is already in your cart. Change that item’s quantity instead.");
  return cart.map((row, n) => n === index ? updated : row);
}
