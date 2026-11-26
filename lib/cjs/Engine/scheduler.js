"use strict";
// bexx engine — sock.schedule: persistent scheduled-message jobs.
// Jobs are written to a JSON file (default ./.bexx-scheduler.json) so they
// survive process restarts. On attach, due jobs are delivered; offline jobs
// are retried on reconnect.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeScheduler = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
class Scheduler {
 constructor(sock, options = {}) {
 this._sock = sock;
 this._file = options.file ?? node_path_1.join(process.cwd(), ".bexx-scheduler.json");
 this._jobs = new Map();
 this._timers = new Map();
 this._started = false;
 this._load();
 this._tickMs = options.tickMs ?? 1000;
 this._on = null;
 }
 _load() {
  try {
   const raw = node_fs_1.readFileSync(this._file, "utf8");
   const arr = JSON.parse(raw);
   for (const j of arr)
    this._jobs.set(j.id, j);
  }
  catch { /* first run */ }
 }
 _save() {
  const data = JSON.stringify([...this._jobs.values()], null, 2);
  node_fs_1.writeFileSync(this._file, data);
 }
 async _deliver(job) {
  try {
   await this._sock.sendMessage(job.jid, job.message, job.options ?? {});
   this._jobs.delete(job.id);
   this._save();
  }
  catch (err) {
   // keep the job; it will be retried next tick / on reconnect
   this._jobs.get(job.id).attempts = (job.attempts ?? 0) + 1;
   this._save();
  }
 }
 start() {
 if (this._started)
  return;
 this._started = true;
 this._on = this._sock?.ev?.on?.bind(this._sock.ev);
 // deliver due jobs now + when socket is online
 const tryDue = () => {
  const now = Date.now();
  for (const job of this._jobs.values()) {
   if (job.attempts >= (job.maxAttempts ?? 5))
    continue;
   if (job.dueAt <= now)
    void this._deliver(job);
  }
 };
 this._timer = setInterval(tryDue, this._tickMs);
 this._timer.unref?.();
 this._sock?.ev?.on("connection.update", ({ status }) => {
  if (status === "open")
   tryDue(); // retry pending jobs after reconnect
 });
 this._startTimers();
 }
 _startTimers() {
  for (const [id, job] of this._jobs) {
   const delay = Math.max(0, job.dueAt - Date.now());
   this._timers.set(id, setTimeout(() => void this._deliver(job), delay));
   this._timers.get(id).unref?.();
  }
 }
 add(jid, message, options = {}) {
 const when = options.dueAt ?? options.timestamp ?? Date.now() + 60000;
 const id = options.id ?? Math.random().toString(36).slice(2, 10);
 const job = {
  id, jid, message, options: { ...options },
  dueAt: when, createdAt: Date.now(), attempts: 0,
  maxAttempts: options.maxAttempts ?? 5
 };
 delete job.options.dueAt;
 this._jobs.set(id, job);
 this._save();
 this._timers.set(id, setTimeout(() => void this._deliver(job), Math.max(0, when - Date.now())));
 this._timers.get(id).unref?.();
 return job;
 }
 cancel(id) {
 this._jobs.delete(id);
 const t = this._timers.get(id);
 if (t)
  clearTimeout(t);
 this._timers.delete(id);
 this._save();
 return id != null;
 }
 list() {
 return [...this._jobs.values()].map(j => ({
  id: j.id, jid: j.jid, dueAt: j.dueAt, attempts: j.attempts ?? 0,
  createdAt: j.createdAt, maxAttempts: j.maxAttempts
 }));
 }
 clear() {
 this._jobs.clear();
 this._save();
 for (const t of this._timers.values())
  clearTimeout(t);
 this._timers.clear();
 }
 stop() {
 if (this._timer)
  clearInterval(this._timer);
 for (const t of this._timers.values())
  clearTimeout(t);
 this._started = false;
 }
 get size() {
 return this._jobs.size;
 }
}
const makeScheduler = (sock, options) => new Scheduler(sock, options);
exports.makeScheduler = makeScheduler;
