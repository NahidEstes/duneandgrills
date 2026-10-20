import crypto from "node:crypto";
import DiningTable from "../models/DiningTable.js";
import { OrderEngineError } from "../config/orderContract.js";

export const tableSnapshot = table => ({ table: table._id, code: table.code, name: table.name });
export const resolveDiningTable = async (token, session = null) => {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new OrderEngineError("Invalid table QR link. Ask a staff member for help", 404);
  const filter = { qrTokenHash: crypto.createHash("sha256").update(token).digest("hex"), isActive: true };
  // A transactional write serializes creation against table deactivation.
  const table = session ? await DiningTable.findOneAndUpdate(filter, { $inc: { orderCount: 1 } }, { new: true, session }) : await DiningTable.findOne(filter);
  if (!table) throw new OrderEngineError("This table QR link is unavailable. Ask a staff member for help", 409);
  return tableSnapshot(table);
};
export const validateTableContext = async (payload, orderType, session = null) => {
  if (payload.tableToken === undefined) return undefined;
  if (orderType !== "dine-in") throw new OrderEngineError("Remove the table selection before switching to delivery or pickup");
  if (payload.scheduledAt) throw new OrderEngineError("Table orders must be placed for now");
  return resolveDiningTable(payload.tableToken, session);
};
