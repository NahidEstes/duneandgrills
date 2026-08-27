import BlogPost from "../models/BlogPost.js";
import MenuItem from "../models/MenuItem.js";
import Offer from "../models/Offer.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import User from "../models/User.js";

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const percentageChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const getDateKey = (date) => date.toISOString().slice(0, 10);

const buildRevenueSeries = (rows, startDate, days) => {
  const totals = new Map(rows.map((row) => [row._id, row.revenue]));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const key = getDateKey(date);
    return { date: key, revenue: totals.get(key) || 0 };
  });
};

const offerStatus = (offer, now) => {
  if (!offer.isActive) return "inactive";
  if (offer.startDate > now) return "upcoming";
  if (offer.expiresAt <= now) return "expired";
  return "active";
};

export const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    const currentPeriodStart = new Date(today);
    currentPeriodStart.setUTCDate(currentPeriodStart.getUTCDate() - 6);
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setUTCDate(previousPeriodStart.getUTCDate() - 7);

    const openStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "out-for-delivery",
    ];

    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      openOrders,
      revenueRows,
      reviewRows,
      customerCount,
      staffCount,
      menuItemCount,
      availableMenuItemCount,
      activeOfferCount,
      recentOrders,
      recentMenuItems,
      recentPosts,
      recentOffers,
      recentReviews,
      statusRows,
      dailyRevenueRows,
      popularItemRows,
      categoryRows,
      currentOrders,
      previousOrders,
      currentCompleted,
      previousCompleted,
      periodRevenueRows,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: "delivered" }),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: { $in: openStatuses } }),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Review.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            average: { $avg: "$rating" },
          },
        },
      ]),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: { $in: ["admin", "manager"] } }),
      MenuItem.countDocuments(),
      MenuItem.countDocuments({ isAvailable: true }),
      Offer.countDocuments({
        isActive: true,
        startDate: { $lte: now },
        expiresAt: { $gt: now },
      }),
      Order.find().sort({ createdAt: -1 }).limit(7).lean(),
      MenuItem.find().sort({ updatedAt: -1 }).limit(6).lean(),
      BlogPost.find().sort({ updatedAt: -1 }).limit(4).lean(),
      Offer.find().sort({ updatedAt: -1 }).limit(4).lean(),
      Review.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name avatar")
        .populate("menuItem", "name image")
        .lean(),
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: currentPeriodStart },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: { menuItem: "$items.menuItem", name: "$items.name" },
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] },
            },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
      ]),
      MenuItem.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
            available: { $sum: { $cond: ["$isAvailable", 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Order.countDocuments({ createdAt: { $gte: currentPeriodStart } }),
      Order.countDocuments({
        createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart },
      }),
      Order.countDocuments({
        status: "delivered",
        createdAt: { $gte: currentPeriodStart },
      }),
      Order.countDocuments({
        status: "delivered",
        createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart },
      }),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: previousPeriodStart },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: {
              $cond: [
                { $gte: ["$createdAt", currentPeriodStart] },
                "current",
                "previous",
              ],
            },
            total: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);

    const totalRevenue = revenueRows[0]?.total || 0;
    const currentRevenue =
      periodRevenueRows.find((row) => row._id === "current")?.total || 0;
    const previousRevenue =
      periodRevenueRows.find((row) => row._id === "previous")?.total || 0;

    const activities = [
      ...recentOrders.slice(0, 4).map((order) => ({
        id: `order-${order._id}`,
        type: "order",
        title: `Order #${order.orderNumber}`,
        description: `Status is ${order.status.replaceAll("-", " ")}`,
        at: order.updatedAt,
        tab: "orders",
      })),
      ...recentMenuItems.slice(0, 3).map((item) => ({
        id: `menu-${item._id}`,
        type: "menu",
        title: item.name,
        description: "Menu item updated",
        at: item.updatedAt,
        tab: "menu",
      })),
      ...recentPosts.slice(0, 2).map((post) => ({
        id: `blog-${post._id}`,
        type: "blog",
        title: post.title,
        description: post.isPublished ? "Published article updated" : "Draft updated",
        at: post.updatedAt,
        tab: "blog",
      })),
      ...recentOffers.slice(0, 2).map((offer) => ({
        id: `offer-${offer._id}`,
        type: "offer",
        title: offer.title,
        description: "Offer updated",
        at: offer.updatedAt,
        tab: "offers",
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 7);

    res.status(200).json({
      success: true,
      data: {
        generatedAt: now,
        stats: {
          totalOrders,
          totalRevenue,
          completedOrders,
          pendingOrders,
          openOrders,
          customerCount,
          staffCount,
          menuItemCount,
          availableMenuItemCount,
          activeOfferCount,
          reviewCount: reviewRows[0]?.count || 0,
          averageRating: Number((reviewRows[0]?.average || 0).toFixed(1)),
          trends: {
            orders: percentageChange(currentOrders, previousOrders),
            revenue: percentageChange(currentRevenue, previousRevenue),
            completed: percentageChange(currentCompleted, previousCompleted),
          },
        },
        recentOrders,
        recentMenuItems,
        recentPosts,
        recentOffers: recentOffers.map((offer) => ({
          ...offer,
          dashboardStatus: offerStatus(offer, now),
        })),
        recentReviews,
        activities,
        analytics: {
          statusBreakdown: statusRows.map((row) => ({
            status: row._id,
            count: row.count,
          })),
          dailyRevenue: buildRevenueSeries(dailyRevenueRows, currentPeriodStart, 7),
          popularItems: popularItemRows.map((row) => ({
            menuItem: row._id.menuItem,
            name: row._id.name,
            quantity: row.quantity,
            revenue: row.revenue,
          })),
          categories: categoryRows.map((row) => ({
            category: row._id,
            count: row.count,
            available: row.available,
          })),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load admin dashboard",
      error: err.message,
    });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const { scope = "customers", search = "" } = req.query;
    const filter = {
      role:
        scope === "staff" ? { $in: ["admin", "manager"] } : "customer",
    };

    if (search.trim()) {
      const expression = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { name: expression },
        { email: expression },
        { phone: expression },
      ];
    }

    const users = await User.find(filter)
      .select("name email role phone address avatar rewardPoints favorites createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    const ids = users.map((user) => user._id);
    const orderRows = ids.length
      ? await Order.aggregate([
          { $match: { user: { $in: ids }, status: { $ne: "cancelled" } } },
          {
            $group: {
              _id: "$user",
              orders: { $sum: 1 },
              totalSpent: { $sum: "$totalAmount" },
            },
          },
        ])
      : [];
    const orderMap = new Map(
      orderRows.map((row) => [row._id.toString(), row])
    );

    const data = users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      avatar: user.avatar,
      rewardPoints: user.rewardPoints,
      favoritesCount: user.favorites?.length || 0,
      ordersCount: orderMap.get(user._id.toString())?.orders || 0,
      totalSpent: orderMap.get(user._id.toString())?.totalSpent || 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load users",
      error: err.message,
    });
  }
};

export const searchAdmin = async (req, res) => {
  try {
    const query = req.query.q?.trim() || "";
    if (query.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const expression = new RegExp(escapeRegex(query), "i");
    const [orders, menuItems, users, posts, offers] = await Promise.all([
      Order.find({
        $or: [
          { orderNumber: expression },
          { "customer.name": expression },
          { "customer.phone": expression },
        ],
      })
        .select("orderNumber customer status totalAmount createdAt")
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),
      MenuItem.find({
        $or: [{ name: expression }, { description: expression }, { category: expression }],
      })
        .select("name category image isAvailable updatedAt")
        .limit(4)
        .lean(),
      User.find({ $or: [{ name: expression }, { email: expression }, { phone: expression }] })
        .select("name email role avatar")
        .limit(4)
        .lean(),
      BlogPost.find({ $or: [{ title: expression }, { excerpt: expression }] })
        .select("title category isPublished coverImage")
        .limit(3)
        .lean(),
      Offer.find({ $or: [{ title: expression }, { promoCode: expression }] })
        .select("title badge isActive image")
        .limit(3)
        .lean(),
    ]);

    const data = [
      ...orders.map((order) => ({
        id: order._id,
        type: "Order",
        title: `#${order.orderNumber}`,
        subtitle: `${order.customer?.name || "Guest"} · ${order.status}`,
        tab: "orders",
      })),
      ...menuItems.map((item) => ({
        id: item._id,
        type: "Menu",
        title: item.name,
        subtitle: `${item.category} · ${item.isAvailable ? "Available" : "Unavailable"}`,
        image: item.image,
        tab: "menu",
      })),
      ...users.map((user) => ({
        id: user._id,
        type: user.role === "customer" ? "Customer" : "Staff",
        title: user.name,
        subtitle: user.email,
        image: user.avatar,
        tab: user.role === "customer" ? "customers" : "staff",
      })),
      ...posts.map((post) => ({
        id: post._id,
        type: "Blog",
        title: post.title,
        subtitle: `${post.category} · ${post.isPublished ? "Published" : "Draft"}`,
        image: post.coverImage,
        tab: "blog",
      })),
      ...offers.map((offer) => ({
        id: offer._id,
        type: "Offer",
        title: offer.title,
        subtitle: `${offer.badge} · ${offer.isActive ? "Enabled" : "Disabled"}`,
        image: offer.image,
        tab: "offers",
      })),
    ].slice(0, 12);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Search failed",
      error: err.message,
    });
  }
};
