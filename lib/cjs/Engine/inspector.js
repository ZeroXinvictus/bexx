"use strict";
// bexx Protocol Inspector — DevTools-style capture of the WhatsApp protocol layer.
// Hooks outbound at the socket's sendNode (the single choke point that every
// protocol write goes through) and inbound at sock.ev (decoded WAM messages).
// Records are bounded (ring buffer) and redacted by default so credentials and
// crypto material never land in the export.
//
// No dependency — a Map + array + structuredClone is enough.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeProtocolInspector = makeProtocolInspector;
Object.defineProperty(exports, "makeProtocolInspector", { enumerable: true, get: function () { return makeProtocolInspector; } });

const SENSITIVE_ATTRS = new Set([
 "to", "from", "user", "jid", "id", "lid", "pushname", "name",
 "key", "secret", "token", "sig", "s", "mac", "iv", "tag",
 "prekey", "skey", "fingerprint", "deviceid", "device",
]);

const SENSITIVE_KEYS = new Set([
 "keys", "creds", "credentials", "auth", "signal", "mac", "iv", "tag",
 "preKeys", "prekey", "signedPreKey", "signedPreKey", "noiseKey",
 "privateKey", "secret", "token",
]);

const isSensitiveKey = (k) => SENSITIVE_KEYS.has(k) || /key|secret|token|sig|mac|iv$|fingerprint/i.test(k);

function redactNode(node, depth = 0) {
 if (!node || typeof node !== "object") {
 return node;
 }
 if (depth > 4) {
 return node.tag ? { tag: node.tag } : {};
 }
 const out = {};
 if (node.tag) {
 out.tag = node.tag;
 }
 if (node.attrs) {
 out.attrs = {};
 for (const [k, v] of Object.entries(node.attrs)) {
 if (isSensitiveKey(k) || SENSITIVE_ATTRS.has(k)) {
 out.attrs[k] = "[REDACTED]";
 }
 else if (typeof v === "string" && v.length > 200) {
 out.attrs[k] = v.slice(0, 200) + "\u2026";
 }
 else {
 out.attrs[k] = v;
 }
 }
}
 if (node.content) {
 out.content = Array.isArray(node.content)
 ? node.content.map(c => redactNode(c, depth + 1))
 : redactNode(node.content, depth + 1);
 }
 if (node.namespace) {
 out.namespace = node.namespace;
 }
 if (typeof node.size === "number") {
 out.size = node.size;
 }
 if (node.id) {
 out.id = node.id;
 }
 return out;
}

const SIZES = { small: 256, medium: 1024, large: 4096 };

function computeSize(node) {
 try {
 return Buffer.byteLength(JSON.stringify(node));
 }
 catch {
 return 0;
 }
}

function makeProtocolInspector(sock, options = {}) {
 const inspectorRef = options;
 const direction = options.direction ?? "both";
 const namespaces = options.namespaces ?? [];
 const tags = options.tags ?? [];
 const redact = options.redact !== false;
 const maxEvents = options.maxEvents ?? SIZES.medium;
 const clock = options.clock ?? Date.now;

 let enabled = false;
 let seq = 0;
 const events = [];
 const outTimes = new Map();
 let baseline = null;

 const matches = (node) => {
 if (!node || !node.tag) {
 return false;
 }
 if (tags.length > 0 && !tags.includes(node.tag)) {
 return false;
 }
 if (namespaces.length > 0) {
 const ns = node.namespace ?? node.attrs?.xmlns ?? "";
 if (!namespaces.some(n => ns.includes(n))) {
 return false;
 }
 }
 return true;
 };

 const record = (direction2, node) => {
 if (!enabled) {
 return;
 }
 const now = clock();
 const id = node.attrs?.id ?? node.id ?? "";
 let duration = null;
 let correlationId = null;
 if (direction2 === "out") {
 outTimes.set(id, now);
 }
 else {
 const t0 = outTimes.get(id);
 if (t0 != null) {
 duration = now - t0;
 correlationId = id;
 outTimes.delete(id);
 }
}
 const size = computeSize(node);
 const rec = {
 seq: ++seq,
 id,
 direction: direction2,
 timestamp: now,
 tag: node.tag,
 namespace: node.namespace ?? node.attrs?.xmlns ?? "",
 attrs: redact ? redactNode({ attrs: node.attrs }).attrs : { ...node.attrs },
 size,
 duration: duration ?? 0,
 correlationId
 };
 events.push(rec);
 if (events.length > maxEvents) {
 events.shift();
 }
 };

 const origSendNode = sock.sendNode;
 if (origSendNode) {
 sock.sendNode = async (frame, ...rest) => {
 if (direction !== "in" && frame?.tag && matches(frame)) {
 record("out", frame);
 }
 return origSendNode(frame, ...rest);
 };
}

 const evUnsubs = [];
 if (direction !== "out" && sock.ev) {
 const onIn = (event, data) => {
 if (event === "messages.upsert" && data?.messages) {
 for (const m of data.messages) {
 record("in", { tag: "message", attrs: { id: m?.key?.id, type: m?.msgType, jid: m?.key?.remoteJid }, id: m?.key?.id });
 }
 }
 else if (data && data.tag && data.tag !== "message") {
 record("in", { tag: data.tag, attrs: data.attrs, namespace: data.namespace });
 }
 };
 sock.ev.on("client-connection-str", onIn);
 sock.ev.on("wam-event", onIn);
 for (const e of ["messages.upsert", "connection.update", "messages.update"]) {
 sock.ev.on(e, onIn);
 evUnsubs.push(() => sock.ev.off(e, onIn));
 }
}

 const exportLog = () => events.map(r => ({ ...r, attrs: redact ? { ...r.attrs } : r.attrs }));

 const diff = (prev) => {
 const changes = [];
 const map = (n) => {
 const o = {};
 if (!n) {
 return o;
 }
 const walk = (node, path) => {
 if (node.attrs) {
 for (const [k, v] of Object.entries(node.attrs)) {
 o[`${path}.${k}`] = typeof v;
 }
 }
 (node.content ?? []).forEach((c, i) => walk(c, `${path}/${c.tag ?? i}`));
 };
 walk(n, node.tag ?? "root");
 return o;
 };
 const a = map(prev);
 const b = map(baseline ?? {});
 for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
 const av = a[key];
 const bv = b[key];
 if (av !== bv) {
 const status = av === undefined ? "INFO" : bv === undefined ? "WARNING" : "BREAKING";
 changes.push({ field: key, previous: av, current: bv, status });
 }
}
 if (baseline) {
 baseline = b;
 }
 else {
 baseline = b;
 }
 return changes;
 };

 return {
 enable(opts = {}) {
 if (opts.namespaces) {
 inspectorRef.namespaces = opts.namespaces;
 }
 enabled = true;
 return this;
 },
 disable() {
 enabled = false;
 return this;
 },
 isEnabled() {
 return enabled;
 },
 clear() {
 events.length = 0;
 outTimes.clear();
 seq = 0;
 return this;
 },
 export: exportLog,
 diff,
 events: () => events,
 stop() {
 if (origSendNode) {
 sock.sendNode = origSendNode;
 }
 for (const u of evUnsubs) {
 u();
 }
 },
 metrics: () => ({
 events: events.length,
 dropped: seq - events.length,
 enabled,
 size: events.reduce((s, e) => s + (e.size ?? 0), 0)
 })
 };
}
