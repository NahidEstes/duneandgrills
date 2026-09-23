import Counter from "../models/Counter.js";
import Order from "../models/Order.js";

export const getRiyadhDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
};

const highestExistingSequence = async (dateKey) => {
  const latest = await Order.findOne({ orderNumber: new RegExp(`^DG-${dateKey}-\\d{4}$`) })
    .sort({ orderNumber: -1 }).select("orderNumber").lean();
  return latest ? Number(latest.orderNumber.slice(-4)) || 0 : 0;
};

export const nextOrderNumber = async ({ date = new Date(), attempts = 4 } = {}) => {
  const dateKey = getRiyadhDateKey(date);
  const counterId = `order:${dateKey}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const floor = await highestExistingSequence(dateKey);
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ["$seq", 0] }, floor] }, 1] } } }],
        { new: true, upsert: true }
      );
      if (counter.seq > 9999) throw Object.assign(new Error("Daily order number capacity was reached"), { status: 503 });
      return `DG-${dateKey}-${String(counter.seq).padStart(4, "0")}`;
    } catch (error) {
      if (error?.code !== 11000 || attempt === attempts - 1) throw error;
    }
  }
  throw Object.assign(new Error("Could not reserve an order number"), { status: 503 });
};

