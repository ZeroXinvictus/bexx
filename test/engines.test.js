"use strict";
// Self-test for the bexx engines. Run: node test/engines.test.js
// No framework — one assert block that fails if the engine logic breaks.
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
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
   ev.emit("connection.update", { connection: v ? "open" : "close" });
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
   const s = { ev, connect: () => ev.emit("connection.update", { connection: "open" }), end: () => ev.emit("connection.update", { connection: "close" }) };
   s.ev.emit("connection.update", { connection: "open" });
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
  // 5) MEDIA: auto-detect source + MIME (via mime-types) + type routing
{
 const { makeMediaEngine } = require("../lib/cjs/Engine/media.js");
 const media = makeMediaEngine({ sendMessage: async () => ({ ok: 1 }), waUploadToServer: async () => ({}) });
 const assert2 = (cond, msg) => { if (!cond) throw new Error(msg); };
 for (const [src, expectMime, expectRoute] of [
  ["https://x.co/v.mp4", "video/mp4", "video"],
  ["https://x.co/s.webp", "image/webp", "sticker"],
  ["https://x.co/a.mp3", "audio/mpeg", "audio"],
  ["https://x.co/d.pdf", "application/pdf", "document"],
  ["https://x.co/p.png", "image/png", "image"]
 ]) {
  const r = await media.resolveSource(src);
  assert2(r.mimetype === expectMime, "mime for "+src+" = "+r.mimetype+", expected "+expectMime);
  assert2(media._route(r.mimetype) === expectRoute, "route for "+src+" = "+media._route(r.mimetype));
 }
 console.log("✓ media (mime-types routing)");
}
// 6) STABILITY: auto-reconnect (via reconnect callback) + graceful degradation
{
 const { makeStabilityEngine } = require("../lib/cjs/Engine/stability.js");
 const ev = new EventEmitter();
 let paused = false, resumed = false;
 const sock = {
 ev,
 queue: { pause: () => (paused = true), resume: () => (resumed = true) }
 };
 const ev2 = new EventEmitter();
 const sock2 = { ev: ev2, queue: sock.queue };
 const st = makeStabilityEngine(sock, {
 heartbeatIntervalMs: 50, heartbeatTimeoutMs: 200, baseBackoffMs: 10, maxRetries: 3,
 reconnect: () => sock2
 });
 assert.strictEqual(st.health().up, true, "starts healthy");
 ev.emit("connection.update", { connection: "open" });
 await new Promise(r => setTimeout(r, 20));
 assert.strictEqual(st.health().up, true, "open => healthy (marks everOpened)");
 ev.emit("connection.update", { connection: "close" });
 await new Promise(r => setTimeout(r, 40));
 assert.strictEqual(st.health().up, false, "close => unhealthy");
 assert.strictEqual(paused, true, "queue auto-paused when unhealthy");
 await new Promise(r => setTimeout(r, 600));
 ev2.emit("connection.update", { connection: "open" });
 await new Promise(r => setTimeout(r, 600));
 assert.strictEqual(st.health().up, true, "reconnect to new socket => healthy");
 assert.strictEqual(resumed, true, "queue auto-resumed when healthy");
 assert.strictEqual(st._sock, sock2, "engine rebound to the new socket");
 st.stop();
 console.log("✓ stability (auto-reconnect + graceful degradation)");
 }
 // 6b) STABILITY: fresh session (never opened) does NOT auto-reconnect (anti-spam pairing)
 {
 const { makeStabilityEngine } = require("../lib/cjs/Engine/stability.js");
 const ev = new EventEmitter();
 const sock = { ev };
 let reconnects = 0;
 const st = makeStabilityEngine(sock, { baseBackoffMs: 10, maxRetries: 3, reconnect: () => { reconnects++; return { ev: new EventEmitter() }; } });
 ev.emit("connection.update", { connection: "close", lastDisconnect: {} });
 await new Promise(r => setTimeout(r, 60));
 assert.strictEqual(reconnects, 0, "fresh session (never opened) does not auto-reconnect - prevents pairing spam");
 assert.strictEqual(st._health.lastError, "pairing_pending_no_reconnect");
 st.stop();
 console.log("✓ stability (no reconnect on fresh pairing, anti-spam)");
}
 // 7) PROTOCOL INSPECTOR: records outbound nodes, redacts secrets, bounded export
 {
 const { makeProtocolInspector } = require("../lib/cjs/Engine/inspector.js");
 const { EventEmitter } = require("node:events");
 const sent = [];
 const sock = {
 ev: new EventEmitter(),
 sendNode: async (node) => {
 sent.push(node);
 return node;
 }
};
 const ins = makeProtocolInspector(sock, { maxEvents: 8 });
 ins.enable();
 await sock.sendNode({ tag: "iq", attrs: { id: "q1", to: "secret@s.whatsapp.net", secret: "TOP" }, content: [{ tag: "digest" }] });
 const evts = ins.events();
 assert.strictEqual(evts.length, 1, "recorded one outbound node");
 assert.strictEqual(evts[0].id, "q1", "captured correlation id");
 assert.strictEqual(evts[0].attrs.to, "[REDACTED]", "redacted `to` attr");
 assert.strictEqual(evts[0].attrs.secret, "[REDACTED]", "redacted `secret` attr");
 const m = ins.metrics();
 assert.ok(m.events >= 1 && m.dropped >= 0, "metrics report events + dropped");
 ins.stop();
 console.log("✓ inspector (outbound capture + redaction + bounded)");
}
 // 8) SESSION DOCTOR: unpaired socket => REAUTH/CORRUPTED, refuses unsafe wipe
 {
 const { makeSessionDoctor } = require("../lib/cjs/Engine/doctor.js");
 const sock = {
 authState: { creds: { me: undefined }, keys: {} },
 ws: { isOpen: false }
};
 const doc = makeSessionDoctor(sock);
 const d = await doc.check();
 assert.ok(["REAUTH_REQUIRED", "CORRUPTED"].includes(d.status), "unpaired => reauth/corrupt: " + d.status);
 const r = await doc.repair();
 assert.strictEqual(r.repaired, false, "doctor must not auto-repair an unpaired session");
 assert.strictEqual(r.code, "SESSION_REAUTH_REQUIRED", "reports re-auth instead of wiping auth");
 // healthy socket
 const good = makeSessionDoctor({
 authState: { creds: { me: { id: "me@s.whatsapp.net" } }, keys: { preKeys: [1], signedPreKey: [1], sessions: [{ a: 1 }], senderKeys: [{ a: 1 }], appStateSyncKeys: [{ a: 1 }] } },
 ws: { isOpen: true },
 stability: { health: () => ({ up: true }) }
});
 const gd = await good.check();
 assert.strictEqual(gd.status, "HEALTHY", "full creds + open socket => healthy");
 assert.strictEqual((await good.repair()).repaired, false, "healthy => nothing to repair");
 console.log("✓ doctor (diagnose + safe-refusal on unpaired, healthy detection)");
}
 // 9) OFFLINE TEST HARNESS: record -> save -> replay is deterministic
 {
 const { createBaileysTestHarness } = require("../lib/cjs/Engine/harness.js");
 const t = createBaileysTestHarness({ expectTimeoutMs: 200 });
 t.record();
 t.emit("messages.upsert", { messages: [{ key: { id: "a" } }, { key: { id: "b" } }] });
 t.emit("connection.update", { connection: "open" });
 const file = "/tmp/bexx-harness-test.ndjson";
 t.saveFixture(file);
 const lines = require("node:fs").readFileSync(file, "utf8").trim().split("\n");
 assert.strictEqual(lines.length, 2, "recorded two events to NDJSON");
 t.reset();
 let ups = 0;
 t.fake.on("messages.upsert", (p) => {
 if (p?.messages?.length === 2) {
 ups += 1;
 }
});
 await t.replay(file);
 assert.strictEqual(ups, 1, "replayed the upsert fixture deterministically");
 t.network.disconnect();
 assert.strictEqual(t.sock.ws.isOpen, false, "network.disconnect flips socket");
 t.network.reconnect();
 assert.strictEqual(t.sock.ws.isOpen, true, "network.reconnect restores socket");
 console.log("✓ harness (record/save/replay + network simulation)");
}
// 10) RICH ENGINE: builders produce valid richResponseMessage payload
{
const { makeRichEngine } = require("../lib/cjs/Engine/rich.js");
const rich = makeRichEngine(null);
const card = rich.card({
text: "halo **bold** + [link](https://wa.me) + $E=mc^2$",
image: "https://mmg.whatsapp.net/f/fxYwZQ",
footer: [{ label: "Detail", type: "OPEN_URL", url: "https://wa.me" }],
suggestions: ["coba ini", "coba itu"],
title: "Rich Demo"
});
assert.ok(card.text, "card has text");
assert.ok(card.image, "card has image");
assert.ok(card.footer, "card has footer");
const built = await rich.build(card);
assert.ok(built.botForwardedMessage, "build produces botForwardedMessage");
assert.ok(built.botForwardedMessage.message.richResponseMessage, "has richResponseMessage");
const sub = built.botForwardedMessage.message.richResponseMessage.submessages;
assert.ok(sub.length >= 2, `has submessages (got ${sub.length})`);
console.log("✓ rich (builders → valid richResponseMessage)");
}
console.log("\nAll engine self-tests passed.");
})().catch(err => {
 console.error("SELF-TEST FAILED:", err);
 process.exit(1);
});
