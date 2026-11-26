"use strict";
// bexx engine — sock.queue: priority message queue with concurrency, rate control,
// connection-aware pause/resume, exponential-backoff retry, duplicate prevention,
// abort, and metrics. Built on p-queue (already a dep) so we don't hand-roll.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessageQueue = void 0;
const node_events_1 = require("node:events");
const PQueue = require("p-queue");
// ponytail: p-queue v9 ships { default, PriorityQueue }. We want the default class.
const PQueueClass = PQueue.default ?? PQueue;
// ponytail: p-queue already does concurrency + concurrency limiter. We only add
// the WA-specific layer on top: connection-aware gating, backoff, dedup, metrics.
class MessageQueue extends node_events_1.EventEmitter {
 constructor(sock, options = {}) {
 super();
 const concurrency = options.concurrency ?? 4;
 const ratePerSecond = options.ratePerSecond ?? null; // null = unlimited
 this._sock = sock;
 this._emitter = new node_events_1.EventEmitter();
 // p-queue gives us concurrency + (via worker) rate control.
 this._queue = new PQueueClass({ concurrency });
 this._rateMs = ratePerSecond ? Math.round(1000 / ratePerSecond) : 0;
 this._lastSend = 0;
 this._paused = false;
 this._online = true;
 this._abort = new Set(); // msgId -> true
 this._inflight = new Map(); // msgId -> promise (dedup)
 this._seen = new Set(); // msgId we already finished (dedup guard)
 this._metrics = {
  submitted: 0, sent: 0, failed: 0, retried: 0, dropped: 0,
  inFlight: 0, queued: 0
 };
 this._maxRetries = options.maxRetries ?? 4;
 this._baseBackoffMs = options.baseBackoffMs ?? 1000;
 this._maxBackoffMs = options.maxBackoffMs ?? 30000;
 // connection-aware: pause when socket drops, auto-resume on open.
 this._sock?.ev?.on("connection.update", ({ status }) => {
  this._online = status === "open";
  if (status === "open" && this._paused)
   this.resume();
  this.emit("connection", { online: this._online });
 });
 }
 // ponytail: one public entry. priority 0 = normal, 1 = high (processed first).
 send(jid, message, options = {}) {
  const id = options.msgId ?? this._sock?.generateMessageTag?.() ?? null;
  if (id && this._seen.has(id)) {
   // duplicate prevention: same msgId already sent -> resolve with cached result
   this._metrics.dropped += 1;
   return this._inflight.get(id) ?? Promise.resolve({ msgId: id, deduped: true });
  }
  this._metrics.submitted += 1;
  this._metrics.queued += 1;
  this.emit("submit", { jid, msgId: id });
  // ponytail: p-queue adds a worker; we gate on connection + abort + rate inside.
  const task = this._queue.add(async () => this._run(jid, message, { ...options, msgId: id }), {
   priority: options.priority ?? 0
  });
  if (id) {
   this._inflight.set(id, task);
   task.finally(() => {
    this._inflight.delete(id);
    this._metrics.queued -= 1;
    this._metrics.inFlight = Math.max(0, this._metrics.inFlight - 1);
   });
  }
  return task;
 }
 _isConnectionError(err) {
  const code = err?.output?.statusCode ?? err?.statusCode ?? err?.code;
  // closed / not-logged-in / socket errors -> wait for reconnect, not a permanent fail
  return code === 408 || code === 401 || /close|not.*open|socket/i.test(String(err?.message ?? err));
 }
 async _run(jid, message, options) {
  this._metrics.inFlight += 1;
  let attempt = 0;
  for (;;) {
   // connection-aware gate
   if (!this._online)
    await this._waitUntilOnline();
   if (this._paused)
    await this._waitUntilResumed();
   if (options.msgId && this._abort.has(options.msgId)) {
    this.emit("abort", { msgId: options.msgId });
    throw new Error(`message ${options.msgId} aborted`);
   }
   if (this._rateMs > 0) {
    const wait = this._lastSend + this._rateMs - Date.now();
    if (wait > 0)
     await new Promise(r => setTimeout(r, wait));
   }
   try {
    const out = await this._sock.sendMessage(jid, message, options);
    this._lastSend = Date.now();
    if (options.msgId)
     this._seen.add(options.msgId);
    this._metrics.sent += 1;
    this.emit("sent", { msgId: options.msgId, jid });
    return out;
   }
   catch (err) {
    attempt += 1;
    if (!this._isConnectionError(err) || attempt > this._maxRetries) {
     if (options.msgId)
      this._seen.delete(options.msgId); // allow re-send later
     this._metrics.failed += 1;
     this.emit("error", { msgId: options.msgId, jid, attempt, error: err });
     throw err;
    }
    // exponential backoff with jitter
    const delay = Math.min(this._maxBackoffMs, this._baseBackoffMs * 2 ** (attempt - 1));
    const jitter = Math.random() * 250;
    this._metrics.retried += 1;
    this.emit("retry", { msgId: options.msgId, jid, attempt, delay });
    await new Promise(r => setTimeout(r, delay + jitter));
   }
  }
 }
 _waitUntilOnline() {
  return new Promise(res => {
   const check = () => {
    if (this._online)
     return res();
    this._sock?.ev?.once("connection.update", ({ status }) => {
     if (status === "open")
      res();
     else
      check();
    });
   };
   check();
  });
 }
 _waitUntilResumed() {
  return new Promise(res => {
   const h = () => {
    if (!this._paused) {
     this._emitter.off("resume", h);
     res();
    }
   };
   this._emitter.on("resume", h);
   if (!this._paused)
    res();
  });
 }
 pause() {
 this._paused = true;
 this.emit("pause");
 }
 resume() {
 this._paused = false;
 this._emitter.emit("resume");
 this.emit("resume");
 }
 abort(msgId) {
 this._abort.add(msgId);
 this.emit("abort-request", { msgId });
 }
 drain() {
 return this._queue.onIdle();
 }
 metrics() {
 return { ...this._metrics, queued: this._queue.size, paused: this._paused, online: this._online };
 }
}
const makeMessageQueue = (sock, options) => new MessageQueue(sock, options);
exports.makeMessageQueue = makeMessageQueue;
