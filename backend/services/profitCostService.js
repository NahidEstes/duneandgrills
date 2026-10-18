// Read historical movements only. Never price old consumption from today's
// InventoryItem/recipe or from a return's possibly changed unitCost.
const id = value => String(value?._id || value || "");
const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const epsilon = 0.000001;
const unique = rows => [...new Map(rows.map(row => [id(row._id), row])).values()];

export function historicalMovementCost(row) {
  const quantity = Number(row.quantity);
  if (!finite(row.quantity) || quantity <= 0) return { amount: null, quality: "missing", reason: "Missing movement quantity" };
  const allocations = row.batchAllocations || [];
  if (allocations.length) {
    const allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
    if (Math.abs(allocated - quantity) > epsilon || allocations.some(a => !finite(a.quantity) || Number(a.quantity) <= 0 || !finite(a.unitCost) || Number(a.unitCost) <= 0)) return { amount: null, quality: "missing", reason: "Incomplete batch quantity/cost snapshot; default zero is not proven free stock" };
    return { amount: allocations.reduce((sum, a) => sum + Number(a.quantity) * Number(a.unitCost), 0), quality: "recorded" };
  }
  if (finite(row.unitCost) && Number(row.unitCost) > 0) return { amount: quantity * Number(row.unitCost), quality: "estimated", reason: "Historical transaction unit cost; batch evidence unavailable" };
  return { amount: null, quality: "missing", reason: "Historical cost unavailable; default zero is not proven free stock" };
}

function completeLineCoverage(order, deductions) {
  if (!order.items?.length) return false;
  const components = deductions.flatMap(row => row.sourceDetails?.components || []);
  return order.items.every((line, index) => {
    const menuIds = line.productType === "combo" ? (line.comboItems || []).map(row => id(row.menuItem)) : [id(line.menuItem)];
    const menusCovered = menuIds.length && menuIds.every(menuId => menuId && components.some(component => component.type === "menu_recipe" && id(component.menuItem) === menuId));
    const indexCovered = !menuIds.some(Boolean) && deductions.some(row => row.sourceDetails?.lineQuantities?.some(share => share.index === index && share.quantity > 0));
    const addOnsCovered = (line.selectedAddOns || []).every(add => components.some(component => component.type === "add_on_recipe" && id(component.addOn) === id(add.addOn)));
    return (menusCovered || indexCovered) && addOnsCovered;
  });
}

export function historicalOrderCost(order, movements) {
  const rows = unique(movements).filter(row => id(row.order) === id(order._id) && row.status === "COMPLETED");
  const deductions = rows.filter(row => row.movementType === "STOCK_OUT" && Number(row.quantity) > 0);
  const reasons = new Set(); let quality = "recorded", consumed = 0, restored = 0;
  const worsen = (next, reason) => { if (next === "missing" || (next === "estimated" && quality === "recorded")) quality = next; if (reason) reasons.add(reason); };
  if (!deductions.length) worsen("missing", "No recorded consumption; untracked recipes are not zero food cost");
  if ((order.inventoryTransactions || []).some(reference => !deductions.some(row => id(row._id) === id(reference)))) worsen("missing", "Linked consumption transactions are missing from the stock ledger");
  if (!completeLineCoverage(order, deductions)) worsen("missing", "Historical recipe coverage is incomplete, including add-ons/combo components");
  const remaining = deductions.map(row => {
    const cost = historicalMovementCost(row); worsen(cost.quality, cost.reason); consumed += cost.amount ?? 0;
    return { row, remaining: Number(row.quantity), amount: cost.amount, allocations: (row.batchAllocations || []).map(a => ({ ...a, remaining: Number(a.quantity) })) };
  });
  const restorationIds = new Set((order.inventoryRestorationTransactions || []).map(id));
  const ledgerTime = row => new Date(row.createdAt || row._id?.getTimestamp?.() || row.occurredAt).getTime();
  const returns = rows.filter(row => row.movementType === "STOCK_IN").sort((a, b) => {
    const first = ledgerTime(a), second = ledgerTime(b);
    return Number.isFinite(first) && Number.isFinite(second) ? first - second : 0;
  });
  if ([...restorationIds].some(reference => !returns.some(row => id(row._id) === reference))) worsen("missing", "Linked restoration transactions are missing from the stock ledger");
  for (const returned of returns) {
    const original = id(returned.sourceDetails?.originalDeduction);
    if (!original && !restorationIds.has(id(returned._id))) { worsen("missing", "Unreconciled order stock-in movement"); continue; }
    const candidates = remaining.filter(entry => id(entry.row.item) === id(returned.item) && (!original || id(entry.row._id) === original));
    let quantity = Number(returned.quantity), returnCost = 0;
    if (!finite(returned.quantity) || quantity <= 0 || quantity > candidates.reduce((sum, entry) => sum + entry.remaining, 0) + epsilon) { worsen("missing", "Return exceeds or cannot match historical consumption"); continue; }
    if (returned.batchAllocations?.length) {
      for (const allocation of returned.batchAllocations) {
        let requested = Number(allocation.quantity);
        if (!finite(allocation.quantity) || requested <= 0) { worsen("missing", "Invalid return allocation"); continue; }
        for (const entry of candidates) for (const source of entry.allocations) {
          const sameLot = allocation.batch && source.batch ? id(allocation.batch) === id(source.batch) : allocation.lotNumber && allocation.lotNumber === source.lotNumber;
          if (!sameLot || requested <= epsilon) continue;
          const take = Math.min(requested, source.remaining, entry.remaining);
          if (Number(source.unitCost) <= 0 || !finite(source.unitCost)) worsen("missing", "Original returned-lot cost unavailable");
          else returnCost += take * Number(source.unitCost);
          source.remaining -= take; entry.remaining -= take; requested -= take; quantity -= take;
        }
        if (requested > epsilon) worsen("missing", "Return lot cannot be matched to original consumption");
      }
      if (Math.abs(quantity) > epsilon) worsen("missing", "Return allocation quantity does not match movement");
    } else {
      // Full returns can reverse the complete original cost. Partial returns
      // without lot evidence remain estimates, never today's replacement price.
      if (quantity < candidates.reduce((sum, entry) => sum + entry.remaining, 0) - epsilon) worsen("estimated", "Partial return without original lot allocation");
      for (const entry of candidates) {
        const take = Math.min(quantity, entry.remaining);
        // Earlier returns may have removed a cheaper/more expensive lot. Price
        // the remaining evidence, not the original blended average again.
        const remainingCost = entry.allocations.length
          ? entry.allocations.reduce((total, allocation) => total + allocation.remaining * Number(allocation.unitCost), 0)
          : entry.amount === null ? null : entry.remaining * entry.amount / Number(entry.row.quantity);
        if (remainingCost !== null && Number.isFinite(remainingCost) && entry.remaining > epsilon) returnCost += take * remainingCost / entry.remaining;
        else worsen("missing", "Returned consumption has no historical cost");
        let allocationRemaining = take;
        for (const allocation of entry.allocations) { const taken = Math.min(allocation.remaining, allocationRemaining); allocation.remaining -= taken; allocationRemaining -= taken; }
        entry.remaining -= take; quantity -= take;
      }
    }
    restored += returnCost;
  }
  if (order.inventoryStatus === "restored" && remaining.some(entry => entry.remaining > epsilon)) worsen("missing", "Order says restored but complete return evidence is missing");
  for (const [reference, counter] of Object.entries(order.inventoryReturnedQuantities || {})) {
    const entry = remaining.find(candidate => id(candidate.row._id) === reference);
    const reconciledQuantity = entry ? Number(entry.row.quantity) - entry.remaining : 0;
    if (!finite(counter) || Number(counter) < 0 || Math.abs(Number(counter) - reconciledQuantity) > epsilon) worsen("missing", "Recorded return counters do not reconcile with the historical stock ledger");
  }
  return { orderId: id(order._id), orderNumber: order.orderNumber, quality, consumedCost: round(consumed), restoredCost: round(restored), amount: round(Math.max(0, consumed - restored)), reasons: [...reasons] };
}

export function summarizeHistoricalCosts(orders, movements, waste) {
  const movementsByOrder = new Map();
  for (const movement of movements) {
    const key = id(movement.order);
    if (!movementsByOrder.has(key)) movementsByOrder.set(key, []);
    movementsByOrder.get(key).push(movement);
  }
  const orderCosts = orders.map(order => ({ ...historicalOrderCost(order, movementsByOrder.get(id(order._id)) || []), source: order.source || "website" }));
  const wasteRows = unique(waste).filter(row => ["WASTE", "DAMAGED"].includes(row.movementType) && row.status === "COMPLETED").map(row => ({ ...historicalMovementCost(row), id: id(row._id), reference: row.transactionNumber || row.reference }));
  return { orderCosts, food: {
    recordedCost: round(orderCosts.filter(row => row.quality === "recorded").reduce((sum, row) => sum + row.amount, 0)),
    estimatedCost: round(orderCosts.filter(row => row.quality === "estimated").reduce((sum, row) => sum + row.amount, 0)),
    partialKnownCost: round(orderCosts.filter(row => row.quality === "missing").reduce((sum, row) => sum + row.amount, 0)),
    recordedOrders: orderCosts.filter(row => row.quality === "recorded").length, estimatedOrders: orderCosts.filter(row => row.quality === "estimated").length,
    missingOrders: orderCosts.filter(row => row.quality === "missing").length,
  }, waste: { recordedCost: round(wasteRows.filter(row => row.quality === "recorded").reduce((sum, row) => sum + row.amount, 0)), estimatedCost: round(wasteRows.filter(row => row.quality === "estimated").reduce((sum, row) => sum + row.amount, 0)), missingMovements: wasteRows.filter(row => row.quality === "missing").length, movements: wasteRows.length } };
}
