import "dotenv/config";
import mongoose from "mongoose";
import { backfillRecordNumbers } from "../services/recordNumberBackfillService.js";

const args = process.argv.slice(2);
if (args.some(arg => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply");
if (!process.env.MONGO_URI) throw new Error("Set MONGO_URI explicitly for the intended database");
try {
  // No auto-index write in dry-run, including to legacy collections with missing or duplicate IDs.
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const report = await backfillRecordNumbers({ apply: args.includes("--apply") });
  console.log(JSON.stringify(report, null, 2));
  if (report.blocked || (args.includes("--apply") && report.types.some(row => row.remaining))) process.exitCode = 1;
} finally { await mongoose.disconnect(); }
