import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import Order from "../models/Order.js";
import Review from "../models/Review.js";

const DEMO_PASSWORD = "Demo@12345";
const DEMO_ORDER_NUMBERS = [
  "DEMO-202608-001",
  "DEMO-202608-002",
  "DEMO-202608-003",
  "DEMO-202608-004",
  "DEMO-202608-005",
];

const demoUsers = [
  {
    name: "Nahid Rahman",
    email: "nahid@duneandgrills.com",
    phone: "+966 50 821 4032",
    address: "Wadi As Sarh, Al Wadi, Riyadh 18738",
    bio: "Food lover, grill enthusiast, and always ready to try something new.",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    rewardPoints: 550,
    addresses: [
      {
        label: "Home",
        fullAddress: "Wadi As Sarh, Al Wadi, Riyadh 18738",
        phone: "+966 50 821 4032",
        isDefault: true,
      },
      {
        label: "Work",
        fullAddress: "King Fahd Road, Al Olaya, Riyadh 12214",
        phone: "+966 50 821 4032",
        isDefault: false,
      },
    ],
    paymentMethods: [
      {
        cardBrand: "Visa",
        lastFourDigits: "4242",
        expiryMonth: 8,
        expiryYear: 2028,
        cardholderName: "Nahid Rahman",
        isDefault: true,
      },
      {
        cardBrand: "Mada",
        lastFourDigits: "1187",
        expiryMonth: 3,
        expiryYear: 2029,
        cardholderName: "Nahid Rahman",
        isDefault: false,
      },
    ],
  },
  {
    name: "Sara Alotaibi",
    email: "sara@duneandgrills.com",
    phone: "+966 55 410 7286",
    address: "Al Malqa, Riyadh 13521",
    bio: "Weekend foodie with a soft spot for smoky flavors and fresh juices.",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
    rewardPoints: 1240,
    addresses: [
      {
        label: "Home",
        fullAddress: "Al Malqa, Riyadh 13521",
        phone: "+966 55 410 7286",
        isDefault: true,
      },
    ],
    paymentMethods: [
      {
        cardBrand: "Mastercard",
        lastFourDigits: "7781",
        expiryMonth: 11,
        expiryYear: 2027,
        cardholderName: "Sara Alotaibi",
        isDefault: true,
      },
    ],
  },
];

const upsertDemoUser = async (profile, favorites) => {
  let user = await User.findOne({ email: profile.email }).select("+password");
  if (!user) user = new User({ email: profile.email });

  Object.assign(user, profile, {
    password: DEMO_PASSWORD,
    role: "customer",
    favorites,
  });
  await user.save();
  return user;
};

const orderItems = (menuItems, indexes) =>
  indexes.map(([index, quantity]) => {
    const menuItem = menuItems[index % menuItems.length];
    return {
      menuItem: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
    };
  });

const createDemoOrder = async ({
  orderNumber,
  user,
  items,
  status,
  createdAt,
}) =>
  Order.create({
    orderNumber,
    user: user._id,
    customer: {
      name: user.name,
      phone: user.phone,
      email: user.email,
      address: user.address,
    },
    items,
    totalAmount: items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    ),
    status,
    notes: "Demo account order",
    createdAt,
    updatedAt: createdAt,
  });

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);

    const menuItems = await MenuItem.find({ isAvailable: true }).sort({
      createdAt: 1,
    });
    if (menuItems.length < 3) {
      throw new Error("Seed the menu first with `npm run seed`, then rerun this script.");
    }

    const nahid = await upsertDemoUser(demoUsers[0],
      menuItems.slice(0, 3).map((item) => item._id)
    );
    const sara = await upsertDemoUser(
      demoUsers[1],
      [menuItems[2], menuItems[0], menuItems[1]].map((item) => item._id)
    );

    await Review.deleteMany({ user: { $in: [nahid._id, sara._id] } });
    await Order.deleteMany({ orderNumber: { $in: DEMO_ORDER_NUMBERS } });

    const orders = [];
    orders.push(
      await createDemoOrder({
        orderNumber: DEMO_ORDER_NUMBERS[0],
        user: nahid,
        items: orderItems(menuItems, [[0, 1], [2, 1]]),
        status: "delivered",
        createdAt: new Date("2026-08-18T18:30:00.000Z"),
      })
    );
    orders.push(
      await createDemoOrder({
        orderNumber: DEMO_ORDER_NUMBERS[1],
        user: nahid,
        items: orderItems(menuItems, [[1, 2], [3, 1]]),
        status: "delivered",
        createdAt: new Date("2026-08-12T19:15:00.000Z"),
      })
    );
    orders.push(
      await createDemoOrder({
        orderNumber: DEMO_ORDER_NUMBERS[2],
        user: nahid,
        items: orderItems(menuItems, [[2, 1], [4, 2]]),
        status: "preparing",
        createdAt: new Date("2026-08-25T17:45:00.000Z"),
      })
    );
    orders.push(
      await createDemoOrder({
        orderNumber: DEMO_ORDER_NUMBERS[3],
        user: sara,
        items: orderItems(menuItems, [[2, 2], [4, 1]]),
        status: "delivered",
        createdAt: new Date("2026-08-20T16:20:00.000Z"),
      })
    );
    orders.push(
      await createDemoOrder({
        orderNumber: DEMO_ORDER_NUMBERS[4],
        user: sara,
        items: orderItems(menuItems, [[0, 1], [3, 2]]),
        status: "confirmed",
        createdAt: new Date("2026-08-24T20:05:00.000Z"),
      })
    );

    await Review.create([
      {
        user: nahid._id,
        order: orders[0]._id,
        menuItem: menuItems[0]._id,
        rating: 5,
        comment: "Perfect smoky flavor and the burger arrived hot and fresh.",
      },
      {
        user: nahid._id,
        order: orders[1]._id,
        menuItem: menuItems[1]._id,
        rating: 4,
        comment: "A satisfying grilled sandwich with a generous filling.",
      },
      {
        user: sara._id,
        order: orders[3]._id,
        menuItem: menuItems[2]._id,
        rating: 5,
        comment: "The shawarma seasoning was excellent. I would order it again.",
      },
    ]);

    console.log("Demo account dashboard data seeded successfully.");
    console.log(`Login: ${nahid.email} / ${DEMO_PASSWORD}`);
    console.log(`Login: ${sara.email} / ${DEMO_PASSWORD}`);
  } catch (err) {
    console.error("Profile seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
