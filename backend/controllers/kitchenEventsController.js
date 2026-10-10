import Order from "../models/Order.js";
import User from "../models/User.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";

// Database change streams also cover refunds/admin changes and other backend instances.
// Events contain invalidations only. The authorized queue endpoint owns snapshots.
export const kitchenEvents = async (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  let closed = false;
  const stream = Order.watch([], { maxAwaitTimeMS: 10000 });
  const write = event => { if (!closed) res.write(`event: ${event}\ndata: {}\n\n`); };
  const cleanup = () => { if (closed) return; closed = true; clearInterval(heartbeat); clearTimeout(lifetime); stream.close().catch(() => {}); if (!res.writableEnded) res.end(); };
  stream.on("change", () => write("orders-changed"));
  stream.on("error", () => { write("polling-required"); cleanup(); });
  const heartbeat = setInterval(async () => {
    try {
      const user = await User.findById(req.user._id).select("role isActive +sessionVersion").lean();
      if (!user || user.isActive === false || user.sessionVersion !== req.user.sessionVersion || !hasCapability(user.role, CAPABILITIES.KITCHEN_OPERATE)) return cleanup();
      if (!closed) res.write(": heartbeat\n\n");
    } catch { cleanup(); }
  }, 10000);
  const lifetime = setTimeout(cleanup, 45000);
  req.on("aborted", cleanup); res.on("close", cleanup);
  write("connected");
};
