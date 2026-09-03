const API_BASE_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api"
).replace(/\/$/, "");

const get = async (path, params = {}) => {
  const url = new URL(`${API_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const error = new Error(`API request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

export const getMenuItems = async (category) => {
  const response = await get("/menu", category ? { category } : {});
  return response.data;
};

export const getCombos = async () => {
  const response = await get("/combos");
  return response.data;
};

export const getCategories = async (type) => {
  const response = await get("/categories", { type });
  return response.data;
};

export const getOffers = async () => {
  const response = await get("/offers");
  return response.data;
};

export const getBlogPosts = async ({
  category,
  search,
  limit,
  excludeSlug,
} = {}) => {
  const response = await get("/blog", {
    category,
    search,
    limit,
    excludeSlug,
  });
  return response.data;
};

export const getBlogPost = async (slug) => {
  const response = await get(`/blog/slug/${encodeURIComponent(slug)}`);
  return response.data;
};

export const getRelatedBlogPosts = async (slug, limit = 3) => {
  const response = await get(
    `/blog/slug/${encodeURIComponent(slug)}/related`,
    { limit }
  );
  return response.data;
};

export const getBlogCategoryCounts = async () => {
  const response = await get("/blog/categories");
  return response.data;
};

export const getPublicPageData = async () => {
  const [menu, combos, posts, categories] = await Promise.allSettled([
    getMenuItems(),
    getCombos(),
    getBlogPosts(),
    getBlogCategoryCounts(),
  ]);

  return {
    menu: menu.status === "fulfilled" ? menu.value : [],
    combos: combos.status === "fulfilled" ? combos.value : [],
    posts: posts.status === "fulfilled" ? posts.value : [],
    categories: categories.status === "fulfilled" ? categories.value : [],
  };
};

export const getSidebarData = async (currentSlug) => {
  const [posts, categories, menu] = await Promise.allSettled([
    getBlogPosts({ limit: 3, excludeSlug: currentSlug }),
    getBlogCategoryCounts(),
    getMenuItems(),
  ]);

  const menuItems = menu.status === "fulfilled" ? menu.value : [];

  return {
    recentPosts: posts.status === "fulfilled" ? posts.value : [],
    categories: categories.status === "fulfilled" ? categories.value : [],
    special:
      menuItems.find((item) => item.isFeatured) || menuItems[0] || null,
  };
};
