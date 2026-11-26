"use strict";
// bexx Offline Test Harness — deterministic, local testing of bot logic without
// a real WhatsApp connection. Records sock.ev events to NDJSON fixtures and
// replays them back into a fake socket, with controllable network
// (disconnect/reconnect/latency/failure). Not a fake WA server; just a
// replayable event bus so bot behavior is testable deterministically.
//
// No dependency — a fake socket + EventEmitter + a JSONL fixture.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBaileysTestHarness = createBaileysTestHarness;
Object.defineProperty(exports, "createBaileysTestHarness", { enumerable: true, get: function () { return createBaileysTestHarness; } });

const { EventEmitter } = require("node:events");
const fs = require("node:fs");

function createBaileysTestHarness(options = {}) {
 const fake = new EventEmitter();
 const sock = {
 ev: fake,
 ws: { isOpen: true },
 authState: { creds: { me: { id: "test-bot@s.whatsapp.net" } }, keys: {} },
 user: { id: "test-bot@s.whatsapp.net" },
 generateMessageTag: () => "tag-" + Math.random().toString(36).slice(2, 8),
 sendMessage: async () => ({ key: { id: "h-m1", remoteJid: "x@s.whatsapp.net" } }),
 _sent: []
 };
 sock.sendMessage = async (jid, content, opts) => {
 sock._sent.push({ jid, content, opts });
 return { key: { id: "h-m1", remoteJid: jid }, message: content };
};
 let recording = false;
 let fixture = [];
 let recordUnsubs = [];

 const emit = (event, data) => fake.emit(event, data);
 const receive = (event, data) => fake.emit(event, data);

 const recordStart = () => {
 recording = true;
 fixture = [];
};
 const recordStop = () => {
 recording = false;
};
 const RECORD_EVENTS = ["messages.upsert", "messages.update", "connection.update", "groups.update", "chats.upsert", "presence.update", "receipt", "messages.reaction", "appstate.sync", "wam-event"];
 const record = () => {
 recording = true;
 fixture = [];
 const rec = (event) => {
 const h = (data) => {
 if (recording) {
 fixture.push({ event, data, at: Date.now(), seq: fixture.length });
 }
};
 fake.on(event, h);
 recordUnsubs.push(() => fake.off(event, h));
};
 for (const e of RECORD_EVENTS) {
 rec(e);
 }
};

 const saveFixture = (file) => {
 fs.writeFileSync(file, fixture.map(f => JSON.stringify(f)).join("\n"));
 return file;
};

 const loadFixture = (file) => {
 const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
 return lines.map(l => JSON.parse(l));
};

 const replay = (source) => {
 const items = Array.isArray(source) ? source : loadFixture(source);
 let i = 0;
 const step = () => {
 const item = items[i++];
 if (!item) {
 return;
 }
 fake.emit(item.event, item.data);
 if (options.latencyMs) {
 setTimeout(step, options.latencyMs);
 }
 else {
 setImmediate(step);
 }
};
 step();
 return Promise.resolve(items.length);
};

 const expect = (event, predicate) => {
 let seen = null;
 const handler = (data) => {
 seen = data;
 fake.off(event, handler);
 };
 fake.on(event, handler);
 return new Promise((resolve) => {
 const t = setTimeout(() => resolve(false), options.expectTimeoutMs ?? 500);
 fake.once(event, (data) => {
 clearTimeout(t);
 resolve(typeof predicate === "function" ? predicate(data) : true);
});
});
};

 const network = {
 disconnect() {
 sock.ws.isOpen = false;
 fake.emit("connection.update", { connection: "close" });
 },
 reconnect() {
 sock.ws.isOpen = true;
 fake.emit("connection.update", { connection: "open" });
 },
 latency(ms) {
 options.latencyMs = ms;
 }
};

 const reset = () => {
 for (const u of recordUnsubs) {
 u();
 }
 recordUnsubs = [];
 fake.removeAllListeners();
 fixture = [];
 recording = false;
 sock._sent.length = 0;
 sock.ws.isOpen = true;
};

 const fixtureEvents = () => fixture;
 return {
 sock,
 fake,
 emit,
 receive,
 record,
 recordStart,
 recordStop,
 saveFixture,
 loadFixture,
 replay,
 expect,
 network,
 reset,
 fixture: fixtureEvents
 };
}
