import { sellingRecipeHandlers } from "./recipeController.js";
const handlers = sellingRecipeHandlers("addon");
export const listAddOnRecipes = handlers.list;
export const getAddOnRecipe = handlers.get;
export const updateAddOnRecipe = handlers.save;
export const getAddOnRecipeHistory = handlers.history;
export const exportAddOnRecipes = handlers.export;
