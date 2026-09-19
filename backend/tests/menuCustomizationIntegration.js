import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { addToCart } from "../controllers/cartController.js";
import MenuAddOn from "../models/MenuAddOn.js";
import MenuItem from "../models/MenuItem.js";
import User from "../models/User.js";
import {
  calculateCartSubtotal,
  cartLineToOrderItem,
  resolveCartLines,
} from "../services/catalogService.js";

const testUri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_customization_test";

const invokeAddToCart = async (user, body) => {
  let statusCode = 200;
  let payload;
  await addToCart(
    { user, body, params: {}, query: {} },
    {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return value; },
    }
  );
  return { statusCode, payload };
};

const run = async () => {
  await mongoose.connect(testUri);
  const databaseName = mongoose.connection.db.databaseName;
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to run destructive integration checks against ${databaseName}`);
  }
  await mongoose.connection.dropDatabase();

  const customizable = await MenuItem.create({
    name: "Custom Burger",
    description: "Customization integration test item",
    price: 20,
    category: "Burgers",
    image: "/custom-burger.jpg",
    customization: {
      enabled: true,
      spice: {
        enabled: true,
        options: ["no-spice", "medium", "hot"],
        default: "medium",
      },
    },
  });
  const otherItem = await MenuItem.create({
    name: "Plain Drink",
    description: "Non-customizable item",
    price: 8,
    category: "Drinks",
    image: "/plain-drink.jpg",
  });
  const cheese = await MenuAddOn.create({
    name: "Extra Cheese",
    price: 3,
    menuItems: [customizable._id],
  });
  const unavailable = await MenuAddOn.create({
    name: "Unavailable Sauce",
    price: 2,
    isActive: false,
    menuItems: [customizable._id],
  });
  const wrongItem = await MenuAddOn.create({
    name: "Drink Ice",
    price: 1,
    menuItems: [otherItem._id],
  });
  const customer = await User.create({
    name: "Customization Customer",
    email: "customization@example.com",
    password: "TestPassword123!",
    role: "customer",
  });

  const [configured] = await resolveCartLines([{
    productId: customizable._id,
    productType: "menuItem",
    quantity: 2,
    price: 0.01,
    customization: {
      selectedAddOns: [cheese._id],
      spiceLevel: "hot",
      note: "No onions",
    },
  }]);
  assert.equal(configured.baseUnitPrice, 20);
  assert.equal(configured.unitPrice, 23);
  assert.equal(calculateCartSubtotal([configured]), 46);
  assert.equal(configured.customization.selectedAddOns[0].price, 3);
  assert.equal(configured.customization.spiceLevel, "hot");
  assert.equal(configured.customization.note, "No onions");

  const snapshot = cartLineToOrderItem(configured);
  assert.equal(snapshot.basePrice, 20);
  assert.equal(snapshot.price, 23);
  assert.equal(snapshot.selectedAddOns[0].name, "Extra Cheese");
  assert.equal(snapshot.selectedAddOns[0].price, 3);
  assert.equal(snapshot.spiceLevel, "hot");
  assert.equal(snapshot.itemNote, "No onions");

  const savedCart = await invokeAddToCart(customer, {
    productId: customizable._id,
    productType: "menuItem",
    quantity: 2,
    customization: {
      selectedAddOns: [cheese._id],
      spiceLevel: "hot",
      note: "No onions",
    },
  });
  assert.equal(savedCart.statusCode, 201);
  assert.equal(savedCart.payload.data.length, 1);
  assert.equal(savedCart.payload.data[0].price, 23);
  assert.equal(savedCart.payload.data[0].quantity, 2);
  assert.equal(savedCart.payload.data[0].selectedAddOns[0].name, "Extra Cheese");
  assert.match(savedCart.payload.data[0].cartLineId, /^[a-f\d]{24}$/i);

  const secondConfiguration = await invokeAddToCart(customer, {
    productId: customizable._id,
    productType: "menuItem",
    quantity: 1,
    customization: { selectedAddOns: [], spiceLevel: "medium", note: "" },
  });
  assert.equal(secondConfiguration.statusCode, 201);
  assert.equal(secondConfiguration.payload.data.length, 2);

  const [legacy] = await resolveCartLines([{
    productId: customizable._id,
    productType: "menuItem",
    quantity: 1,
  }]);
  assert.equal(legacy.unitPrice, 20);
  assert.deepEqual(legacy.customization.selectedAddOns, []);

  const differentConfigurations = await resolveCartLines([
    {
      productId: customizable._id,
      quantity: 1,
      customization: { selectedAddOns: [cheese._id], spiceLevel: "medium" },
    },
    {
      productId: customizable._id,
      quantity: 1,
      customization: { selectedAddOns: [], spiceLevel: "hot" },
    },
  ]);
  assert.equal(differentConfigurations.length, 2);

  await assert.rejects(
    resolveCartLines([
      {
        productId: customizable._id,
        quantity: 1,
        customization: { selectedAddOns: [cheese._id], spiceLevel: "medium" },
      },
      {
        productId: customizable._id,
        quantity: 1,
        customization: { selectedAddOns: [cheese._id], spiceLevel: "medium" },
      },
    ]),
    /duplicate configured product lines/
  );
  await assert.rejects(
    resolveCartLines([{
      productId: customizable._id,
      quantity: 1,
      customization: { selectedAddOns: [unavailable._id], spiceLevel: "medium" },
    }]),
    /no longer available/
  );
  await assert.rejects(
    resolveCartLines([{
      productId: customizable._id,
      quantity: 1,
      customization: { selectedAddOns: [wrongItem._id], spiceLevel: "medium" },
    }]),
    /no longer available/
  );
  await assert.rejects(
    resolveCartLines([{
      productId: customizable._id,
      quantity: 1,
      customization: { selectedAddOns: [], spiceLevel: "mild" },
    }]),
    /spice level is not available/
  );
  await assert.rejects(
    resolveCartLines([{
      productId: otherItem._id,
      quantity: 1,
      customization: { selectedAddOns: [], note: "Custom note" },
    }]),
    /Customization is not available/
  );

  console.log("Menu customization integration checks passed");
};

try {
  await run();
} finally {
  if (mongoose.connection.readyState === 1) {
    const databaseName = mongoose.connection.db.databaseName;
    if (databaseName.endsWith("_test")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
