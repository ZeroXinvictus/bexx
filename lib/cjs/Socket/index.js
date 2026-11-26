"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Defaults_1 = require("../Defaults");
const communities_1 = require("./communities");
const newsletter_status_1 = require("../Utils/newsletter-status");
const modern_messages_1 = require("../Utils/modern-messages");
const makeWASocket = (config) => {
    const newConfig = {
        ...Defaults_1.DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = (0, communities_1.makeCommunitiesSocket)(newConfig);
const originalSendMessage = sock.sendMessage.bind(sock);
 sock._originalSendMessage = originalSendMessage;
 sock.sendMessage = (jid, content, options = {}) => {
 // ponytail: media messages arrive as prepared protos (e.g. {imageMessage:{...}})
 // after going through the media engine's _prepare. prepareModernMessageContent
 // would strip them, so pass them through untouched.
 if (content && typeof content === "object" && !Array.isArray(content) && Object.keys(content).some(k => k.endsWith("Message") && content[k])) {
 return originalSendMessage(jid, content, options);
 }
 return originalSendMessage(jid, (0, modern_messages_1.prepareModernMessageContent)(content), options);
 };
 // bexx engines — attach as native sock.queue / sock.messages / sock.media / sock.schedule
 const Engine_1 = require("../Engine");
 sock.queue = (0, Engine_1.makeMessageQueue)(sock, newConfig.queue ?? {});
 sock.messages = (0, Engine_1.makeMessageCache)(newConfig.messages ?? {});
 sock.media = (0, Engine_1.makeMediaEngine)(sock, newConfig.media ?? {});
 sock.schedule = (0, Engine_1.makeScheduler)(sock, newConfig.schedule ?? {});
 sock.inspector = (0, Engine_1.makeProtocolInspector)(sock, newConfig.inspector ?? {});
 sock.doctor = require("../Engine/doctor.js").makeSessionDoctor(sock, newConfig.doctor ?? {});
 sock.rich = require("../Engine/rich.js").makeRichEngine(sock, newConfig.rich ?? {});
 sock.audioSticker = require("../Engine/audio-sticker.js").makeAudioStickerEngine(sock, newConfig.audioSticker ?? {});
sock.msg = require("../Engine/message-builder.js").makeMessageBuilderEngine(sock, newConfig.msg ?? {});
 // stability: connection watchdog — auto-reconnect w/ backoff, heartbeat,
 // graceful degradation (pauses sock.queue when unhealthy, resumes when healthy)
 // reconnect builds a fresh socket from the same config and returns it so the
 // engine can rebind its listeners onto the new socket (the old event buffer is
 // destroyed on end()).
 sock.stability = require("../Engine/stability").makeStabilityEngine(sock, {
 ...newConfig.stability,
 reconnect: () => makeWASocket({ ...newConfig, auth: newConfig.auth })
 });
 // auto-dedup flag on inbound upsert: mark messages already seen so handlers can skip
 sock.ev.on("messages.upsert", (payload) => {
  const msgs = payload?.messages ?? [];
  for (const m of msgs) {
   if (m?.key?.id && sock.messages.isDuplicate(m.key.id))
    m._bexxDuplicate = true;
  }
 });
    sock.sendNewsletterStatus = (0, newsletter_status_1.makeNewsletterStatusSender)(sock, newConfig);
    sock.sendNewsletterStatusReaction = (0, newsletter_status_1.makeNewsletterStatusReactionSender)(sock);
    sock.revokeNewsletterStatus = (0, newsletter_status_1.makeNewsletterStatusRevokeSender)(sock);
    sock.getNewsletterStatuses = (0, newsletter_status_1.makeNewsletterStatusFetcher)(sock);
    sock.getNewsletterStatusUpdates = (0, newsletter_status_1.makeNewsletterStatusUpdatesFetcher)(sock);
    return sock;
};
exports.default = makeWASocket;
