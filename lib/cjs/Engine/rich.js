"use strict";
// bexx Rich Engine — friendly builders for WA rich/GenAI messages.
//
// The low-level generateRichMessage (Utils/rich-message.js) is a GenAI UX
// primitive assembler. This engine wraps it with ergonomic builders that
// produce the richMessage payload you pass to sock.sendMessage(jid, { richMessage }).
//
// Usage:
//   const { rich } = require("bexx");
//   await sock.sendMessage(jid, rich.text("halo, ini **bold**"));
//   await sock.sendMessage(jid, rich.card({ title, body, image, buttons }));
//   await sock.sendMessage(jid, rich.code("function x(){...}", { language: "js" }));
//   await sock.sendMessage(jid, rich.image(url));
//   await sock.sendMessage(jid, rich.gallery([url1, url2]));
//   await sock.sendMessage(jid, rich.table(headers, rows));
//   await sock.sendMessage(jid, rich.product({ title, price, image }));
//
// Each builder returns a plain richMessage object — feed it straight to
// sendMessage as { richMessage: <builder result> }.
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRichEngine = makeRichEngine;
Object.defineProperty(exports, "makeRichEngine", { enumerable: true, get: function () { return makeRichEngine; } });
exports.generateRichMessage = generateRichMessage;
Object.defineProperty(exports, "generateRichMessage", { enumerable: true, get: function () { return generateRichMessage; } });

const { generateRichMessage: genRich } = require("../Utils/rich-message.js");

// ponytail: the rich engine is a set of pure builders — no socket needed.
// Exposed as makeRichEngine(sock) for the sock.rich attach pattern so it sits
// alongside the other engines, but the builders don't actually use sock.
function makeRichEngine(sock, options = {}) {
 const base = {
 // ---- markdown / text with inline links, latex, citations ----
 text(value, opts = {}) {
 const r = { text: value };
 if (opts.title) {
 r.title = opts.title;
 }
 return r;
},
 // ---- syntax-highlighted code block ----
 code(codeBody, opts = {}) {
 return {
 code: { language: opts.language ?? "javascript", code: codeBody },
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- single image (remote URL) ----
 image(url, opts = {}) {
 return {
 image: url,
 ...(opts.title ? { title: opts.title } : {}),
 ...(opts.tip ? { tip: opts.tip } : {})
 };
},
 // ---- image grid / gallery ----
 gallery(urls, opts = {}) {
 return {
 images: Array.isArray(urls) ? urls : [urls],
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- markdown table ----
 table(headers, rows, opts = {}) {
 return {
 table: { title: opts.title ?? "", rows: headers.concat(rows.map(r => Array.isArray(r) ? r : [r])) },
 ...(opts.tip ? { tip: opts.tip } : {})
 };
},
 // ---- product card (single) ----
 product(p, opts = {}) {
 return {
 productSingle: {
 title: p.title,
 brand: p.brand ?? "",
 price: p.price ?? "",
 sale_price: p.sale_price ?? p.salePrice ?? "",
 product_url: p.product_url ?? p.productUrl ?? "",
 image: p.image ?? "",
 icon: p.icon ?? p.image ?? ""
 },
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- product carousel (multiple) ----
 products(items, opts = {}) {
 return {
 productMultiple: (Array.isArray(items) ? items : [items]).map(p => ({
 title: p.title,
 brand: p.brand ?? "",
 price: p.price ?? "",
 sale_price: p.sale_price ?? p.salePrice ?? "",
 product_url: p.product_url ?? p.productUrl ?? "",
 image: p.image ?? "",
 icon: p.icon ?? p.image ?? ""
 })),
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- footer action buttons (GenAI action row) ----
 actions(items, opts = {}) {
 const arr = Array.isArray(items) ? items : [items];
 return {
 footerActionV2: arr.map(a => ({
 label: a.label ?? a.text,
 type: a.type ?? "OPEN_URL",
 url: a.url ?? "",
 ...(a.deep_link ? { deep_link: a.deep_link } : {})
 })),
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- suggested follow-up prompt pills ----
 suggestions(items, opts = {}) {
 return {
 suggestions: Array.isArray(items) ? items : [items],
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- sources / citations row ----
 sources(items, opts = {}) {
 return {
 sources: Array.isArray(items) ? items : [items],
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- video (remote URL, GenAI animate primitive) ----
 video(url, opts = {}) {
 return {
 video: url,
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- instagram/social post card ----
 post(items, opts = {}) {
 return {
 post: Array.isArray(items) ? items : [items],
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- reels / short-video carousel ----
 reels(items, opts = {}) {
 return {
 reels: Array.isArray(items) ? items : [items],
 ...(opts.title ? { title: opts.title } : {})
 };
},
 // ---- composite: text + image + buttons + suggestions in one message ----
 card({ text, image, images, code, table, product, products, footer, actions, suggestions, title }) {
 const r = {};
 if (text) {
 r.text = text;
 }
 if (image) {
 r.image = image;
 }
 if (images) {
 r.images = images;
 }
 if (code) {
 r.code = typeof code === "string" ? { language: "javascript", code } : code;
 }
 if (table) {
 r.table = table;
 }
 if (product) {
 r.productSingle = product;
 }
 if (products) {
 r.productMultiple = products;
 }
 if (footer) {
 r.footer = footer;
 }
 if (actions) {
 r.footerActionV2 = actions;
 }
 if (suggestions) {
 r.suggestions = suggestions;
 }
 if (title) {
 r.title = title;
 }
 return r;
},
 // ---- the prepared WAProto content (call before sendMessage) ----
 async build(richMsg) {
 return genRich(richMsg);
},
 // ---- convenience: build + send in one call ----
 async send(sockRef, jid, richMsg) {
 const content = await genRich(richMsg);
 return sockRef.sendMessage(jid, { richMessage: content, linkPreview: true });
},
 };
 return base;
}

function generateRichMessage(rich) {
 return genRich(rich);
}
