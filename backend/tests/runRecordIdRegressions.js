import { spawn } from "node:child_process";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";

const suites = ["posIntegration", "posPhase1Integration", "phase2Integration", "inventoryIntegration", "expenseIntegration", "phase3aIntegration", "phase3bIntegration", "customerCrmIntegration", "authSecurityIntegration"];
await withIsolatedMongo(async ({ uri }) => {
  for (const suite of suites) {
    const testUri = uri.replace("/dg_record_id_test?", `/dg_record_${suite.toLowerCase()}_test?`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/${suite}.js`], { windowsHide: true, stdio: "inherit", env: { ...process.env, MONGO_TEST_URI: testUri, NODE_ENV: "test", ALLOW_NON_TRANSACTIONAL_INVENTORY: "false" } });
      child.on("error", reject); child.on("exit", resolve);
    });
    if (code !== 0) throw new Error(`${suite} failed with exit code ${code}`);
    console.log(`PASS ${suite}`);
  }
});
