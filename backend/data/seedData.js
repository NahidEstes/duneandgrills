// Seed data used to populate the database. This is NOT consumed directly by
// the frontend — it only exists so `npm run seed` has real content to write
// into MongoDB. All menu content lives in the database from that point on
// and is served dynamically through /api/menu.

const seedData = [
  {
    name: "Smoked Dune Burger",
    description:
      "Char-grilled beef patty, smoked gouda, caramelized onions and amber BBQ glaze on a toasted brioche bun.",
    price: 8.5,
    category: "Food",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
    tags: ["bestseller"],
    isFeatured: true,
  },
  {
    name: "Grilled Club Sandwich",
    description:
      "Triple-stacked grilled chicken, crisp bacon, lettuce and tomato with smoked paprika mayo.",
    price: 7.0,
    category: "Food",
    image:
      "https://images.unsplash.com/photo-1567234669003-dce7a7a88821?auto=format&fit=crop&w=800&q=80",
    tags: [],
    isFeatured: false,
  },
  {
    name: "Shawarma Platter",
    description:
      "Slow-roasted spiced chicken shawarma, garlic sauce and pickles wrapped in warm flatbread.",
    price: 9.0,
    category: "Food",
    image:
      "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?auto=format&fit=crop&w=800&q=80",
    tags: ["bestseller"],
    isFeatured: true,
  },
  {
    name: "Desert Mocha",
    description:
      "Rich espresso, steamed milk and dark chocolate finished with a dusting of cinnamon.",
    price: 4.5,
    category: "Drinks",
    image:
      "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=800&q=80",
    tags: [],
    isFeatured: false,
  },
  {
    name: "Fresh Orange Juice",
    description: "Cold-pressed oranges, served over ice. Nothing added, nothing hidden.",
    price: 3.5,
    category: "Drinks",
    image:
      "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=800&q=80",
    tags: [],
    isFeatured: false,
  },
  {
    name: "Shrimp Dynamite",
    description:
      "Crispy golden shrimp tossed in a spicy-sweet dynamite sauce, finished with sesame and scallion.",
    price: 11.0,
    category: "Appetizers",
    image:
      "https://images.unsplash.com/photo-1625938144870-b6e1e7a5c8fc?auto=format&fit=crop&w=800&q=80",
    tags: ["bestseller", "spicy"],
    isFeatured: true,
  },
];

export default seedData;
