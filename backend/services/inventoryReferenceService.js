import Counter from "../models/Counter.js";

const prefixes = {
  WASTE: "WST",
  DAMAGED: "DMG",
  STOCK_IN: "SIN",
  STOCK_OUT: "SOUT",
  ADJUSTMENT: "ADJ",
  INVENTORY_COUNT: "ICM",
  PURCHASE_RECEIPT: "POR",
  OPENING_BALANCE: "OPN",
};

export const nextInventoryReference = async (movementType, session = null) => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = prefixes[movementType] || "MOV";
  const counter = await Counter.findOneAndUpdate(
    { _id: `inventory-movement-${prefix}-${date}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, ...(session ? { session } : {}) }
  );
  return `${prefix}-${date}-${String(counter.seq).padStart(4, "0")}`;
};
