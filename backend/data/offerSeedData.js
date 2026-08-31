const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const money = (value) => Number(Number(value).toFixed(2));

const createOfferSeedData = (
  now = new Date(),
  { menuItems = [], combos = [] } = {}
) => {
  const started = addDays(now, -1);
  const menuByName = new Map(menuItems.map((item) => [item.name, item]));
  const comboByName = new Map(combos.map((combo) => [combo.name, combo]));
  const shawarmaPrice = Number(menuByName.get("Shawarma Platter")?.price) || 9;
  const burgerPrice = Number(menuByName.get("Smoked Dune Burger")?.price) || 8.5;
  const mochaPrice = Number(menuByName.get("Desert Mocha")?.price) || 4.5;
  const familyPrice = Number(combos[0]?.comboPrice) || burgerPrice;
  const productFields = (name, quantity = 1, fallbackMenuName = "") => {
    const menuItem = menuByName.get(name);
    if (menuItem) {
      return {
        orderProductType: "menuItem",
        menuItem: menuItem._id,
        orderQuantity: quantity,
      };
    }
    const combo = comboByName.get(name) || combos[0];
    if (combo) {
      return {
          orderProductType: "combo",
          combo: combo._id,
          orderQuantity: quantity,
        };
    }
    const fallbackMenu = menuByName.get(fallbackMenuName);
    return fallbackMenu
      ? {
          orderProductType: "menuItem",
          menuItem: fallbackMenu._id,
          orderQuantity: quantity,
        }
      : {};
  };

  return [
    {
      title: "Buy 1 Get 1 Free",
      subtitle: "Chicken Shawarma",
      description:
        "Double the flavor, zero extra cost. Grab two fire-grilled chicken shawarmas for the price of one.",
      image:
        "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?auto=format&fit=crop&w=1600&q=85",
      badge: "Featured Offer",
      discountText: "Best Deal",
      originalPrice: Number((shawarmaPrice * 2).toFixed(2)),
      offerPrice: shawarmaPrice,
      promoCode: "SHAWARMA1",
      ...productFields("Shawarma Platter", 2),
      discountType: "fixed",
      discountValue: shawarmaPrice,
      couponScope: "product",
      startDate: started,
      expiresAt: addDays(now, 10),
      isFeatured: true,
      isActive: true,
      ctaText: "Order Now",
      ctaLink: "/menu",
      sortOrder: 0,
    },
    {
      title: "20% Off Burgers",
      subtitle: "Smoked Dune Burger",
      description:
        "Juicy flame-grilled burgers with bigger savings for a limited time.",
      image:
        "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85",
      badge: "Limited Time",
      discountText: "Save 20%",
      originalPrice: burgerPrice,
      offerPrice: Number((burgerPrice * 0.8).toFixed(2)),
      promoCode: "BURGER20",
      ...productFields("Smoked Dune Burger"),
      discountType: "percentage",
      discountValue: 20,
      couponScope: "product",
      startDate: started,
      expiresAt: addDays(now, 7),
      isActive: true,
      ctaText: "Order Now",
      ctaLink: "/menu",
      sortOrder: 1,
    },
    {
      title: "Free Chocolate Mocha",
      subtitle: "With orders over 49 SAR",
      description:
        "Spend 49 SAR or more and enjoy a rich chocolate mocha on the house.",
      image:
        "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=1200&q=85",
      badge: "Today Only",
      discountText: "Free",
      originalPrice: mochaPrice,
      offerPrice: 0,
      promoCode: "MOCHA49",
      ...productFields("Desert Mocha"),
      discountType: "fixed",
      discountValue: mochaPrice,
      couponScope: "product",
      minimumOrderAmount: 49,
      startDate: started,
      expiresAt: addDays(now, 3),
      isActive: true,
      ctaText: "Order Now",
      ctaLink: "/menu",
      sortOrder: 2,
    },
    {
      title: "Weekend Family Deal",
      subtitle: "Meals, sides and drinks",
      description:
        "A generous family spread with grilled favorites, sides and refreshing drinks.",
      image:
        "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=85",
      badge: "Weekend Special",
      discountText: "Save 30%",
      originalPrice: familyPrice,
      offerPrice: Number((familyPrice * 0.7).toFixed(2)),
      promoCode: "FAMILY30",
      ...productFields("Weekend Family Deal", 1, "Smoked Dune Burger"),
      discountType: "percentage",
      discountValue: 30,
      couponScope: "order",
      maximumDiscount: 45,
      startDate: started,
      expiresAt: addDays(now, 14),
      isActive: true,
      ctaText: "Order Now",
      ctaLink: "/menu",
      sortOrder: 3,
    },
    {
      title: "Combo Saver",
      subtitle: "Sandwich, fries and drink",
      description:
        "A toasted grilled sandwich, crispy fries and a chilled drink in one combo.",
      image:
        "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=1200&q=85",
      badge: "Great Value",
      discountText: `Just ${money(Math.max(0, familyPrice - 10))} SAR`,
      originalPrice: familyPrice,
      offerPrice: Number(Math.max(0, familyPrice - 10).toFixed(2)),
      promoCode: "COMBO29",
      ...productFields("Combo Saver", 1, "Grilled Club Sandwich"),
      discountType: "fixed",
      discountValue: 10,
      couponScope: "product",
      startDate: started,
      expiresAt: addDays(now, 20),
      isActive: true,
      ctaText: "Order Now",
      ctaLink: "/menu",
      sortOrder: 4,
    },
  ];
};

export default createOfferSeedData;
