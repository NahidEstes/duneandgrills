import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { stockAlertEnvironment, prepareStockAlertFile } from "../scripts/setupStockAlerts.js";
import { pushConfiguration } from "../services/stockAlertPushService.js";

test("setup generates usable VAPID credentials and reuses a deployment's existing identity", () => {
  const settings = stockAlertEnvironment({}, "https://owned-fixture.invalid");
  assert.equal(pushConfiguration(settings).configured, true);
  assert.ok(settings.STOCK_ALERT_WORKER_SECRET.length >= 32);
  assert.notEqual(settings.CRON_SECRET, settings.STOCK_ALERT_WORKER_SECRET);
  assert.deepEqual(stockAlertEnvironment(settings), settings);
  assert.throws(() => stockAlertEnvironment(settings, "https://different-fixture.invalid"), /differs/);
  assert.throws(() => stockAlertEnvironment({ ...settings, STOCK_ALERT_VAPID_PRIVATE_KEY: "broken" }), /Refusing to rotate/);
  assert.throws(() => stockAlertEnvironment({ ...settings, STOCK_ALERT_WORKER_SECRET: "short" }), /at least 32/);
  assert.throws(() => stockAlertEnvironment({ ...settings, CRON_SECRET: settings.STOCK_ALERT_WORKER_SECRET }), /different secrets/);
  assert.throws(() => stockAlertEnvironment({}, "http://insecure-fixture.invalid"), /Provide --subject/);
});

test("setup is idempotent, never overwrites an incomplete file and does not print secrets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dg-stock-alert-setup-"));
  try {
    const file = path.join(directory, ".env.stock-alerts.local");
    const first = await prepareStockAlertFile({ file, subject: "https://owned-fixture.invalid" });
    assert.equal(first.created, true);
    const original = await readFile(file, "utf8"), settings = dotenv.parse(original);
    assert.equal(pushConfiguration(settings).configured, true);
    assert.equal((await prepareStockAlertFile({ file })).created, false);
    assert.equal(await readFile(file, "utf8"), original);
    const cli = spawnSync(process.execPath, ["scripts/setupStockAlerts.js", "--out", file], { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8", windowsHide: true });
    assert.equal(cli.status, 0, cli.stderr);
    for (const value of Object.values(settings)) assert.equal((cli.stdout + cli.stderr).includes(value), false);
    await writeFile(file, "STOCK_ALERT_VAPID_PRIVATE_KEY=do-not-overwrite\n");
    await assert.rejects(prepareStockAlertFile({ file, subject: "https://owned-fixture.invalid" }), /Refusing to rotate/);
    assert.equal(await readFile(file, "utf8"), "STOCK_ALERT_VAPID_PRIVATE_KEY=do-not-overwrite\n");
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("dg-stock-alert-setup-"));
    await rm(directory, { recursive: true, force: true });
  }
});
