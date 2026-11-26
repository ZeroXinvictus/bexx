"use strict";
// bexx engine — BaileysManager: run many WhatsApp sessions in one process with
// per-session auth isolation, auto-reconnect, backoff, and state tracking.
// ponytail: thin lifecycle wrapper — no "resource monitoring / health scoring"
// (YAGNI). Reconnect + per-session error isolation is the real value.
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaileysManager = void 0;
const node_path_1 = require("node:path");
class BaileysManager {
 constructor(makeSocket, options = {}) {
 this._makeSocket = makeSocket;
 this._sessions = new Map(); // id -> { sock, state, auth, retries }
 this._authDir = options.authDir ?? ".bexx-sessions";
 this._maxRetries = options.maxRetries ?? 5;
 this._baseBackoffMs = options.baseBackoffMs ?? 2000;
 this._logger = options.logger;
 }
 async create(sessionId, config = {}) {
 if (this._sessions.has(sessionId))
  throw new Error(`session ${sessionId} already exists`);
 const authDir = node_path_1.join(this._authDir, sessionId);
 // per-session auth isolation: use the real auth state if available, else in-memory
 let auth;
 try {
  const authUtils = await import("../Utils/use-multi-file-auth-state.js");
  auth = await authUtils.useMultiFileAuthState(node_path_1.join(this._authDir, sessionId), this._logger);
 }
 catch {
  auth = null;
 }
 if (!auth)
  auth = {
   creds: {},
   keys: new Map(),
   transaction: async fn => fn()
  };
 const sock = await this._makeSocket({
  authStrategy: auth,
  logger: this._logger,
  ...config
 });
 const entry = {
  sock,
  state: "connecting",
  retries: 0,
  lastDisconnect: null,
  listeners: []
 };
 sock.ev.on("connection.update", ({ status, lastDisconnect }) => {
  entry.state = status;
  entry.lastDisconnect = lastDisconnect;
  if (status === "close") {
   const code = lastDisconnect?.error?.output?.statusCode ?? 0;
   const shouldReconnect = code !== 408;
   if (shouldReconnect && entry.retries < this._maxRetries) {
    entry.retries += 1;
    const backoff = Math.min(60000, this._baseBackoffMs * 2 ** (entry.retries - 1));
    this._logger?.debug?.({ sessionId, backoff }, "scheduling reconnect");
    setTimeout(() => entry.state !== "closed" && entry.sock.connect?.(), backoff);
   }
   else if (!shouldReconnect)
    entry.state = "closed";
  }
  else if (status === "open")
   entry.retries = 0;
 });
 this._sessions.set(sessionId, entry);
 sock.connect?.();
 return entry.sock;
 }
 get(sessionId) {
 return this._sessions.get(sessionId)?.sock;
 }
 state(sessionId) {
 return this._sessions.get(sessionId)?.state;
 }
 states() {
 return [...this._sessions.entries()].reduce((acc, [id, e]) => {
  acc[id] = e.state;
  return acc;
 }, {});
 }
 async close(sessionId) {
 const entry = this._sessions.get(sessionId);
 if (!entry)
  return;
 entry.state = "closed";
 entry.sock.end?.();
 this._sessions.delete(sessionId);
 }
 async closeAll() {
 for (const id of [...this._sessions.keys()])
  await this.close(id);
 }
 has(sessionId) {
 return this._sessions.has(sessionId);
 }
 size() {
 return this._sessions.size;
 }
}
exports.BaileysManager = BaileysManager;
