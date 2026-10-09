// Transcribed from the owner's English manual v1.3 (08 October 2026).
// Read-only source preview: importing this module NEVER inserts database records.
const safety = "SOURCE GUIDANCE ONLY: owner/chef trial and applicable local food-safety review required. These formulas are NOT approved for regular service; house storage limits are not validated shelf lives.";
const hygiene = "Separate raw and ready-to-eat boards, tongs and containers. Keep raw meat covered on the lowest refrigerator shelf; follow handwashing and probe cleaning/sanitizing procedures. Check each cooked portion.";
const cooling = "Cool cooked toppings in shallow pans or an ice bath: 57°C to 21°C within 2 hours; 57°C to 5°C or below within 6 hours total. Record time and temperature; do not use food that misses these limits.";
const ingredient = (name, quantities, basis, specification = "", counts = []) => ({ name, quantities, unit: "g", basis, specification, counts });
const source = pages => ({ manualVersion: "1.3", manualDate: "2026-10-08", pages });
const common = { status: "trial_required", recipeVersion: "1.3", warnings: [safety], servingPhoto: null, inventoryRecipe: null, reviewNotes: "", revision: 0, persisted: false };

export const RECIPE_CATEGORIES = ["Main Recipes", "Preparation Recipes", "Kitchen Guides"];
export const RECIPE_PILOT = [
  {
    ...common, code: "B01", aliases: [], name: "Double Beef Cheeseburger", category: "Main Recipes",
    description: "Seared beef, melted cheese, tangy pickles and sweet onion. No egg or breadcrumbs in the meat.",
    source: source([3, 6, 11, 12, 14]), linkedPreparationCodes: ["HB01", "T1"],
    presets: [{ key: "one", label: "1 serving" }, { key: "ten", label: "10 servings" }],
    ingredients: [
      ingredient("80/20 beef mince", [160, 1600], "raw, trimmed", "80% lean / 20% fat; single medium grind; approved supplier; two 80 g patties per serving."),
      ingredient("Fine salt", [1.6, 16], "ingredient", "Do not mix into beef beforehand."),
      ingredient("Ground black pepper", [0.3, 3], "ingredient"),
      ingredient("Bun", [80, 800], "ingredient", "80 g; approximately 10–11 cm; soft, mildly sweet, butter-toasted.", ["1 bun", "10 buns"]),
      ingredient("American processed cheese", [30, 300], "ingredient", "15 g per slice / patty.", ["2 slices × 15 g", "20 slices"]),
      ingredient("S1 House Burger Sauce / HB01 Classic", [25, 250], "prepared", "Default S1 formula; HB01 is the same formula, not a substitution."),
      ingredient("Drained pickle slices", [15, 150], "drained"),
      ingredient("T1 Caramelized Onion", [20, 200], "prepared", "Weigh after cooking, not raw onion."),
      ingredient("Unsalted butter", [5, 50], "ingredient"),
    ],
    preparation: ["Gently form chilled mince into two 80 g balls per serving. Do not knead or pack tightly. Cover and keep at 0–4°C; do not mix in salt beforehand.", "Use fixed ingredient brands and supplier specifications. Weigh small decimal spice quantities as a 10-serving batch; the 1-serving column is the allocation. Required equipment: griddle, rack, refrigerator, thin-probe thermometer; 1 g and 0.1 g scales."],
    cooking: ["Heat griddle surface to 220–230°C. Spread a total of 5 g butter per serving on the bun; toast on a separate 170–180°C zone for 30–60 seconds until golden.", "Smash the beef balls once within the first 10 seconds to approximately 11–12 cm wide and 5–7 mm thick. Divide the allocated salt and pepper evenly between patties.", "Cook first side approximately 90–120 seconds. Lift browned crust intact with a sharp spatula, flip; cook other side approximately 60–90 seconds. Do not press again.", "Add 15 g cheese to each patty; cover for 20–30 seconds to melt. Insert a thin probe sideways into the center and confirm EVERY patty reaches at least 72°C. Time or colour is not a substitute for measurement."],
    assembly: ["Per serving: bottom bun → 15 g S1 sauce → 15 g pickles → 2 patties with cheese → 20 g prepared T1 onion → top bun with 10 g S1 sauce. Serve immediately."],
    serving: ["Check brown crust, safely cooked center, melted cheese and an unburnt bun. Sauce should not run out. Aim to serve within 2 minutes of finishing cooking."],
    delivery: ["Use food-safe packaging with ventilation; pack fries separately. Test actual food at 20 and 30 minutes after dispatch. Sauce/vegetable changes for delivery require a separate approved card, not verbal changes (manual p.12)."],
    storage: ["Portioned raw beef: 0–4°C, maximum 24 hours after preparation or earlier expiry/use-by, whichever is sooner.", "S1 sauce: 48 hours or earlier ingredient use-by; T1: 24 hours at 0–4°C. Follow linked preparation controls.", hygiene],
    allergens: ["Manual p.11: wheat, milk, egg and mustard; soy or sesame may be present depending on brand. Check supplier labels and communicate shared-griddle/fryer contact. Do not claim allergen-free."],
    yieldNotes: ["Raw beef weight is not cooked yield. Record actual raw/cooked and finished serving weights in the kitchen trial. No measured yield is provided."],
  },
  {
    ...common, code: "HB01", aliases: ["S1"], name: "Classic House Burger Sauce", category: "Preparation Recipes",
    description: "House Burger Sauce / S1: tangy tomato-mustard, pickle crunch and a light smoky finish. One formula with two codes.",
    source: source([3, 4, 11, 15, 16, 19]), linkedPreparationCodes: [],
    presets: [{ key: "500g", label: "500 g batch" }, { key: "1kg", label: "1 kg batch" }],
    ingredients: [
      ingredient("Commercial mayonnaise", [300, 600], "purchased base", "Full-fat; pasteurized eggs; fixed brand."),
      ingredient("Ketchup", [80, 160], "purchased base", "Fixed brand."),
      ingredient("Dijon mustard", [50, 100], "purchased base", "Fixed brand."),
      ingredient("Dill pickles, finely chopped", [50, 100], "drained solids", "Fixed brand; chop to 2–3 mm; weigh brine separately."),
      ingredient("Dill pickle brine", [10, 20], "liquid", "Reserved separately from drained solids."),
      ingredient("Smoked paprika", [5, 10], "ingredient"),
      ingredient("Onion powder, unsalted", [3, 6], "ingredient"),
      ingredient("Garlic powder, unsalted", [2, 4], "ingredient"),
    ],
    preparation: ["Use chilled bases and sanitized equipment. Keep mayonnaise, Dijon, ketchup and pickle brands constant; use unsalted garlic/onion powder. No extra salt, water or unmeasured seasoning.", "Drain dill pickles, reserving brine separately. Chop to 2–3 mm. Weigh every ingredient before mixing.", "Whisk mayonnaise, ketchup, Dijon and measured brine until smooth. Fold in pickles and dry spices; scrape bowl and mix evenly.", "Cover and chill at 0–4°C for 30 minutes. Stir once before portioning."],
    cooking: [], assembly: [],
    serving: ["25 g per burger: 15 g on bottom bun + 10 g on top bun. S1 allocation for beef sandwich is 20 g (p.4). HB02/HB03 are optional variations, not the B01 default."],
    delivery: ["Taste on the complete burger and assess delivery quality with the trial sheet (p.13); no measured delivery-quality result is provided."],
    storage: ["Cover and refrigerate at 0–4°C. Use within 48 hours of mixing or earliest ingredient use-by/opened-use limit, whichever is sooner. Mixing never restarts ingredient dates.", "Label name/code, batch ID, made/discard date and time, batch weight, preparer initials and allergens. Copy parent label to every service bottle.", "Use small clean bottles, refrigerated or properly iced at the cold target. Never top up or return service leftovers to the main tub.", "Discard at label deadline. If storage control fails, isolate and follow kitchen food-safety procedure. Smell and taste do not prove safety."],
    allergens: ["Egg and mustard. Check all supplier labels for additional allergens such as soy; communicate shared-equipment contact."],
    yieldNotes: ["Formula totals: 500 g / 1,000 g. At 25 g, 20 / 40 portions BEFORE bowl and bottle losses. Record actual usable yield; these are not measured yields."],
  },
  {
    ...common, code: "T1", aliases: [], name: "Caramelized Onion", category: "Preparation Recipes",
    description: "Cooked topping; moisture loss changes weight. Weigh the prepared product at assembly.",
    source: source([3, 5, 11]), linkedPreparationCodes: [],
    presets: [{ key: "original", label: "Original preparation batch" }],
    ingredients: [ingredient("Thinly sliced onion", [500], "raw"), ingredient("Neutral oil", [20], "ingredient"), ingredient("Fine salt", [3], "ingredient"), ingredient("Water", [50], "allocated process water", "Add gradually if sticking; evaporate remaining water at the end.")],
    preparation: ["Weigh the original preparation batch. Record preparation time, final yield, discard time and preparer's name."],
    cooking: ["Heat oil in a 140–160°C pan or griddle; add onion and salt. Stir over low to medium heat for 20–30 minutes until soft and brown.", "If onion sticks, add the allocated 50 g water a little at a time. Evaporate remaining water at the end. Do not use blackened or burnt onion."],
    assembly: [], serving: ["Use 20 g prepared topping per burger; 10 burgers require 200 g PREPARED topping. Use hot immediately or cool rapidly under the storage controls."], delivery: [],
    storage: [cooling, "Store at 0–4°C; house use limit 24 hours. Reheat chilled toppings to 74°C for 15 seconds, reaching this within 2 hours.", "Do not mix a new batch with yesterday's batch. Label preparation time, final yield, discard time and preparer's name.", hygiene],
    allergens: ["No T1-specific allergen declaration is given in the manual. Verify purchased ingredient labels and shared-equipment contact; do not claim allergen-free."],
    yieldNotes: ["Expected final yield approximately 250–300 g, NOT guaranteed or measured. Record actual yield. The 500 g RAW onion input is not 500 g prepared topping."],
  },
];
export const canonicalRecipeCode = value => {
  const code = String(value || "").trim().toUpperCase();
  return RECIPE_PILOT.find(row => row.code === code || row.aliases.includes(code))?.code || null;
};
export const pilotByCode = code => structuredClone(RECIPE_PILOT.find(row => row.code === canonicalRecipeCode(code)) || null);
