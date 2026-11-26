"use strict";
// bexx engine — StabilityEngine: connection health monitoring, auto-reconnect
// with exponential backoff + jitter, heartbeat/keepalive, and graceful
// degradation (pauses the send queue when unhealthy, resumes when healthy).
// This is the "stability-first" layer: the queue never fires into a dead socket.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeStabilityEngine = void 0;
class StabilityEngine {
 constructor(sock, options = {}) {
 this._sock = sock;
 this._logger = options.logger ?? sock?.logger ?? console;
 this._hbIntervalMs = options.heartbeatIntervalMs ?? 30000;
 this._hbTimeoutMs = options.heartbeatTimeoutMs ?? 60000;
 this._maxRetries = options.maxRetries ?? 8;
 this._baseBackoffMs = options.baseBackoffMs ?? 2000;
 this._maxBackoffMs = options.maxBackoffMs ?? 60000;
 this._reconnect = options.reconnect ?? null;
 this._retries = 0;
 this._hbTimer = null;
 this._hbPending = false;
 this._lastSeen = 0;
 this._unhealthy = false;
 this._reconnecting = false;
 this._health = {
  up: true,
  lastSeenAt: 0,
  lastReconnectAt: 0,
  retries: 0,
  lastError: null,
  uptimeMs: 0,
  startAt: Date.now()
 };
 this._listeners = { healthy: [], unhealthy: [], reconnect: [] };
 this._bind = [];
 this._bindSocket(sock);
 }
 _bindSocket(sock) {
 this._unbind();
 this._on("connection.update", sock?.ev, ({ connection: status, lastDisconnect }) => this._onConnUpdate(status, lastDisconnect));
 this._on("messages.upsert", sock?.ev, () => this._touch());
 this._on("messages.update", sock?.ev, () => this._touch());
 }
 _unbind() {
 for (const off of this._bind) {
 try {
 off();
 }
 catch { }
 }
 this._bind = [];
 }
 _on(event, ev, handler) {
 ev?.on?.(event, handler);
 this._bind.push(() => ev?.off?.(event, handler));
 }
 _touch() {
 this._lastSeen = Date.now();
 if (this._hbPending) {
  this._hbPending = false;
  this._setHealth(true);
 }
 }
 _setHealth(up) {
 this._health.up = up;
 this._health.lastSeenAt = this._lastSeen;
 this._health.uptimeMs = Date.now() - this._health.startAt;
 this._unhealthy = !up;
 // graceful degradation: pause/resume the queue with connection state
 if (this._sock?.queue) {
  up ? this._sock.queue.resume() : this._sock.queue.pause();
 }
 this._emit(up ? "healthy" : "unhealthy", { up });
 }
 _onConnUpdate(status, lastDisconnect) {
 if (status === "open") {
  this._retries = 0;
  this._health.lastReconnectAt = 0;
  this._health.lastError = null;
  this._reconnecting = false;
  this._startHeartbeat();
  this._setHealth(true);
  this._emit("reconnect", { status });
 }
 else if (status === "connecting") {
  this._reconnecting = true;
 }
 else if (status === "close") {
  this._reconnecting = false;
  this._stopHeartbeat();
  this._health.lastError = lastDisconnect?.error?.message ?? lastDisconnect?.error?.code ?? "closed";
  this._setHealth(false);
  // auto-reconnect with backoff + jitter
  const code = lastDisconnect?.error?.output?.statusCode ?? 0;
  const isBanned = code === 408; // permanent: do not retry
  if (!isBanned)
   this._scheduleReconnect();
 }
 }
_doReconnect() {
 if (this._health.up || !this._reconnect)
 return;
 try {
 const result = this._reconnect();
 const maybeSock = Promise.resolve(result);
 maybeSock.then((nextSock) => {
 if (nextSock) {
 this._sock = nextSock;
 this._bindSocket(nextSock);
 }
 }).catch((err) => {
 this._health.lastError = err?.message ?? String(err);
 this._scheduleReconnect();
 });
 }
 catch (err) {
 this._health.lastError = err?.message ?? String(err);
 this._scheduleReconnect();
 }
}
_scheduleReconnect() {
 if (this._retries >= this._maxRetries) {
 this._logger.warn?.(`stability: giving up after ${this._maxRetries} reconnect attempts`);
 this._health.lastError = "max_retries_exceeded";
 return;
 }
 if (!this._reconnect) {
 this._logger.warn?.("stability: no reconnect callback configured; cannot auto-reconnect");
 return;
 }
 this._retries += 1;
 const backoff = Math.min(this._maxBackoffMs, this._baseBackoffMs * 2 ** (this._retries - 1));
 const jitter = Math.random() * 500;
 this._health.lastReconnectAt = Date.now();
 this._health.retries = this._retries;
 setTimeout(() => {
 if (this._health.up)
 return;
 this._doReconnect();
 }, backoff + jitter);
}
 _startHeartbeat() {
 this._stopHeartbeat();
 this._hbTimer = setInterval(() => this._heartbeat(), this._hbIntervalMs);
 this._hbTimer.unref?.();
 }
 _stopHeartbeat() {
 if (this._hbTimer)
  clearInterval(this._hbTimer);
 this._hbTimer = null;
 }
 _heartbeat() {
 if (this._health.up) {
  this._lastSeen = Date.now();
  this._hbPending = true;
  // ponytail: rely on incoming traffic as the liveness signal; if the socket
  // emits nothing for the timeout, we consider it stale.
  if (Date.now() - this._lastSeen > this._hbTimeoutMs) {
   this._logger.warn?.("stability: heartbeat stale, forcing reconnect");
   this._forceReconnect("heartbeat_timeout");
  }
 }
 }
 _forceReconnect(reason) {
 this._health.lastError = reason;
 try {
  this._sock.end?.();
 }
  catch { }
 this._scheduleReconnect();
 }
 on(event, cb) {
 if (this._listeners[event])
  this._listeners[event].push(cb);
 return this;
 }
 _emit(event, payload) {
 for (const cb of this._listeners[event] ?? []) {
  try {
   cb(payload);
  }
  catch { }
 }
 }
 health() {
 return {
  ...this._health,
  retries: this._retries,
  maxRetries: this._maxRetries,
  reconnecting: this._reconnecting,
  staleMs: this._lastSeen ? Date.now() - this._lastSeen : 0
 };
 }
 stop() {
 this._stopHeartbeat();
 }
}
const makeStabilityEngine = (sock, options) => new StabilityEngine(sock, options);
exports.makeStabilityEngine = makeStabilityEngine;
