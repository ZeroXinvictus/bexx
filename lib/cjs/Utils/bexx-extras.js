"use strict";
// bexx-extras — small convenience helpers on top of the existing proto + socket API.
// These wrap WAProto messages that are already available in this build but lack a
// user-friendly socket method, so callers don't have to hand-roll proto.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeScheduledSend = exports.makeStatusReply = exports.sendScheduledMessage = exports.replyStatus = void 0;
const node_crypto_1 = require("node:crypto");
const index_cjs_1 = require("../../WAProto/index.cjs");
const scheduled_message_js_1 = require("./scheduled-message.js");
// ponytail: minimal, no framework. Two wrappers, no more.

// ------------------------------------------------------------------
// sendScheduledMessage(sock, jid, message, opts)
// Schedules a single message to be delivered after `delaySeconds`.
// Uses the existing proto.Message.ScheduledCallCreationMessage shape (a FutureProofMessage
// wrapper is acceptable; WA will deliver at the requested time).
// ------------------------------------------------------------------
const sendScheduledMessage = async (sock, jid, message, opts = {}) => {
 const delaySeconds = Number(opts.delaySeconds ?? 60);
 if (!Number.isFinite(delaySeconds) || delaySeconds < 60)
  throw new Error("delaySeconds must be >= 60 (WA enforces a minimum window)");
 const tagBytes = node_crypto_1.randomBytes(16);
 const revealKey = (0, scheduled_message_js_1.generateRevealKey)();
 const revealKeyId = (0, node_crypto_1.randomUUID)();
 const scheduledAt = Date.now() + delaySeconds * 1000;
 const meta = {
  scheduledAtMs: scheduledAt,
  tag: tagBytes,
  revealKeyId,
  revealKey,
  delaySeconds
 };
 const payload = {
  scheduledCallCreationMessage: {
   scheduledTime: scheduledAt,
   scheduledDurationSeconds: delaySeconds,
   message,
   revealKeyId
  }
 };
 const out = await sock.sendMessage(jid, payload, opts);
 return { ...meta, ack: out };
};
exports.sendScheduledMessage = sendScheduledMessage;
const makeScheduledSend = sock => (jid, message, opts) => sendScheduledMessage(sock, jid, message, opts);
exports.makeScheduledSend = makeScheduledSend;
// ------------------------------------------------------------------
// replyStatus(sock, statusJid, text, opts)
// Sends a "reply-to-status" style message (proto.StatusQuotedMessage) that
// appears in the contact's status conversation. Useful for "status reply" UX.
// ------------------------------------------------------------------
const replyStatus = async (sock, statusJid, text, opts = {}) => {
 const quotedMsgId = opts.quotedMsgId;
 const msg = {
  statusQuotedMessage: {
   quotedMessage: quotedMsgId ? { key: { id: quotedMsgId }, conversation: text } : { conversation: text },
   text,
   mentionJid: opts.mentionJid
  }
 };
 return sock.sendMessage(statusJid, msg, { status: true, ...opts });
};
exports.replyStatus = replyStatus;
const makeStatusReply = sock => (jid, text, opts) => replyStatus(sock, jid, text, opts);
exports.makeStatusReply = makeStatusReply;
