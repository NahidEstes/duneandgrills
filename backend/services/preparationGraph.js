import { ValidationError } from "../utils/inventoryValidation.js";

// Call with the complete graph, including inactive definitions, and replace an
// edited recipe before calling. Iterative DFS also supports long existing chains.
export function validatePreparationGraph(recipes) {
  const graph = new Map();
  for (const recipe of recipes) {
    const id = String(recipe.finishedItem);
    if (graph.has(id)) throw new ValidationError("This finished item already has a preparation recipe");
    graph.set(id, { name: recipe.name, inputs: recipe.ingredients.map(row => String(row.inventoryItem)) });
  }
  const state = new Map();
  for (const start of graph.keys()) {
    if (state.has(start)) continue;
    const stack = [{ id: start, index: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1], node = graph.get(frame.id);
      if (frame.index === node.inputs.length) { state.set(frame.id, 2); stack.pop(); continue; }
      const input = node.inputs[frame.index++];
      if (!graph.has(input) || state.get(input) === 2) continue;
      if (state.get(input) === 1) {
        const names = stack.slice(stack.findIndex(row => row.id === input)).map(row => graph.get(row.id).name);
        names.push(graph.get(input).name);
        throw new ValidationError(`Preparation cycle detected: ${names.join(" → ")}. Change the ingredients so a preparation never depends on itself, even through inactive recipes.`);
      }
      state.set(input, 1); stack.push({ id: input, index: 0 });
    }
  }
}
