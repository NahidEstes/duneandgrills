import { getSellingRecipe, listSellingRecipes, saveSellingRecipe, previewSellingRecipe, sellingRecipeHistory, recipeCsv } from "../../services/sellingRecipeService.js";
import { runInventoryTransaction } from "../../services/inventoryStockService.js";
import { ValidationError } from "../../utils/inventoryValidation.js";

const handle = work => async (req, res, next) => {
  try { res.set?.("Cache-Control", "private, no-store"); res.json({ success: true, ...await work(req) }); } catch (error) { next(error); }
};
export const sellingRecipeHandlers = kind => ({
  list: handle(req => listSellingRecipes(kind, req.query)),
  get: handle(async req => ({ data: await getSellingRecipe(kind, req.params.menuItemId || req.params.addOnId) })),
  save: handle(async req => ({ data: await saveSellingRecipe(req.user, kind, req.params.menuItemId || req.params.addOnId, req.body, req.correlationId) })),
  history: handle(req => sellingRecipeHistory(req.user, kind, req.params.menuItemId || req.params.addOnId, req.query)),
  export: async (req, res, next) => {
    try {
      if (!["page", "all"].includes(req.query.scope)) throw new ValidationError("Choose page or all filtered export scope");
      const result = await runInventoryTransaction(session => listSellingRecipes(kind, req.query, { all: req.query.scope === "all", session }), { requireTransaction: true });
      const csv = recipeCsv(result.data, kind);
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Disposition", 'attachment; filename="' + kind + '-recipes-' + req.query.scope + '.csv"');
      res.set("X-Export-Rows", String(result.data.length));
      res.type("text/csv").send(csv);
    } catch (error) { next(error); }
  },
});
export const reviewSellingRecipe = handle(async req => ({ data: await previewSellingRecipe(req.user, req.body) }));
const menu = sellingRecipeHandlers("menu");
export const listRecipes = menu.list;
export const getRecipe = menu.get;
export const updateRecipe = menu.save;
export const getRecipeHistory = menu.history;
export const exportRecipes = menu.export;
