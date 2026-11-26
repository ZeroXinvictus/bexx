"use strict";
// bexx engine — sock.media.send: auto-detect source (Buffer/stream/file/URL) +
// MIME (via mime-types module, not a hand-rolled table) + media type, then route
// to the right proto and upload through the socket's real upload pipeline.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMediaEngine = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const mime_1 = require("mime-types");
const isStickerMime = m => m === "image/webp";
const isImageMime = m => !!m && m.startsWith("image/");
const isVideoMime = m => !!m && m.startsWith("video/");
const isAudioMime = m => !!m && m.startsWith("audio/");
class MediaEngine {
 constructor(sock, options = {}) {
 this._sock = sock;
 this._options = options;
 }
 _mimeOf(nameOrMime) {
 // ponytail: defer to mime-types (the standard module) instead of a manual table.
 if (nameOrMime && !nameOrMime.includes("/") && node_path_1.extname(nameOrMime) === "" && !/\.[a-z0-9]+$/i.test(nameOrMime))
  return nameOrMime; // already a mime
 const mimeGuess = (0, mime_1.lookup)(nameOrMime);
 return mimeGuess || "application/octet-stream";
 }
 _route(mime, opts = {}) {
 if (opts.forceSticker || isStickerMime(mime))
  return "sticker";
 if (isImageMime(mime))
  return "image";
 if (isVideoMime(mime))
  return "video";
 if (isAudioMime(mime))
  return "audio";
 return "document";
 }
 // Resolve a source into a stream-ready object Baileys upload accepts.
 async resolveSource(source) {
 const asMime = (v, fallback) => (v && v.includes("/") ? v : this._mimeOf(v || "")) || fallback;
 // buffer
 if (Buffer.isBuffer(source))
  return {
   stream: node_fs_1.createReadStream ? Buffer.from(source) : source,
   data: source,
   mimetype: asMime(source?.mimetype, "application/octet-stream"),
   filename: source?.filename || "media.bin",
   filesize: source.length
  };
 // { buffer }
 if (source?.buffer != null)
  return {
   data: source.buffer,
   mimetype: asMime(source.mimetype, this._mimeOf(source.filename || "")),
   filename: source.filename || "media.bin",
   filesize: source.buffer?.length
  };
 // { url }
 if (source?.url != null)
  return {
   url: source.url,
   mimetype: asMime(source.mimetype, this._mimeOf(source.filename || new URL(source.url).pathname, "application/octet-stream")),
   filename: source.filename || node_path_1.basename(new URL(source.url).pathname) || "media",
   filesize: source.filesize
  };
 // { stream }
 if (source?.stream)
  return {
   stream: source.stream,
   mimetype: asMime(source.mimetype, this._mimeOf(source.filename || "", "application/octet-stream")),
   filename: source.filename || "media",
   filesize: source.filesize
  };
 // string path or url
 if (typeof source === "string") {
  if (source.startsWith("data:") || /^https?:\/\//i.test(source))
   return {
    url: source,
    mimetype: this._mimeOf(new URL(source).pathname, "application/octet-stream"),
    filename: node_path_1.basename(new URL(source).pathname) || "media"
   };
  const buf = node_fs_1.readFileSync(source);
  const filename = node_path_1.basename(source);
  return {
   data: buf,
   mimetype: this._mimeOf(filename),
   filename,
   filesize: buf.length
  };
 }
 throw new Error("unsupported media source");
 }
 async send(jid, source, options = {}) {
 const resolved = await this.resolveSource(source);
 const type = this._route(resolved.mimetype, options);
 // build the content Baileys' prepareWAMessageMedia expects
 const content = {};
 const target = resolved.data ? { data: resolved.data } : resolved.stream ? { stream: resolved.stream } : { url: resolved.url };
 // Baileys media field shape: { data|stream|url, mimetype, ... }
 target.mimetype = resolved.mimetype;
 if (options.caption)
  target.caption = options.caption;
 if (type === "audio" && options.ptt)
  target.ptt = true;
 if (type === "video" && options.gif)
  target.gifPlayback = true;
 if (type === "document") {
  target.filename = resolved.filename || "file";
  target.fileLength = String(resolved.filesize ?? 0);
 }
 content[type] = target;
 // upload via the socket's real pipeline (waUploadToServer + mediaCache)
 const prepared = await this._prepare(content, type);
 const msg = { [`${type}Message`]: prepared };
 return this._sock.sendMessage(jid, msg, options);
 }
 _prepare(content, type) {
 // ponytail: reuse the stock media pipeline so thumbnails/dimensions/upload are
 // handled by Baileys, not re-implemented here.
 const { prepareWAMessageMedia } = require("../Utils/messages.js");
 const { waUploadToServer } = this._sock;
 const opts = {
  upload: waUploadToServer,
  logger: this._options.logger,
  mediaCache: this._options.mediaCache,
  options: this._options
 };
 const prepared = prepareWAMessageMedia(content, opts);
 return prepared.then ? prepared : prepared;
 }
}
const makeMediaEngine = (sock, options) => new MediaEngine(sock, options);
exports.makeMediaEngine = makeMediaEngine;
