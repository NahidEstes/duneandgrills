import "dotenv/config";
import mongoose from "mongoose";
import ExpenseCategory from "../models/ExpenseCategory.js";
import User from "../models/User.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
const defaults = [
  ["Rent", "#f59e0b"], ["Electricity", "#fb923c"], ["Water", "#38bdf8"],
  ["Internet & Telephone", "#a78bfa"], ["Salaries", "#22c55e"], ["Maintenance & Repairs", "#d6a66a"],
  ["Cleaning", "#2dd4bf"], ["Marketing", "#f472b6"], ["Delivery & Fuel", "#f97316"],
  ["Licences & Government Fees", "#eab308"], ["Insurance", "#60a5fa"], ["Office Supplies", "#94a3b8"],
  ["Equipment", "#c084fc"], ["Professional Services", "#818cf8"], ["Miscellaneous", "#737373"],
];

try {
  await mongoose.connect(MONGO_URI);
  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) throw new Error("Create an admin user before seeding expense categories");
  for (const [name, color] of defaults) {
    await ExpenseCategory.updateOne(
      { name },
      { $setOnInsert: { name, color, description: "", isActive: true, createdBy: admin._id, updatedBy: admin._id } },
      { upsert: true, collation: { locale: "en", strength: 2 } }
    );
  }
  console.log(`Expense category seed complete (${defaults.length} defaults, existing records preserved)`);
} finally {
  await mongoose.disconnect();
}
