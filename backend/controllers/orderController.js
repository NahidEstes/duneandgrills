import Order from "../models/Order.js";
import Counter from "../models/Counter.js";

// Generates a human-readable, date-based order number like 2026082301
// (YYYYMMDD + sequence number for that day)
// const generateOrderNumber = async () => {
//   const now = new Date();
//   const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
//     2,
//     "0"
//   )}${String(now.getDate()).padStart(2, "0")}`;

//   const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//   const endOfDay = new Date(startOfDay);
//   endOfDay.setDate(endOfDay.getDate() + 1);

//   const countToday = await Order.countDocuments({
//     createdAt: { $gte: startOfDay, $lt: endOfDay },
//   });

//   const sequence = String(countToday + 1).padStart(2, "0");
//   return `${datePart}${sequence}`;
// };
// Atomically increments today's counter and returns a unique, sequential
// order number like "20260823001". Using findOneAndUpdate with $inc means
// MongoDB guarantees each caller gets a different number, even if many
// orders are placed at the exact same moment.
const generateOrderNumber = async () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: datePart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true } // upsert: create the counter if today's doesn't exist yet
  );

  const sequence = String(counter.seq).padStart(3, "0"); // 001–999 per day
  return `${datePart}${sequence}`;
};

// @desc    Create a new order
// @route   POST /api/orders
// @access  Public
export const createOrder = async (req, res) => {
  try {
    const { customer, items, notes } = req.body;

    if (!customer?.name || !customer?.phone) {
      return res.status(400).json({
        success: false,
        message: "Customer name and phone are required",
      });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // const order = await Order.create({
    //   customer,
    //   items,
    //   totalAmount,
    //   notes,
    // });

    // const order = await Order.create({
    //   user: req.user ? req.user._id : null,
    //   customer,
    //   items,
    //   totalAmount,
    //   notes,
    // });
    const orderNumber = await generateOrderNumber();
    const order = await Order.create({
      orderNumber,
      user: req.user ? req.user._id : null,
      customer,
      items,
      totalAmount,
      notes,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to create order",
      error: err.message,
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Admin
// export const getOrders = async (req, res) => {
//   try {
//     const orders = await Order.find().sort({ createdAt: -1 });
//     res.status(200).json({ success: true, count: orders.length, data: orders });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch orders",
//       error: err.message,
//     });
//   }
// };

// @desc    Get all orders (optionally filter by status)
// @route   GET /api/orders?status=pending
// @access  Admin/Manager
export const getOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch orders",
        error: err.message,
      });
  }
};

// @desc    Revenue & order stats for the dashboard
// @route   GET /api/orders/stats
// @access  Admin/Manager
export const getOrderStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allOrders = await Order.find();

    const totalRevenue = allOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const todayOrders = allOrders.filter((o) => o.createdAt >= startOfToday);
    const todayRevenue = todayOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const statusCounts = allOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        totalOrders: allOrders.length,
        totalRevenue,
        todayOrders: todayOrders.length,
        todayRevenue,
        statusCounts,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch stats",
        error: err.message,
      });
  }
};

// @desc    Get a single order
// @route   GET /api/orders/:id
// @access  Public (customer order tracking)
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
      error: err.message,
    });
  }
};

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Admin
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to update order",
      error: err.message,
    });
  }
};

// @desc    Get logged-in user's own orders
// @route   GET /api/orders/my
// @access  Private (customer)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("items.menuItem", "name image price isAvailable");
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch your orders",
      error: err.message,
    });
  }
};
