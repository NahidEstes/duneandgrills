import api from "./api.js";
const data = promise => promise.then(response => response.data.data);
export const fetchRecipeInstructions = options => data(api.get("/kitchen/recipes", options));
export const fetchRecipeInstructionManual = options => data(api.get("/kitchen/recipes/manual", options));
export const fetchInstructionInventoryOptions = (search = "", options = {}) => data(api.get("/kitchen/recipes/inventory-options", { ...options, params: { search } }));
export const saveRecipeInstructionDraft = (code, payload) => data(api.put(`/kitchen/recipes/${encodeURIComponent(code)}`, payload));
