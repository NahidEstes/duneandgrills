import BlogPost from "../models/BlogPost.js";
import MenuItem from "../models/MenuItem.js";
import Offer from "../models/Offer.js";
import Order from "../models/Order.js";
import { RECENT_ORDER_FIELDS, serializeAdminOrder } from "../services/orderSerializer.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Combo from "../models/Combo.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasingAction from "../models/PurchasingAction.js";
import { getInventoryHealth } from "../services/inventoryHealthService.js";
import { NON_REVENUE_ORDER_STATUSES } from "../config/orderStatuses.js";
import { STAFF_ROLES } from "../config/permissions.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { resolveDashboardPeriod, dashboardComparison } from "../services/dashboardPeriodService.js";

const nonRevenueStatuses = NON_REVENUE_ORDER_STATUSES;

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const offerStatus = (offer, now) => {
  if (!offer.isActive) return "inactive";
  if (offer.startDate > now) return "upcoming";
  if (offer.expiresAt <= now) return "expired";
  return "active";
};

export const getDashboard = async (req, res) => {
  try {
    res.setHeader?.("Cache-Control", "private, no-store");
    const now = new Date();
    const selection = resolveDashboardPeriod(req.query?.period ?? "today", now);

    const openStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "out-for-delivery",
    ];

    const allSales = await buildSalesReport({ range: selection.range, dashboardMode: true,
      dashboardPeriods: selection.previous ? { current: selection.range, previous: selection.previous } : null,
    });
    const totalOrders = allSales.summary.totalOrders;
    const statusRows = allSales.statusBreakdown.map(row => ({ _id: row.status, count: row.count }));
    const counts = new Map(statusRows.map(row => [row._id, row.count]));
    const completedOrders = counts.get("delivered") || 0;
    const { currentOrders = 0, previousOrders = 0, currentCompleted = 0, previousCompleted = 0 } = allSales.dashboard?.orderCounts || {};

    const [
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
      categoryRows,
      inventorySummary,
      liveStatusRows,
      lifetimeOrderCount,
    ] = await Promise.all([
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
      User.countDocuments({ role: { $in: STAFF_ROLES }, isActive: { $ne: false } }),
      MenuItem.countDocuments(),
      MenuItem.countDocuments({ isAvailable: true }),
      Offer.countDocuments({
        isActive: true,
        startDate: { $lte: now },
        expiresAt: { $gt: now },
      }),
      Order.find().select(RECENT_ORDER_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(7).lean(),
      MenuItem.find().select("name image category price isAvailable updatedAt").sort({ updatedAt: -1 }).limit(6).lean(),
      BlogPost.find().select("title coverImage author isPublished updatedAt").sort({ updatedAt: -1 }).limit(4).lean(),
      Offer.find().select("title isActive startDate expiresAt updatedAt").sort({ updatedAt: -1 }).limit(4).lean(),
      Review.find().select("user menuItem rating comment createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name avatar")
        .populate("menuItem", "name image")
        .lean(),
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
      (async () => {
        const [health, pendingPurchaseOrders, openPurchasingActions] = await Promise.all([
          getInventoryHealth({ now }),
          PurchaseOrder.countDocuments({ status: { $in: ["ordered", "partially_received"] } }),
          PurchasingAction.countDocuments({ state: { $in: ["open", "acknowledged"] } }),
        ]);
        return { ...health.summary, pendingPurchaseOrders, openPurchasingActions };
      })(),
      Order.aggregate([{ $match: { status: { $in: openStatuses } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.countDocuments(),
    ]);

    const totalRevenue = allSales.summary.netSales;
    const currentRevenue = allSales.dashboard?.currentSummary.netSales;
    const previousRevenue = allSales.dashboard?.previousSummary.netSales;
    const liveCounts = new Map(liveStatusRows.map(row => [row._id, row.count]));
    const pendingOrders = liveCounts.get("pending") || 0;
    const openOrders = openStatuses.reduce((sum, status) => sum + (liveCounts.get(status) || 0), 0);

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
        reportingPeriod: selection.metadata,
        stats: {
          totalOrders,
          totalRevenue,
          ...allSales.summary,
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
            orders: dashboardComparison(currentOrders, previousOrders, Boolean(selection.previous)),
            revenue: dashboardComparison(currentRevenue, previousRevenue, Boolean(selection.previous)),
            completed: dashboardComparison(currentCompleted, previousCompleted, Boolean(selection.previous)),
          },
        },
        recentOrders: recentOrders.map(order => serializeAdminOrder(order, now)),
        recentOrdersMeta: { total: lifetimeOrderCount, limit: 7, hasMore: lifetimeOrderCount > 7 },
        recentMenuItems,
        recentPosts,
        recentOffers: recentOffers.map((offer) => ({
          ...offer,
          dashboardStatus: offerStatus(offer, now),
        })),
        recentReviews,
        activities,
        inventorySummary,
        reportingDefinitions: allSales.definitions,
        cashActivity: allSales.cashActivity,
        analytics: {
          statusBreakdown: statusRows.map((row) => ({
            status: row._id,
            count: row.count,
          })),
          dailyRevenue: allSales.series,
          popularItems: allSales.bestSelling.slice(0, 5),
          categories: categoryRows.map((row) => ({
            category: row._id,
            count: row.count,
            available: row.available,
          })),
        },
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      message: err.status === 400 ? err.message : "Failed to load admin dashboard",
      error: err.message,
    });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const { scope = "customers", search = "" } = req.query;
    const filter = {
      role:
        scope === "staff" ? { $in: STAFF_ROLES } : "customer",
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
      .select("name email role phone address avatar pointsBalance favorites favoriteCombos isActive deactivatedAt createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    const ids = users.map((user) => user._id);
    const orderRows = ids.length
      ? await Order.aggregate([
          { $match: { user: { $in: ids }, status: { $nin: nonRevenueStatuses } } },
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
      isActive: user.isActive !== false,
      deactivatedAt: user.deactivatedAt,
      phone: user.phone,
      address: user.address,
      avatar: user.avatar,
      pointsBalance: Math.max(0, Number(user.pointsBalance) || 0),
      favoritesCount:
        (user.favorites?.length || 0) + (user.favoriteCombos?.length || 0),
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
    const [orders, menuItems, combos, users, posts, offers] = await Promise.all([
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
      Combo.find({
        $or: [
          { name: expression },
          { description: expression },
          { slug: expression },
        ],
      })
        .select("name slug image status isAvailable")
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
      ...combos.map((combo) => ({
        id: combo._id,
        type: "Combo",
        title: combo.name,
        subtitle: `${combo.status} · ${combo.isAvailable ? "Available" : "Inactive"}`,
        image: combo.image,
        tab: "combos",
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
