import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

// A fresh ID is compiled into the worker for every build, including manual
// staging builds of uncommitted changes that share a Git SHA.
const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "build", ...process.argv.slice(2)], {
  env: { ...process.env, NEXT_PUBLIC_PWA_BUILD_ID: randomUUID() }, stdio: "inherit", windowsHide: true,
});
child.on("error", () => { process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
