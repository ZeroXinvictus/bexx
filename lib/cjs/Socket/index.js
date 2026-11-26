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
    sock.sendNewsletterStatus = (0, newsletter_status_1.makeNewsletterStatusSender)(sock, newConfig);
    sock.sendNewsletterStatusReaction = (0, newsletter_status_1.makeNewsletterStatusReactionSender)(sock);
    sock.revokeNewsletterStatus = (0, newsletter_status_1.makeNewsletterStatusRevokeSender)(sock);
    sock.getNewsletterStatuses = (0, newsletter_status_1.makeNewsletterStatusFetcher)(sock);
    sock.getNewsletterStatusUpdates = (0, newsletter_status_1.makeNewsletterStatusUpdatesFetcher)(sock);
    return sock;
};
exports.default = makeWASocket;
