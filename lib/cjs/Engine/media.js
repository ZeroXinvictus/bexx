"use strict";
// bexx engine — sock.media.send: auto-detect source (buffer/stream/file/URL) and
// media type, then route to the right proto. Thin wrapper over the existing
// prepareWAMessageMedia / getRawMediaUploadData so we don't reimplement upload.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMediaEngine = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// ponytail: native node:module has no mime; use node's bundled mime via `node:`? No —
// use a tiny lookup instead of adding a dep (YAGNI).
const EXT_MIME = {
 ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
 ".webp": "image/webp", ".heic": "image/heic", ".bmp": "image/bmp",
 ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".3gp": "video/3gpp",
 ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
 ".pdf": "application/pdf", ".zip": "application/zip", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 ".txt": "text/plain", ".json": "application/json", ".js": "text/javascript"
};
const mimeFor = ext => EXT_MIME[ext] || "application/octet-stream";
const messages_media_1 = require("../Utils/messages-media.js");
const messages_1 = require("../Utils/messages.js");
const MIME_EXT = {
 image: "image", video: "video", audio: "audio", document: "document", sticker: "sticker"
};
const isStickerMime = m => m === "image/webp";
const sniff = (extOrMime, name) => {
 const ext = node_path_1.extname(name || extOrMime || "").toLowerCase();
 return ext ? mimeFor(ext) : extOrMime;
};
class MediaEngine {
 constructor(sock, options = {}) {
 this._sock = sock;
 this._options = options;
 }
 async resolveSource(source) {
 // source: Buffer | stream | { buffer|path|url } | string(url|path)
 let kind = "buffer";
 let data = source;
 let filename;
 let mime;
 let filesize;
 const norm = async src => {
  if (Buffer.isBuffer(src))
   return { kind: "buffer", data: src };
  if (src?.pipe || src instanceof (await import("node:stream")).Readable)
   return { kind: "stream", data: src };
  if (src?.buffer != null)
   return { kind: "buffer", data: src.buffer };
  if (src?.path != null)
   return { kind: "file", data: src.path };
  if (src?.url != null)
   return { kind: "url", data: src.url };
  if (typeof src === "string")
   return src.startsWith("data:") || /^https?:\/\//.test(src)
    ? { kind: "url", data: src }
    : { kind: "file", data: src };
  throw new Error("unsupported media source");
 };
 const r = await norm(source);
 kind = r.kind;
 data = r.data;
 if (kind === "file") {
  const filePath = data;
  const buf = node_fs_1.readFileSync(filePath);
  data = buf;
  filename = node_path_1.basename(filePath);
  filesize = buf.length;
  mime = sniff(null, filename) || "application/octet-stream";
 }
 else if (kind === "buffer" && data.length) {
  filesize = data.length;
  if (source?.mimetype)
   mime = source.mimetype;
  else
   mime = source?.filename ? sniff(null, source.filename) : "application/octet-stream";
 }
 else if (kind === "url") {
  mime = source?.mimetype || mimeFor(node_path_1.extname(new URL(data).pathname).toLowerCase()) || "application/octet-stream";
  filename = source?.filename || node_path_1.basename(new URL(data).pathname) || "media";
 }
 return { kind, data, filename, mime, filesize, ...source?.meta };
 }
 _route(mimeType, caption) {
 if (isStickerMime(mimeType) || this._options.forceSticker)
  return "sticker";
 if (mimeType.startsWith("image/"))
  return "image";
 if (mimeType.startsWith("video/"))
  return "video";
 if (mimeType.startsWith("audio/"))
  return "audio";
 return "document";
 }
 async send(jid, source, options = {}) {
 const resolved = await this.resolveSource(source);
 const type = this._route(resolved.mime);
 const content = {
  [type === "image" ? "image" : type]: {}
 };
 const opts = { ...options };
 if (options.caption)
  content[type].caption = options.caption;
 if (type === "audio" && options.ptt)
  content[type].ptt = true;
 if (type === "video" && options.gif)
  content[type].gifPlayback = true;
 if (type === "document") {
  content[type].filename = resolved.filename || "file";
  if (resolved.filesize)
   content[type].fileLength = String(resolved.filesize);
 }
 // auto MIME
 if (resolved.mime)
  content[type].mimetype = resolved.mime;
 const prepared = await (0, messages_1.prepareWAMessageMedia)(content, this._sock, {
  logger: this._options.logger,
  reuploadRequest: this._options.reuploadRequest,
  detectMessageType: this._options.detectMessageType ?? true
 });
 return this._sock.sendMessage(jid, prepared[type], { ...opts });
 }
}
const makeMediaEngine = (sock, options) => new MediaEngine(sock, options);
exports.makeMediaEngine = makeMediaEngine;
