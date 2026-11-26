Object.defineProperty(exports, "__esModule", { value: true });
exports.isScheduledTimeValid = exports.buildUnscheduleProtocolMessage = exports.buildScheduledMsgMetaNode = exports.decodeScheduledMessage = exports.encodeScheduledMessage = exports.buildConditionalRevealMessage = exports.decryptWithRevealKey = exports.encryptWithRevealKey = exports.generateRevealKeyId = exports.generateRevealKey = exports.SCHEDULED_MSG_WINDOW = exports.SCHEDULED_MSG_TAG_BYTES = exports.SCHEDULED_MSG_REVEAL_KEY_RETENTION_DAYS = exports.SCHEDULED_MSG_REVEAL_KEY_IV_BYTES = exports.SCHEDULED_MSG_REVEAL_KEY_BYTES = exports.SCHEDULED_MSG_RESOURCE_LIMIT_NACK_CODE = exports.SCHEDULED_MSG_MAX_MEDIA = exports.SCHEDULED_MSG_MAX_PER_CHAT = exports.SCHEDULED_MSG_META_TYPE = void 0;
const crypto_1 = require("crypto");
const index_js_1 = require("../../WAProto/index.cjs");
exports.SCHEDULED_MSG_META_TYPE = 'scheduled_message';
exports.SCHEDULED_MSG_MAX_PER_CHAT = 30;
exports.SCHEDULED_MSG_MAX_MEDIA = 1;
exports.SCHEDULED_MSG_RESOURCE_LIMIT_NACK_CODE = 419;
exports.SCHEDULED_MSG_REVEAL_KEY_BYTES = 32;
exports.SCHEDULED_MSG_REVEAL_KEY_IV_BYTES = 12;
exports.SCHEDULED_MSG_REVEAL_KEY_RETENTION_DAYS = 30;
exports.SCHEDULED_MSG_TAG_BYTES = 16;
exports.SCHEDULED_MSG_WINDOW = Object.freeze({
    chat: { minSeconds: 600, maxSeconds: 1209600 },
    newsletter: { minSeconds: 600, maxSeconds: 2592000 }
});
const generateRevealKey = () => (0, crypto_1.randomBytes)(exports.SCHEDULED_MSG_REVEAL_KEY_BYTES);
exports.generateRevealKey = generateRevealKey;
const generateRevealKeyId = () => (0, crypto_1.randomUUID)();
exports.generateRevealKeyId = generateRevealKeyId;
const encryptWithRevealKey = (plaintext, revealKey) => {
    const key = Buffer.from(revealKey);
    if (key.length !== exports.SCHEDULED_MSG_REVEAL_KEY_BYTES) {
        throw new TypeError(`reveal key must be ${exports.SCHEDULED_MSG_REVEAL_KEY_BYTES} bytes`);
    }
    const encIv = (0, crypto_1.randomBytes)(exports.SCHEDULED_MSG_REVEAL_KEY_IV_BYTES);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, encIv);
    const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    return { encIv, encPayload: Buffer.concat([body, cipher.getAuthTag()]) };
};
exports.encryptWithRevealKey = encryptWithRevealKey;
const decryptWithRevealKey = (encPayload, encIv, revealKey) => {
    const key = Buffer.from(revealKey);
    const payload = Buffer.from(encPayload);
    if (payload.length < exports.SCHEDULED_MSG_TAG_BYTES) {
        throw new TypeError('encrypted payload is too short to carry an auth tag');
    }
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, Buffer.from(encIv));
    decipher.setAuthTag(payload.subarray(payload.length - exports.SCHEDULED_MSG_TAG_BYTES));
    return Buffer.concat([
        decipher.update(payload.subarray(0, payload.length - exports.SCHEDULED_MSG_TAG_BYTES)),
        decipher.final()
    ]);
};
exports.decryptWithRevealKey = decryptWithRevealKey;
const buildConditionalRevealMessage = ({ encPayload, encIv, revealKeyId }) => ({
    conditionalRevealMessage: {
        conditionalRevealMessageType: index_js_1.proto.Message.ConditionalRevealMessage.ConditionalRevealMessageType.SCHEDULED_MESSAGE,
        encPayload: Buffer.from(encPayload),
        encIv: Buffer.from(encIv),
        revealKeyId
    }
});
exports.buildConditionalRevealMessage = buildConditionalRevealMessage;
const encodeScheduledMessage = (message, revealKey = (0, exports.generateRevealKey)()) => {
    const plaintext = index_js_1.proto.Message.encode(index_js_1.proto.Message.fromObject(message)).finish();
    const { encIv, encPayload } = (0, exports.encryptWithRevealKey)(plaintext, revealKey);
    const revealKeyId = (0, exports.generateRevealKeyId)();
    return {
        revealKey,
        revealKeyId,
        encIv,
        encPayload,
        message: (0, exports.buildConditionalRevealMessage)({ encPayload, encIv, revealKeyId })
    };
};
exports.encodeScheduledMessage = encodeScheduledMessage;
const decodeScheduledMessage = (conditionalRevealMessage, revealKey) => {
    const inner = conditionalRevealMessage?.conditionalRevealMessage ?? conditionalRevealMessage;
    if (!inner?.encPayload || !inner?.encIv) {
        throw new TypeError('conditionalRevealMessage is missing encPayload or encIv');
    }
    return index_js_1.proto.Message.decode((0, exports.decryptWithRevealKey)(inner.encPayload, inner.encIv, revealKey));
};
exports.decodeScheduledMessage = decodeScheduledMessage;
const buildScheduledMsgMetaNode = ({ kind = 'schedule', scheduledTimestampS, revealKeyId, revealKey }) => {
    if (!revealKeyId) {
        throw new TypeError('revealKeyId is required');
    }
    if (kind === 'schedule' && !revealKey) {
        throw new TypeError('scheduling requires the reveal key');
    }
    const attrs = { type: exports.SCHEDULED_MSG_META_TYPE };
    if (kind === 'schedule') {
        if (!Number.isFinite(Number(scheduledTimestampS))) {
            throw new TypeError('scheduledTimestampS must be a unix timestamp in seconds');
        }
        attrs.st = String(Math.floor(Number(scheduledTimestampS)));
    }
    return {
        tag: 'meta',
        attrs,
        content: [{
                tag: 'key',
                attrs: { rkid: revealKeyId },
                content: kind === 'schedule' ? Buffer.from(revealKey) : undefined
            }]
    };
};
exports.buildScheduledMsgMetaNode = buildScheduledMsgMetaNode;
const buildUnscheduleProtocolMessage = (key) => ({
    protocolMessage: {
        key,
        type: index_js_1.proto.Message.ProtocolMessage.Type.MESSAGE_UNSCHEDULE
    }
});
exports.buildUnscheduleProtocolMessage = buildUnscheduleProtocolMessage;
const isScheduledTimeValid = (scheduledTimestampS, nowSeconds = Math.floor(Date.now() / 1000), window = exports.SCHEDULED_MSG_WINDOW.chat) => {
    const rounded = Math.floor(nowSeconds / 60) * 60;
    return scheduledTimestampS - rounded >= window.minSeconds && scheduledTimestampS - nowSeconds <= window.maxSeconds;
};
exports.isScheduledTimeValid = isScheduledTimeValid;
