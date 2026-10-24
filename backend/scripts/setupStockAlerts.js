import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import webpush from "web-push";
import { pushConfiguration } from "../services/stockAlertPushService.js";

const names = ["STOCK_ALERT_WORKER_SECRET", "CRON_SECRET", "STOCK_ALERT_VAPID_PUBLIC_KEY", "STOCK_ALERT_VAPID_PRIVATE_KEY", "STOCK_ALERT_VAPID_SUBJECT"];
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function stockAlertEnvironment(existing = {}, subject) {
  const env = Object.fromEntries(names.filter(name => existing[name]).map(name => [name, existing[name]]));
  if (subject && env.STOCK_ALERT_VAPID_SUBJECT && subject !== env.STOCK_ALERT_VAPID_SUBJECT) throw Error("Existing push subject differs. Use a separate environment file for a different deployment.");
  env.STOCK_ALERT_VAPID_SUBJECT ||= subject;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(env.STOCK_ALERT_VAPID_SUBJECT || "")) throw Error("Provide --subject with this deployment's HTTPS site URL or a monitored mailto: contact.");
  for (const name of ["STOCK_ALERT_WORKER_SECRET", "CRON_SECRET"]) {
    env[name] ||= randomBytes(48).toString("base64url");
    if (!/^[A-Za-z0-9_-]{32,}$/.test(env[name])) throw Error(`${name} must be a stable random secret of at least 32 URL-safe characters.`);
  }
  if (env.CRON_SECRET === env.STOCK_ALERT_WORKER_SECRET) throw Error("Use different secrets for Vercel Cron and the external POST worker.");
  if (!env.STOCK_ALERT_VAPID_PUBLIC_KEY && !env.STOCK_ALERT_VAPID_PRIVATE_KEY) {
    const keys = webpush.generateVAPIDKeys();
    env.STOCK_ALERT_VAPID_PUBLIC_KEY = keys.publicKey;
    env.STOCK_ALERT_VAPID_PRIVATE_KEY = keys.privateKey;
  }
  if (!pushConfiguration(env).configured) throw Error("Existing VAPID key pair is incomplete or invalid. Refusing to rotate it automatically.");
  return env;
}

export async function prepareStockAlertFile({ file = path.join(backendRoot, ".env.stock-alerts.local"), subject } = {}) {
  file = path.resolve(file);
  let original;
  try { original = await readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const existing = original === undefined ? {} : dotenv.parse(original);
  const env = stockAlertEnvironment(existing, subject);
  if (original !== undefined) {
    // A rerun must neither rotate a subscribed deployment's keys nor overwrite
    // another process's configuration. An incomplete file needs operator review.
    if (names.some(name => existing[name] !== env[name])) throw Error("Existing environment file is incomplete. Refusing to overwrite it; review its missing settings first.");
    return { file, created: false };
  }
  const content = "# Private Stock Alerts settings. Never commit or share this file.\n" + names.map(name => `${name}=${JSON.stringify(env[name])}`).join("\n") + "\n";
  await writeFile(file, content, { flag: "wx", mode: 0o600 });
  return { file, created: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { subject: { type: "string" }, out: { type: "string" } } });
    const result = await prepareStockAlertFile({ subject: values.subject, file: values.out });
    console.log(`${result.created ? "Created private settings" : "Reused existing settings without changing keys"}: ${result.file}`);
    console.log("No secrets were printed. Hosting configuration, database migration and scheduler activation are still required.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
