import "dotenv/config";
import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import Reward from "../models/Reward.js";

const rewardDefinitions = [
  {
    title: "Free Fresh Orange Juice",
    description: "Redeem a refreshing Fresh Orange Juice with your next order.",
    menuItemName: "Fresh Orange Juice",
    pointsRequired: 800,
    sortOrder: 1,
  },
  {
    title: "Free Desert Mocha",
    description: "Enjoy one rich Desert Mocha as a points reward.",
    menuItemName: "Desert Mocha",
    pointsRequired: 800,
    sortOrder: 2,
  },
  {
    title: "Free Smoked Dune Burger",
    description: "Redeem our signature char-grilled burger on your next order.",
    menuItemName: "Smoked Dune Burger",
    pointsRequired: 1500,
    sortOrder: 3,
  },
  {
    title: "Free Grilled Club Sandwich",
    description: "Use your points for a complete Grilled Club Sandwich reward.",
    menuItemName: "Grilled Club Sandwich",
    pointsRequired: 2000,
    sortOrder: 4,
  },
];

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);

    const menuItems = await MenuItem.find({
      name: { $in: rewardDefinitions.map((reward) => reward.menuItemName) },
    });
    const menuMap = new Map(menuItems.map((item) => [item.name, item]));
    const missing = rewardDefinitions
      .filter((reward) => !menuMap.has(reward.menuItemName))
      .map((reward) => reward.menuItemName);
    if (missing.length) {
      throw new Error(`Missing linked menu items: ${missing.join(", ")}`);
    }

    for (const definition of rewardDefinitions) {
      const menuItem = menuMap.get(definition.menuItemName);
      await Reward.findOneAndUpdate(
        { title: definition.title },
        {
          title: definition.title,
          description: definition.description,
          image: menuItem.image,
          pointsRequired: definition.pointsRequired,
          menuItem: menuItem._id,
          isActive: true,
          isDeleted: false,
          deletedAt: null,
          sortOrder: definition.sortOrder,
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    console.log(`Seeded ${rewardDefinitions.length} database-backed rewards.`);
  } catch (error) {
    console.error("Reward seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
