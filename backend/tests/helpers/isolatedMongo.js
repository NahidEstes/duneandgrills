import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import mongoose from "mongoose";
import { MongoClient } from "mongodb";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function withIsolatedMongo(work) {
  const directory = await mkdtemp(path.join(tmpdir(), "dg-record-id-test-"));
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.env.MONGOD_BINARY || "mongod", ["--dbpath", directory, "--port", String(port), "--bind_ip", "127.0.0.1", "--replSet", "dgRecordTest", "--logpath", path.join(directory, "mongo.log"), "--quiet"], { windowsHide: true, stdio: "ignore" });
  let spawnError; child.on("error", error => { spawnError = error; });
  let client;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      try { client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 }); await client.connect(); break; }
      catch { await client?.close(); client = null; await delay(200); }
    }
    if (!client) throw new Error("Temporary MongoDB did not start");
    await client.db("admin").command({ replSetInitiate: { _id: "dgRecordTest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let attempt = 0; attempt < 80; attempt++) { if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) break; await delay(200); }
    const uri = `mongodb://127.0.0.1:${port}/dg_record_id_test?replicaSet=dgRecordTest`;
    await mongoose.connect(uri);
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await work({ uri });
  } finally {
    await mongoose.disconnect(); await client?.close();
    if (child.exitCode == null && !spawnError) { const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited; }
    // Only the exact temporary directory created above is removed; no user/database paths.
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("dg-record-id-test-")) await rm(directory, { recursive: true, force: true });
  }
}
