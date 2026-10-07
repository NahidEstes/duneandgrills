export const inventoryHealthOptions = Object.freeze([
  ["low", "Low saleable stock"], ["out", "Out of saleable stock"],
  ["expiring", "Expiring stock (including today)"], ["blocked", "Expired / blocked stock"],
  ["expired", "Already expired"], ["quarantined", "Quarantined"], ["damaged", "Damaged"],
  ["unknown_expiry", "Missing required expiry"], ["unallocated", "Unallocated physical stock"],
  ["unknown_quality", "Unclassified batch quality"],
]);

export const inventoryHealthReasonLabels = Object.freeze({
  expired: "Expired", quarantined: "Quarantined", damaged: "Damaged",
  unknown_expiry: "Missing required expiry", unallocated: "Unallocated physical stock",
  unknown_quality: "Unclassified batch quality",
});

export function initialInventoryStatus(value) {
  return inventoryHealthOptions.some(([key]) => key === value) || ["active", "inactive", "all"].includes(value) ? value : "";
}
