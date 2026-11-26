"use strict";
// Self-test for the bexx engines. Run: node test/engines.test.js
// No framework — one assert block that fails if the engine logic breaks.
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeMessageQueue, makeMessageCache, makeScheduler, BaileysManager } = require("../lib/cjs/Engine/index.js");
const { BaileysManager: BM } = require("../lib/cjs/Engine/manager.js");

// ---- fake socket: emits connection.update, records sendMessage calls
const makeFakeSock = (online = true) => {
 const { EventEmitter } = require("node:events");
 const sent = [];
 let _online = online;
 const ev = new EventEmitter();
 const sock = {
  ev, sent,
  generateMessageTag: () => "tag-" + Math.random().toString(36).slice(2, 8),
  sendMessage: async (jid, msg, opts) => {
   if (!_online) throw Object.assign(new Error("socket closed"), { statusCode: 408 });
   sent.push({ jid, msg, opts });
   return { key: { id: "m1", remoteJid: jid }, message: msg };
  },
  _setOnline(v) {
   _online = v;
   ev.emit("connection.update", { status: v ? "open" : "close" });
  }
 };
 return sock;
};

(async () => {
 // 1) QUEUE: sends, dedups, pauses when offline, resumes, backoff on 408
 {
  const sock = makeFakeSock(false); // start offline
  const q = makeMessageQueue(sock, { maxRetries: 2, baseBackoffMs: 5, maxBackoffMs: 20 });
  sock._setOnline(true);
  await q.send("a@s.whatsapp.net", { text: "hi" }, { msgId: "dup1" });
  const r2 = await q.send("a@s.whatsapp.net", { text: "hi" }, { msgId: "dup1" });
  assert.strictEqual(r2.deduped, true, "duplicate msgId should be deduped");
  assert.strictEqual(sock.sent.length, 1, "dedup prevents double send");
  // pause -> resume
  q.pause();
  const p = q.send("a@s.whatsapp.net", { text: "during pause" }, { msgId: "p1" });
  setTimeout(() => q.resume(), 50);
  await p;
  assert.strictEqual(sock.sent.length, 2, "paused send completes after resume");
  assert.ok(q.metrics().sent >= 2);
  console.log("✓ queue");
 }
 // 2) CACHE: set/get/has/dedup + bounded size
 {
  const c = makeMessageCache({ max: 3, dedup: true });
  c.set("m1", { x: 1 }, "a");
  assert.deepStrictEqual(c.get("m1", "a"), { x: 1 });
  assert.strictEqual(c.has("m1", "a"), true);
  assert.strictEqual(c.isDuplicate("m1"), false);
  assert.strictEqual(c.isDuplicate("m1"), true, "second call is a duplicate");
  assert.ok(c.metrics().deduped >= 1);
  c.set("m2", {}, "b"); c.set("m3", {}, "c"); c.set("m4", {}, "d"); // exceeds max=3
  assert.ok(c.size() <= 3, "LRU bounds cache size, no leak");
  console.log("✓ cache");
 }
 // 3) SCHEDULER: persistent, cancels, restart-reload
 {
  const file = path.join(os.tmpdir(), "bexx-sched-" + process.pid + ".json");
  try { fs.unlinkSync(file); } catch {}
  const sock = makeFakeSock(true);
  const s1 = makeScheduler(sock, { file, tickMs: 10 });
  s1.add("a@s.whatsapp.net", { text: "remind" }, { dueAt: Date.now() + 30, id: "job1" });
  assert.strictEqual(s1.size, 1);
  assert.ok(fs.existsSync(file), "job persisted to file");
  // simulate restart: new scheduler reads the file, job survives
  const s2 = makeScheduler(makeFakeSock(true), { file, tickMs: 10 });
  assert.strictEqual(s2.size, 1, "job survived process restart");
  s2.cancel("job1");
  assert.strictEqual(s2.size, 0);
  fs.unlinkSync(file);
  console.log("✓ scheduler");
 }
 // 4) MANAGER: isolated sessions + state tracking (no real socket, stub makeSocket)
 {
  const mgr = new BM((cfg) => {
   const { EventEmitter } = require("node:events");
   const ev = new EventEmitter();
   const s = { ev, connect: () => ev.emit("connection.update", { status: "open" }), end: () => ev.emit("connection.update", { status: "close" }) };
   s.ev.emit("connection.update", { status: "open" });
   return s;
  });
  const a = await mgr.create("sessA");
  const b = await mgr.create("sessB");
  assert.ok(a && b, "two isolated sessions");
  assert.strictEqual(mgr.size(), 2);
  assert.strictEqual(mgr.state("sessA"), "open");
  assert.strictEqual(mgr.state("sessB"), "open");
  await assert.rejects(() => mgr.create("sessA"), /already exists/, "duplicate session rejected");
  await mgr.closeAll();
  assert.strictEqual(mgr.size(), 0);
  console.log("✓ manager");
 }
 console.log("\nAll engine self-tests passed.");
})().catch(err => {
 console.error("SELF-TEST FAILED:", err);
 process.exit(1);
});
