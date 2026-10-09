export const RECIPE_TABS = [
  ["ingredients", "Ingredients"], ["preparation", "Preparation"],
  ["cooking", "Cooking & Assembly"], ["serving", "Serving & Delivery"],
  ["storage", "Storage & Allergens"],
];
export const RECIPE_CATEGORIES = ["Main Recipes", "Preparation Recipes", "Kitchen Guides"];
export const recipeMatches = (recipe, search, category) =>
  (category === "All" || recipe.category === category) &&
  [recipe.name, recipe.code, ...(recipe.aliases || [])].join(" ").toLowerCase().includes(search.trim().toLowerCase());
export const resolveRecipe = (recipes, code) => recipes.find(recipe => recipe.code === code || recipe.aliases.includes(code));
export const quantityLabel = (ingredient, presetIndex) => {
  const amount = ingredient.quantities[presetIndex];
  if (!Number.isFinite(amount)) return "Unavailable";
  const grams = `${new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(amount)} ${ingredient.unit}`;
  return ingredient.counts?.[presetIndex] ? `${ingredient.counts[presetIndex]} / ${grams}` : grams;
};
