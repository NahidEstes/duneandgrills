import { getRecipeInstruction, inventoryInstructionOptions, listRecipeInstructions, recipeManualAvailability, saveRecipeInstruction } from "../services/recipeInstructionService.js";
import { recipeHistory, recipeLifecycle, recipeTrials, recordRecipeTrial } from "../services/recipeInstructionWorkflowService.js";
const respond = work => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, data: await work(req) }); } catch (error) { next(error); }
};
export const listInstructions = respond(req => listRecipeInstructions(req.user, req.query.view));
export const getInstruction = respond(req => getRecipeInstruction(req.params.code, req.user, req.query));
export const historyInstructions = respond(req => recipeHistory(req.params.code, req.user, req.query));
export const trialInstructions = respond(req => recipeTrials(req.params.code, req.user, req.query));
export const recordInstructionTrial = respond(req => recordRecipeTrial(req.params.code, req.body, req.user));
export const transitionInstruction = respond(req => recipeLifecycle(req.params.code, req.params.action, req.body, req.user));
export const saveInstruction = respond(req => saveRecipeInstruction(req.params.code, req.body, req.user));
export const listInstructionInventoryOptions = respond(req => inventoryInstructionOptions(req.user, req.query.search));
export const getInstructionManual = respond(req => recipeManualAvailability(req.user));
