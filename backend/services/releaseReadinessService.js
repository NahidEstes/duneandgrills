import Order from "../models/Order.js";
import OrderRequestFence from "../models/OrderRequestFence.js";
import CashMovement from "../models/CashMovement.js";
import Refund from "../models/Refund.js";
import PosShift from "../models/PosShift.js";
import RateLimitBucket from "../models/RateLimitBucket.js";

// Reads actual indexes; never drops, rebuilds or synchronizes a user's indexes.
export async function verifyReleaseIndexes() {
  const missing = [];
  for (const model of [Order, OrderRequestFence, CashMovement, Refund, PosShift, RateLimitBucket]) {
    let indexes;
    try { indexes = await model.collection.listIndexes().toArray(); }
    catch { missing.push(`${model.modelName}:collection`); continue; }
    if (model === OrderRequestFence && !indexes.some(index => index.name === "_id_")) missing.push("OrderRequestFence:_id");
    for (const [key, options] of model.schema.indexes()) {
      if (!options.unique && options.expireAfterSeconds === undefined) continue;
      const found = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(key));
      if (!found || (options.unique && !found.unique) || (options.sparse && !found.sparse) || (options.partialFilterExpression && JSON.stringify(found.partialFilterExpression) !== JSON.stringify(options.partialFilterExpression)) || (options.expireAfterSeconds !== undefined && found.expireAfterSeconds !== options.expireAfterSeconds)) missing.push(`${model.modelName}:${Object.keys(key).join(",")}`);
    }
  }
  return { ready: missing.length === 0, missing };
}
