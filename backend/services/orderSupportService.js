import crypto from "node:crypto";
import Order from "../models/Order.js";
import { OrderEngineError, orderText } from "../config/orderContract.js";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "../models/OrderSupport.js";

export const supportInput = (body, order) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrderEngineError("Issue details must be an object");
  if (!SUPPORT_CATEGORIES.includes(body.category)) throw new OrderEngineError("Choose a valid issue category");
  const description = orderText(body.description, "Description", 2000);
  if (description.length < 10) throw new OrderEngineError("Describe the issue in at least 10 characters");
  const affectedItems = body.affectedItems ?? [];
  if (!Array.isArray(affectedItems) || affectedItems.length > order.items.length || affectedItems.some(index => !Number.isInteger(index) || index < 0 || index >= order.items.length)) throw new OrderEngineError("Select valid order items");
  if (["Missing item", "Wrong item"].includes(body.category) && !affectedItems.length) throw new OrderEngineError("Select the affected order items");
  return { category: body.category, description, affectedItems: [...new Set(affectedItems)] };
};

export const supportOrder = async (req) => {
  const number = req.params.orderNumber;
  if (typeof number !== "string" || number.length > 100) throw new OrderEngineError("Order not found", 404);
  const filter = { orderNumber: number };
  const token = req.headers["x-order-tracking-token"];
  if (typeof token === "string" && token.length > 0 && token.length <= 200) {
    filter.trackingTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  } else if (req.user) filter.user = req.user._id;
  else throw new OrderEngineError("Order not found", 404);
  const order = await Order.findOne(filter);
  if (!order) throw new OrderEngineError("Order not found", 404);
  return order;
};

export const serializeSupport = (ticket, staff = false) => {
  if (!ticket) return null;
  const row = ticket.toObject ? ticket.toObject() : ticket;
  return {
    _id: row._id, orderNumber: row.orderNumber, category: row.category,
    affectedItems: row.affectedItems, description: row.description,
    status: row.status, resolution: row.resolution, createdAt: row.createdAt, updatedAt: row.updatedAt,
    messages: (row.messages || []).filter(message => staff || !message.internal).map(({ _id, text, internal, authorType, createdAt }) => ({ _id, text, authorType, createdAt, ...(staff ? { internal } : {}) })),
  };
};

export const appendSupportMessage = (ticket, body, user, staff = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrderEngineError("Message details must be an object");
  const text = orderText(body.text, "Message", 2000);
  if (text && ticket.messages.length >= 200) throw new OrderEngineError("Conversation limit reached. Please contact the restaurant", 409);
  if (!staff && ticket.status === "Closed") throw new OrderEngineError("This conversation is closed. Please contact the restaurant", 409);
  if (staff) {
    if (body.internal !== undefined && typeof body.internal !== "boolean") throw new OrderEngineError("Invalid message visibility");
    const status = body.status ?? ticket.status;
    if (!SUPPORT_STATUSES.includes(status)) throw new OrderEngineError("Choose a valid support status");
    const resolution = body.resolution === undefined ? ticket.resolution : orderText(body.resolution, "Resolution", 2000);
    if (["Resolved", "Closed"].includes(status) && !resolution) throw new OrderEngineError("Enter a customer-visible resolution before resolving or closing");
    ticket.status = status;
    ticket.resolution = resolution;
  } else if (!text) throw new OrderEngineError("Enter a message");
  if (text) ticket.messages.push({ text, internal: staff && body.internal === true, author: user?._id || null, authorType: staff ? "Support team" : "Customer" });
};
