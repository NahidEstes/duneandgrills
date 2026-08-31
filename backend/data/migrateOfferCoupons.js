import "dotenv/config";
import mongoose from "mongoose";
import Combo from "../models/Combo.js";
import MenuItem from "../models/MenuItem.js";
import Offer from "../models/Offer.js";

const money = (value) => Number(Number(value).toFixed(2));

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);

    const [menuItems, combos] = await Promise.all([
      MenuItem.find({}).select("name price").lean(),
      Combo.find({ status: "published", isAvailable: true })
        .select("name comboPrice")
        .lean(),
    ]);
    const byName = new Map(menuItems.map((item) => [item.name, item]));
    const shawarma = byName.get("Shawarma Platter");
    const burger = byName.get("Smoked Dune Burger");
    const mocha = byName.get("Desert Mocha");
    const sandwich = byName.get("Grilled Club Sandwich");
    const familyCombo =
      combos.find((combo) => combo.name === "Dune Family Combo") || combos[0];

    const productTarget = (product, quantity = 1) =>
      product
        ? {
            orderProductType: "menuItem",
            menuItem: product._id,
            combo: null,
            orderQuantity: quantity,
          }
        : null;
    const comboTarget = (combo, fallback) =>
      combo
        ? {
            orderProductType: "combo",
            combo: combo._id,
            menuItem: null,
            orderQuantity: 1,
          }
        : productTarget(fallback);

    const migrations = [
      shawarma && {
        promoCode: "SHAWARMA1",
        update: {
          ...productTarget(shawarma, 2),
          originalPrice: money(shawarma.price * 2),
          offerPrice: money(shawarma.price),
          discountType: "fixed",
          discountValue: money(shawarma.price),
          couponScope: "product",
          minimumOrderAmount: 0,
        },
      },
      burger && {
        promoCode: "BURGER20",
        update: {
          ...productTarget(burger),
          originalPrice: money(burger.price),
          offerPrice: money(burger.price * 0.8),
          discountType: "percentage",
          discountValue: 20,
          couponScope: "product",
          minimumOrderAmount: 0,
        },
      },
      mocha && {
        promoCode: "MOCHA49",
        update: {
          ...productTarget(mocha),
          originalPrice: money(mocha.price),
          offerPrice: 0,
          discountType: "fixed",
          discountValue: money(mocha.price),
          couponScope: "product",
          minimumOrderAmount: 49,
        },
      },
      (familyCombo || burger) && {
        promoCode: "FAMILY30",
        update: {
          ...comboTarget(familyCombo, burger),
          originalPrice: money(familyCombo?.comboPrice || burger.price),
          offerPrice: money((familyCombo?.comboPrice || burger.price) * 0.7),
          discountType: "percentage",
          discountValue: 30,
          maximumDiscount: 45,
          couponScope: "order",
          minimumOrderAmount: 0,
        },
      },
      (familyCombo || sandwich) && {
        promoCode: "COMBO29",
        update: {
          ...comboTarget(familyCombo, sandwich),
          originalPrice: money(familyCombo?.comboPrice || sandwich.price),
          offerPrice: money(
            Math.max(0, (familyCombo?.comboPrice || sandwich.price) - 10)
          ),
          discountText: `Just ${money(
            Math.max(0, (familyCombo?.comboPrice || sandwich.price) - 10)
          )} SAR`,
          discountType: "fixed",
          discountValue: 10,
          couponScope: "product",
          minimumOrderAmount: 0,
        },
      },
    ].filter(Boolean);

    let updated = 0;
    for (const migration of migrations) {
      const result = await Offer.updateOne(
        { promoCode: migration.promoCode },
        { $set: migration.update },
        { timestamps: false }
      );
      updated += result.modifiedCount;
      console.log(
        `${migration.promoCode}: ${result.matchedCount ? "mapped" : "not found"}`
      );
    }
    console.log(`Updated ${updated} existing offer records.`);
  } catch (error) {
    console.error("Offer coupon migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
