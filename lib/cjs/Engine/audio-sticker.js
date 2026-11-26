"use strict";
// bexx Audio-Sticker Engine — combine a sticker/webp image with an audio track
// into a "sound sticker" that WhatsApp actually renders:
//
//   Message.stickerMessage(26) > StickerMessage.audioMessage(26)
//
// This is the correct, rendering mechanism (NOT the opaque
// Message.audioStickerMessage(134) wrapper). It requires the proto fields
// StickerMessage.audioMessage, ContextInfo.experienceIds and
// ContextInfo.mediaDomainInfo — all present in bexx's WAProto.
//
// Usage:
//   const res = await sock.audioSticker.send(jid, { sticker, audio });
//
//   sticker: a media source (Buffer / {data} / {stream} / {url} / path) —
//            must be (or be convertible to) WebP.
//   audio:   a media source — an audio file, or a video whose audio track
//            will be extracted. If it is already a WebA/Opus OGG pass it
//            through as-is; otherwise it is transcoded to Ogg/Opus with
//            ffmpeg when available, else sent in its original codec.
//
// Options:
//   opts.seconds   — override the audio duration (seconds)
//   opts.isAnimated — force the WebP "isAnimated" flag
//
// The engine uploads BOTH media through the socket's real upload pipeline
// (same as the media engine), assembles the nested proto, and sends it via
// sock._originalSendMessage (bypassing prepareModernMessageContent, which
// would otherwise strip the nested audioMessage field).

Object.defineProperty(exports, "__esModule", { value: true });

const node_crypto_1 = require("crypto");
const node_fs_1 = require("fs");
const node_child_process_1 = require("child_process");

// ponytail: parse a WebP buffer for width/height/animated. No sharp required —
// we read the RIFF/WEBP chunks directly (VP8 / VP8L / VP8X).
const parseWebp = (b) => {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP")
    throw new Error("sticker harus berupa WebP");
  const c = b.toString("ascii", 12, 16);
  if (c === "VP8 ")
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, isAnimated: false };
  if (c === "VP8L")
    return {
      width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
      height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)),
      isAnimated: false
    };
  if (c === "VP8X")
    return {
      width: 1 + b.readUIntLE(24, 3),
      height: 1 + b.readUIntLE(27, 3),
      isAnimated: (b[20] & 2) !== 0
    };
  throw new Error("WebP chunk tidak didukung: " + c);
};

// ponytail: if ffmpeg is available, transcode any audio/video source to Ogg/Opus;
// otherwise return the buffer as-is (WA will reject non-Opus, so ffmpeg is the
// expected path). No sharp/jimp needed — callers must pass a real WebP sticker.
const toOpus = (input) => new Promise((resolve, reject) => {
  const ffmpeg = "ffmpeg";
  try {
    node_child_process_1.spawnSync(ffmpeg, ["-version"]);
  }
  catch {
    return resolve({ buf: input, mimetype: "audio/ogg; codecs=opus", seconds: undefined, asIs: true });
  }
  const p = node_child_process_1.spawn(ffmpeg, [
    "-v", "info",
    "-i", "pipe:0",
    "-vn",
    "-map_metadata", "-1",
    "-c:a", "libopus", "-b:a", "64k", "-ar", "48000", "-ac", "1",
    "-f", "ogg",
    "pipe:1"
  ]);
  const out = [];
  let err = "";
  p.stdout.on("data", d => out.push(d));
  p.stderr.on("data", d => err += d);
  p.on("error", reject);
  p.on("close", (code) => {
    if (code !== 0)
      return reject(new Error("ffmpeg gagal: " + err.slice(-300)));
    const t = [...err.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop();
    resolve({
      buf: Buffer.concat(out),
      mimetype: "audio/ogg; codecs=opus",
      seconds: t ? Math.round(Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3])) : undefined
    });
  });
  p.stdin.on("error", () => { });
  p.stdin.end(input);
});

class AudioStickerEngine {
  constructor(sock, options = {}) {
    this._sock = sock;
    this._options = options;
  }
  // Resolve a source into a Buffer + mime (reuse the media engine's logic via
  // a minimal local resolver so we stay self-contained).
  async _toBuffer(source, fallbackMime) {
    const { resolveSource } = this._sock.media ? { resolveSource: this._sock.media.resolveSource.bind(this._sock.media) } : {};
    const resolved = resolveSource
      ? await resolveSource(source)
      : { data: source, mimetype: fallbackMime, filename: "media" };
    if (resolved.data)
      return { buf: Buffer.isBuffer(resolved.data) ? resolved.data : Buffer.from(resolved.data), mime: resolved.mimetype };
    if (resolved.url) {
      const data = await node_fs_1.promises.readFile(resolved.url);
      return { buf: data, mime: resolved.mimetype };
    }
    if (resolved.stream) {
      const chunks = [];
      for await (const c of resolved.stream)
        chunks.push(c);
      return { buf: Buffer.concat(chunks), mime: resolved.mimetype };
    }
    throw new Error("audio sticker: sumber tidak bisa dibaca (butuh Buffer / file / stream / URL)");
  }
  // Default opus transcoder (overridable in tests / when ffmpeg is absent).
  _toOpus(buf) {
    return toOpus(buf);
  }
  async _upload(buf, mime, forceType) {
    const { prepareWAMessageMedia } = require("../Utils/messages.js");
    const type = forceType || (mime === "image/webp" ? "sticker" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document");
    const content = {};
    content[type] = { data: buf, mimetype: mime, ...(type === "audio" ? { ptt: true } : {}) };
    const opts = {
      upload: this._sock.waUploadToServer,
      logger: this._options.logger,
      mediaCache: this._options.mediaCache,
      options: this._options
    };
    const prepared = await prepareWAMessageMedia(content, opts);
    const msg = prepared[`${type}Message`];
    if (!msg)
      throw new Error("audio sticker: upload media gagal");
    return { proto: msg, type };
  }
  async send(jid, { sticker, audio }, opts = {}) {
    if (!sticker || !audio)
      throw new Error("audio sticker butuh { sticker, audio }");

    // 1. sticker -> WebP
    const stickerBuf = await this._toBuffer(sticker, "image/webp");
    const webpBuf = stickerBuf.buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      stickerBuf.buf.subarray(8, 12).toString("ascii") === "WEBP"
      ? stickerBuf.buf
      : stickerBuf.buf; // ponytail: caller must supply WebP; we parse dims below.
    const dims = parseWebp(webpBuf);

    // 2. audio -> Opus (or audio extracted from a video source)
    const audioBuf = await this._toBuffer(audio, "audio/ogg");
    const isVideoSource = audioBuf.mime.startsWith("video/");
    // ponytail: if ffmpeg present, transcode (handles video->audio + any codec).
    // The isVideoSource flag only matters for the docs; ffmpeg -vn strips video.
    const opus = audioBuf.buf.subarray(0, 4).toString("ascii") === "OggS" && !isVideoSource
      ? { buf: audioBuf.buf, mimetype: "audio/ogg; codecs=opus", seconds: undefined, asIs: true }
      : await this._toOpus(audioBuf.buf);
    const seconds = opts.seconds ?? opus.seconds;

    // 3. upload both
    const stickerU = await this._upload(webpBuf, "image/webp", "sticker");
    const audioU = await this._upload(opus.buf, opus.mimetype, "audio");
    if (!stickerU.proto?.directPath || !audioU.proto?.directPath)
      throw new Error("audio sticker: upload gagal (directPath tidak ada)");

    const mediaDomainInfo = key => ({ mediaKeyDomain: 1, e2EeMediaKey: key });

    // 4. assemble the nested proto the renderer actually uses.
    const now = Math.floor(Date.now() / 1000);
    const audioMsg = {
      url: audioU.proto.url,
      mimetype: opus.mimetype,
      fileSha256: audioU.proto.fileSha256,
      fileEncSha256: audioU.proto.fileEncSha256,
      fileLength: audioU.proto.fileLength,
      mediaKey: audioU.proto.mediaKey,
      directPath: audioU.proto.directPath,
      mediaKeyTimestamp: audioU.proto.mediaKeyTimestamp || now,
      ptt: true,
      ...(seconds != null ? { seconds } : {})
    };
    const stickerMsg = {
      url: stickerU.proto.url,
      fileSha256: stickerU.proto.fileSha256,
      fileEncSha256: stickerU.proto.fileEncSha256,
      mediaKey: stickerU.proto.mediaKey,
      mimetype: "image/webp",
      height: dims.height,
      width: dims.width,
      directPath: stickerU.proto.directPath,
      fileLength: stickerU.proto.fileLength,
      mediaKeyTimestamp: stickerU.proto.mediaKeyTimestamp || now,
      isAnimated: opts.isAnimated ?? dims.isAnimated,
      stickerSentTs: Date.now(),
      audioMessage: audioMsg,
      contextInfo: {
        mediaDomainInfo: mediaDomainInfo(stickerU.proto.mediaKey),
        experienceIds: [13001]
      }
    };

    // 5. Build a prepared Message via the real proto assembler so encoding is
    //    correct, then send through _originalSendMessage to keep the nested
    //    audioMessage field (the modern-content path strips it).
    const { proto } = require("../../WAProto/index.cjs");
    const protoMsg = proto.Message.fromObject({
      stickerMessage: stickerMsg,
      messageContextInfo: { messageSecret: node_crypto_1.randomBytes(32) }
    });

    const originalSend = this._sock._originalSendMessage || this._sock.sendMessage;
    this._sock._originalSendMessage = originalSend;
    const result = await originalSend(jid, JSON.parse(JSON.stringify(protoMsg)), opts);
    return { ok: true, size: opus.buf.length, seconds: seconds ?? null, key: result?.key };
  }
}

const makeAudioStickerEngine = (sock, options) => new AudioStickerEngine(sock, options);
exports.makeAudioStickerEngine = makeAudioStickerEngine;
