"use strict";
// bexx engine — sock.messages: LRU message cache with TTL + duplicate-event
// detection. Wraps the in-memory store so handlers don't re-process the same
// message and memory stays bounded.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessageCache = void 0;
const lru_cache_1 = require("lru-cache");
class MessageCache {
 constructor(options = {}) {
 this._cache = new lru_cache_1.LRUCache({
  max: options.max ?? 5000,
  ttl: options.ttl ?? 10 * 60 * 1000,
  ttlAutopurge: true,
  updateAgeOnGet: true
 });
 this._recentKeys = new lru_cache_1.LRUCache({
  max: options.recentMax ?? 2000,
  ttl: options.recentTtl ?? 2 * 60 * 1000,
  ttlAutopurge: true
 });
 this._dedup = options.dedup !== false;
 this._metrics = { hits: 0, misses: 0, deduped: 0, evicted: 0, stored: 0 };
 }
 key(jid, msgId) {
 return `${jid ?? ""}\u0000${msgId ?? ""}`;
 }
 get(msgId, jid) {
 const k = this.key(jid, msgId);
 const v = this._cache.get(k);
 if (v === undefined) {
  this._metrics.misses += 1;
  return undefined;
 }
 this._metrics.hits += 1;
 return v;
 }
 has(msgId, jid) {
 return this._cache.has(this.key(jid, msgId));
 }
 set(msgId, message, jid) {
 this._cache.set(this.key(jid, msgId), message);
 this._metrics.stored += 1;
 return message;
 }
 delete(msgId, jid) {
 const ok = this._cache.delete(this.key(jid, msgId));
 if (ok)
  this._metrics.evicted += 1;
 return ok;
 }
 // duplicate-event detection: returns true if this msgId was already processed.
 isDuplicate(msgId) {
 if (!this._dedup)
  return false;
 if (this._recentKeys.has(msgId)) {
  this._metrics.deduped += 1;
  return true;
 }
 this._recentKeys.set(msgId, true);
 return false;
 }
 clear() {
 this._cache.clear();
 this._recentKeys.clear();
 }
 size() {
 return this._cache.size;
 }
 metrics() {
 return { ...this._metrics, size: this._cache.size };
 }
}
const makeMessageCache = (options) => new MessageCache(options);
exports.makeMessageCache = makeMessageCache;
