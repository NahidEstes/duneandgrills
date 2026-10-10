import mongoose from "mongoose";
import User from "../models/User.js";
import { importRecipeManual } from "../services/recipeInstructionImportService.js";

// Deliberately no dotenv/config, no deployment/local Downloads PDF dependency.
const args = process.argv.slice(2);
if (args.some(arg => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply");
const uri = process.env.RECIPE_IMPORT_MONGO_URI, actorId = process.env.RECIPE_IMPORT_ACTOR_ID;
if (!uri || !mongoose.isObjectIdOrHexString(actorId)) throw new Error("Explicit RECIPE_IMPORT_MONGO_URI and existing authorized RECIPE_IMPORT_ACTOR_ID are required; .env is not loaded.");
// This phase authorizes local rehearsal only. Remote/production import needs separate review.
const host = /^mongodb:\/\/([^/]+)\/([^?]+)/.exec(uri);
if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host[1]) || !/^dg_recipe_(test|rehearsal)(_[a-z0-9]+)?$/.test(host[2])) throw new Error("Only explicitly named local dg_recipe_test / dg_recipe_rehearsal databases are allowed. Remote/production import is disabled.");
try {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const actor = await User.findById(actorId);
  if (!actor || actor.isActive === false) throw new Error("Active authorized actor required");
  // Replica-set transactions and existing unique indexes are prerequisites; no index/migration writes here.
  if (args.includes("--apply")) {
    for (const [collection, keys] of [["recipeinstructions", { code: 1 }], ["recipeinstructionrevisions", { code: 1, revision: 1 }], ["recipeinstructionrevisions", { code: 1, requestKey: 1 }]]) {
      const indexes = await mongoose.connection.db.collection(collection).indexes();
      if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(keys))) throw new Error(`Required unique index missing on ${collection}. Stop and request index approval; importer does not create indexes.`);
    }
  }
  const report = await importRecipeManual({ actor, apply: args.includes("--apply") });
  console.log(JSON.stringify(report, null, 2)); if (report.conflicts) process.exitCode = 1;
} finally { await mongoose.disconnect(); }
