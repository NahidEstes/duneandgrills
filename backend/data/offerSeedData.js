const addDays = (date, days) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const createOfferSeedData = (now = new Date()) => {
  const started = addDays(now, -1);

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
      originalPrice: 36,
      offerPrice: 18,
      promoCode: "SHAWARMA1",
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
      originalPrice: 34,
      offerPrice: 27.2,
      promoCode: "BURGER20",
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
      originalPrice: 18,
      offerPrice: 0,
      promoCode: "MOCHA49",
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
      originalPrice: 149,
      offerPrice: 104,
      promoCode: "FAMILY30",
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
      discountText: "Just 29 SAR",
      originalPrice: 39,
      offerPrice: 29,
      promoCode: "COMBO29",
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
