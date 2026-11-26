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
    const sendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = (jid, content, options = {}) => sendMessage(jid, (0, modern_messages_1.prepareModernMessageContent)(content), options);
 // bexx engines — attach as native sock.queue / sock.messages / sock.media / sock.schedule
 const Engine_1 = require("../Engine");
 sock.queue = (0, Engine_1.makeMessageQueue)(sock, newConfig.queue ?? {});
 sock.messages = (0, Engine_1.makeMessageCache)(newConfig.messages ?? {});
 sock.media = (0, Engine_1.makeMediaEngine)(sock, newConfig.media ?? {});
 sock.schedule = (0, Engine_1.makeScheduler)(sock, newConfig.schedule ?? {});
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
