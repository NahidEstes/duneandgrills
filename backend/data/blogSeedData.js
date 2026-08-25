// Seed data for the blog. This is NOT read by the frontend directly — it
// only exists so `npm run seed:blog` has content to write into MongoDB.
// The frontend always fetches posts live from /api/blog.

const blogSeedData = [
  {
    title: "5 Secrets to the Perfect Char-Grilled Burger",
    excerpt:
      "From patty thickness to resting time, here's what separates a good burger from a great one.",
    content: `Every great burger starts with the meat. We use an 80/20 beef blend — enough fat to stay juicy over an open flame, but lean enough to hold its shape.

1. Don't overwork the meat. Shape the patty gently; overworking makes it dense and tough.
2. Season only the outside, right before grilling. Salting too early draws out moisture.
3. Make a small thumbprint dent in the center. This stops the patty from puffing up into a dome as it cooks.
4. High heat, short time. A hot grill sears the outside fast and locks in the juices.
5. Let it rest for two minutes before building the burger. The juices redistribute instead of running out onto the bun.

Master these five steps and you'll notice the difference in every bite — that's the Dune & Grills standard.`,
    coverImage:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
    category: "Recipes",
    author: "Chef Omar",
    tags: ["burger", "grilling", "tips"],
    isPublished: true,
  },
  {
    title: "Behind the Grill: A Day in Our Kitchen",
    excerpt:
      "Ever wondered what it takes to keep the flames going from open to close? Here's an inside look.",
    content: `Our day starts before sunrise. The team arrives at 6 AM to prep — chopping vegetables, marinating shawarma spice blends, and firing up the grill so it reaches the perfect temperature before the first order comes in.

By 10 AM, the kitchen is in full rhythm. Every dish that leaves the pass has been touched by at least three pairs of hands: prep, grill, and plating.

What most guests don't see is the constant tasting. Our chefs sample sauces, check spice levels, and adjust seasoning throughout the day — because consistency matters as much as flavor.

By closing time, the grill has cooked hundreds of orders, but the standard never drops. That's the promise behind every plate we serve.`,
    coverImage:
      "https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=1200&q=80",
    category: "Behind the Scenes",
    author: "Dune & Grills Team",
    tags: ["kitchen", "team", "story"],
    isPublished: true,
  },
  {
    title: "Shawarma 101: The Spices That Make It Sing",
    excerpt:
      "A look at the spice blend behind our shawarma platter, and why layering flavor matters.",
    content: `Great shawarma isn't about one dominant spice — it's about balance. Our blend layers warm, earthy notes with a touch of brightness:

- Cumin and coriander for an earthy base
- Paprika for color and a mild smokiness
- Garlic and onion powder for depth
- A pinch of cinnamon and allspice for warmth
- Fresh lemon juice added at the end to lift everything

The meat marinates for at least twelve hours before it ever touches the grill, giving the spices time to fully penetrate. Then it's slow-roasted and shaved to order, so every wrap comes out hot, tender, and full of flavor.

Pair it with our garlic sauce and pickles for the full experience.`,
    coverImage:
      "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?auto=format&fit=crop&w=1200&q=80",
    category: "Recipes",
    author: "Chef Omar",
    tags: ["shawarma", "spices", "recipe"],
    isPublished: true,
  },
  {
    title: "How to Read a Menu Like a Nutrition-Conscious Diner",
    excerpt:
      "Simple tips for making balanced choices without giving up flavor — including how we calculate calories.",
    content: `Eating out doesn't mean abandoning your goals. Here's how to navigate a menu smartly:

Look for grilled over fried. Grilling uses far less oil, which means fewer empty calories without sacrificing taste — it's the foundation of everything we cook.

Balance your plate. Pairing a protein-forward dish like our Shawarma Platter with a lighter side, such as fresh juice instead of a soda, is an easy way to cut down on added sugar.

Check portion sizes, not just labels. A dish can be "healthy" in ingredients but still large in portion. We list calorie counts on our menu items so you can make an informed choice at a glance.

Don't skip flavor for the sake of health. Spices like the ones in our shawarma blend add tremendous flavor without adding calories — it's a simple swap that makes a real difference.`,
    coverImage:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=80",
    category: "Nutrition",
    author: "Dune & Grills Team",
    tags: ["nutrition", "healthy-eating"],
    isPublished: true,
  },
  {
    title: "Introducing Shrimp Dynamite: Our Boldest Appetizer Yet",
    excerpt:
      "A new addition to the menu — crispy shrimp with a spicy-sweet sauce that's already a fan favorite.",
    content: `We're excited to officially introduce Shrimp Dynamite to the Dune & Grills menu. This dish has been in testing for months, and we're finally happy with every detail.

The shrimp is lightly battered and fried until golden, then tossed in a sauce that balances heat and sweetness — sriracha and honey form the base, finished with a touch of garlic and lime.

It's topped with sesame seeds and sliced scallion for crunch and color. Whether you're ordering it as a starter to share or a stand-alone treat, it delivers big flavor in every bite.

Come try it — it's already climbing the ranks as one of our most-ordered appetizers.`,
    coverImage:
      "https://images.unsplash.com/photo-1625938144870-b6e1e7a5c8fc?auto=format&fit=crop&w=1200&q=80",
    category: "News",
    author: "Dune & Grills Team",
    tags: ["new-menu", "appetizers", "announcement"],
    isPublished: true,
  },
];

export default blogSeedData;
