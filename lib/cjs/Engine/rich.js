"use strict";
// bexx Rich Engine — friendly builders for WA rich / GenAI messages.
//
// The low-level generateRichMessage (Utils/rich-message.js) reads a fixed set of
// keys: text, inline_entities, code, table, html, image, images, imgv2,
// hscroll, footer/footerActionV2, video, productSingle, productMultiple, post,
// reels, sources, tip, suggestions, title, response_id. This engine maps
// ergonomic builder arguments onto exactly those keys, plus a few extra ones
// (buttons/cta -> footer action row; imageV2 -> imgv2) so nothing is dropped.
//
// Usage:
//   const rich = sock.rich;
//   await sock.sendMessage(jid, rich.card({...}));        // pass straight through
//   await rich.send(sock, jid, rich.hello());             // one-call build+send
//   const msg = await rich.build(rich.card({...}));       // -> WAProto content
//
// Every builder returns a PLAIN richMessage object. The only async step is
// build()/send(), which awaits generateRichMessage.

Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRichEngine = makeRichEngine;
exports.generateRichMessage = generateRichMessage;

const { generateRichMessage: genRich } = require("../Utils/rich-message.js");

// ponytail: builders are pure data mappers — no socket needed. Exposed via
// makeRichEngine(sock) only to sit alongside the other engines.
function makeRichEngine(_sock, _options) {
  // --- markdown / text with inline links, latex, citations ---
  const text = (value, opts = {}) => {
    const r = { text: value };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    if (Array.isArray(opts.inline_entities)) r.inline_entities = opts.inline_entities;
    return r;
  };

  // --- syntax-highlighted code block (language: js|ts|python|php|bash|json|...) ---
  const code = (body, opts = {}) => {
    const r = { code: { language: opts.language ?? "javascript", code: body } };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- single image (remote URL) ---
  const image = (url, opts = {}) => {
    const r = { image: url };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- image grid / gallery ---
  const gallery = (urls, opts = {}) => {
    const r = { images: Array.isArray(urls) ? urls : [urls] };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- markdown table: headers + rows ---
  const table = (headers, rows, opts = {}) => {
    const rr = Array.isArray(rows) ? rows : [rows];
    const r = { table: { title: opts.title ?? "", rows: [headers, ...rr.map(x => Array.isArray(x) ? x : [x])] } };
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- single product card ---
  const product = (p, opts = {}) => {
    const item = {
      title: p.title,
      brand: p.brand ?? "",
      price: p.price ?? "",
      sale_price: p.sale_price ?? p.salePrice ?? "",
      product_url: p.product_url ?? p.productUrl ?? "",
      image: p.image ?? "",
      icon: p.icon ?? p.image ?? ""
    };
    const r = { productSingle: item };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- product carousel (multiple) ---
  const products = (items, opts = {}) => {
    const arr = Array.isArray(items) ? items : [items];
    const r = {
      productMultiple: arr.map(p => ({
        title: p.title,
        brand: p.brand ?? "",
        price: p.price ?? "",
        sale_price: p.sale_price ?? p.salePrice ?? "",
        product_url: p.product_url ?? p.productUrl ?? "",
        image: p.image ?? "",
        icon: p.icon ?? p.image ?? ""
      }))
    };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- footer action buttons (GenAI action row). Accepts {label,url,color} or
  //     {cta_text,cta_type,cta_url}; normalized to the cta_* keys the renderer reads.
  const buttons = (items, opts = {}) => {
    const arr = Array.isArray(items) ? items : [items];
    const r = {
      footerActionV2: arr.map(a => ({
        cta_text: a.cta_text ?? a.label ?? a.text ?? "",
        cta_type: a.cta_type ?? a.type ?? "OPEN_URL",
        cta_url: a.cta_url ?? a.url ?? "",
        ...(a.cta_color || a.color ? { cta_color: a.cta_color ?? a.color } : {})
      }))
    };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };
  // alias
  const actions = buttons;

  // --- suggested follow-up prompt pills ---
  const suggestions = (items, opts = {}) => {
    const r = { suggestions: Array.isArray(items) ? items : [items] };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- sources / citations row. Items: [favicon, url, displayName] or full object. ---
  const sources = (items, opts = {}) => {
    const r = { sources: Array.isArray(items) ? items : [items] };
    if (opts.title) r.title = opts.title;
    return r;
  };

  // --- remote video (GenAI animate primitive) ---
  const video = (url, opts = {}) => {
    const r = { video: url };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- instagram / social post cards ---
  const post = (items, opts = {}) => {
    const r = { post: Array.isArray(items) ? items : [items] };
    if (opts.title) r.title = opts.title;
    return r;
  };

  // --- reels / short-video carousel ---
  const reels = (items, opts = {}) => {
    const r = { reels: Array.isArray(items) ? items : [items] };
    if (opts.title) r.title = opts.title;
    return r;
  };

  // --- raw html block (trusted sources empty by default) ---
  const html = (payload, opts = {}) => {
    const r = { html: payload };
    if (opts.title) r.title = opts.title;
    if (opts.tip) r.tip = opts.tip;
    return r;
  };

  // --- high-res image with preview/full split ---
  const imageV2 = (url, opts = {}) => {
    const spec = typeof url === "string" ? { url } : url;
    const r = { imgv2: { url: spec.url, mime_type: spec.mime ?? "image/jpeg", ...(spec.preview ? { preview_url: spec.preview } : {}), ...(spec.full ? { full_url: spec.full } : {}) } };
    if (opts.title) r.title = opts.title;
    return r;
  };

  // --- tip / metadata text line (single) ---
  const tip = (value) => ({ tip: value });

// --- latex expression (AIRichResponseLatexMetadata) ---
// Items: { expression, url?, width?, height?, font_height?, image_top_padding? }
const latex = (items, opts = {}) => {
const arr = Array.isArray(items) ? items : [items];
const r = { latex: arr };
if (opts.title) r.title = opts.title;
if (opts.tip) r.tip = opts.tip;
return r;
};

// --- map pin (AIRichResponseMapMetadata) ---
// { center: { lat, lon }, annotations: [{ latitude, longitude, title, body }] }
const map = (spec, opts = {}) => {
const r = { map: typeof spec === 'string' ? { center: spec } : spec };
if (opts.title) r.title = opts.title;
if (opts.tip) r.tip = opts.tip;
return r;
};

// --- dynamic media / animated (AIRichResponseDynamicMetadata) ---
// { url, type: 'IMAGE'|'GIF', loopCount? }
const dynamic = (spec, opts = {}) => {
const r = { dynamic: Array.isArray(spec) ? spec : [spec] };
if (opts.title) r.title = opts.title;
if (opts.tip) r.tip = opts.tip;
return r;
};

// --- inline image (AIRichResponseInlineImageMetadata) ---
// { url, text?, mime_type? }
const inlineImage = (spec, opts = {}) => {
const r = { inlineImage: Array.isArray(spec) ? spec : [spec] };
if (opts.title) r.title = opts.title;
if (opts.tip) r.tip = opts.tip;
return r;
};

// --- search results (AIRichResponseContentItemsMetadata) ---
// Items: { title, url, favicon?, image?, mime_type? }
const search = (items, opts = {}) => {
const r = { search: Array.isArray(items) ? items : [items] };
if (opts.title) r.title = opts.title;
if (opts.tip) r.tip = opts.tip;
return r;
};

  // --- composite: assemble a richMessage from any combination ---
  // Accepts the friendly keys above AND passes through any raw generateRichMessage
  // key, so power users can mix.
  const card = (spec = {}) => {
    const out = {};
    if (spec.text != null) out.text = spec.text;
    if (spec.title != null) out.title = spec.title;
    if (spec.response_id != null) out.response_id = spec.response_id;
    if (spec.tip != null) out.tip = spec.tip;
    if (Array.isArray(spec.inline_entities)) out.inline_entities = spec.inline_entities;
    if (spec.code != null) out.code = typeof spec.code === "string" ? { language: "javascript", code: spec.code } : spec.code;
    if (spec.table != null) out.table = spec.table;
    if (spec.html != null) out.html = spec.html;
    if (spec.image != null) out.image = spec.image;
    if (spec.images != null) out.images = spec.images;
    if (spec.imageV2 != null) out.imgv2 = typeof spec.imageV2 === "string" ? { url: spec.imageV2 } : spec.imageV2;
    if (spec.hscroll != null) out.hscroll = spec.hscroll;
    if (spec.video != null) out.video = spec.video;
    if (spec.product != null) out.productSingle = spec.product;
    if (spec.products != null) out.productMultiple = Array.isArray(spec.products) ? spec.products : [spec.products];
    if (spec.post != null) out.post = spec.post;
    if (spec.reels != null) out.reels = spec.reels;
    if (spec.sources != null) out.sources = spec.sources;
    if (spec.suggestions != null) out.suggestions = spec.suggestions;
if (spec.latex != null) out.latex = spec.latex;
if (spec.map != null) out.map = spec.map;
if (spec.dynamic != null) out.dynamic = spec.dynamic;
if (spec.inlineImage != null) out.inlineImage = spec.inlineImage;
if (spec.search != null) out.search = spec.search;
    // buttons / cta -> footerActionV2
    if (spec.buttons != null) out.footerActionV2 = (Array.isArray(spec.buttons) ? spec.buttons : [spec.buttons]).map(a => ({
      cta_text: a.cta_text ?? a.label ?? a.text ?? "",
      cta_type: a.cta_type ?? a.type ?? "OPEN_URL",
      cta_url: a.cta_url ?? a.url ?? ""
    }));
    else if (spec.footerActionV2 != null) out.footerActionV2 = spec.footerActionV2;
    // footer: string -> metadata text; array -> action row; object -> raw
    else if (spec.footer != null) {
      if (typeof spec.footer === "string") out.footer = spec.footer;
      else if (Array.isArray(spec.footer)) out.footerActionV2 = spec.footer.map(a => ({
        cta_text: a.cta_text ?? a.label ?? a.text ?? "",
        cta_type: a.cta_type ?? a.type ?? "OPEN_URL",
        cta_url: a.cta_url ?? a.url ?? ""
      }));
      else out.footer = spec.footer;
    }
    // pass-through for any raw key not covered above
    for (const k of Object.keys(spec)) {
      if (!(k in out) && ["inline_entities", "imgv2", "imageV2", "hscroll", "hscrollV2", "footerActionV2", "buttons", "footer", "productSingle", "productMultiple"].includes(k))
        out[k] = spec[k];
    }
    return out;
  };

  // --- prepared WAProto content (call before sendMessage) ---
  const build = async (richMsg) => genRich(richMsg);

  // --- build + send in one call. Wrap in { richMessage } so the real
  // sendMessage pipeline routes it through generateRichMessage (the plain
  // object would otherwise hit the text branch and render as text). ---
  const send = async (sockRef, jid, richMsg) => sockRef.sendMessage(jid, { richMessage: card(richMsg) }, { linkPreview: true });

  // --- carousel / hscroll: horizontal cards (GenAI3PExtWidgetPrimitive) ---
const carousel = (cards, opts = {}) => {
const arr = Array.isArray(cards) ? cards : [cards];
const r = {
hscroll: arr.map(c => ({
title: c.title ?? c.header ?? "",
...(c.body_typename ? { body_typename: c.body_typename } : {}),
...(c.sections ? { sections: c.sections } : {}),
buttons: (c.buttons ?? c.ctas ?? []).map(b => ({
label: b.label ?? b.cta_text ?? "",
state: b.state ?? "PENDING",
kind: b.kind ?? "OTHER"
}))
}))
};
if (opts.title) r.title = opts.title;
return r;
};

// --- nice ready-made demo cards ("cakep") ---
  const presets = {
    hello: () => card({
      title: "Bexx Rich Demo",
      text: "Halo! Ini **demo rich** dari *bexx* dengan [link](https://github.com/ZeroXinvictus/bexx) + rumus $E=mc^2$.",
      image: "https://mmg.whatsapp.net/f/fxYwZQ",
      buttons: [
        { label: "Detail", url: "https://github.com/ZeroXinvictus/bexx" },
        { label: "Coba lagi", url: "https://wa.me" }
      ],
      suggestions: ["Jelaskan lebih detail", "Kirim contoh lain", "Buatkan code"]
    }),
    code: (body, lang = "javascript") => card({
      title: "Code",
      code: { language: lang, code: body },
      tip: "Copy dari balok kode di atas."
    }),
    product: (p) => card({
      product: p,
      buttons: p.product_url ? [{ label: "Beli sekarang", url: p.product_url }] : undefined
    }),
gallery: (urls, title) => card({ images: urls, title }),
shop: (items, title = "Pilihan") => {
const r = card({ title });
r.productMultiple = (Array.isArray(items) ? items : [items]).map(p => ({
title: p.title, brand: p.brand ?? "", price: p.price ?? "",
sale_price: p.sale_price ?? "", product_url: p.product_url ?? "",
image: p.image ?? "", icon: p.icon ?? p.image ?? ""
}));
return r;
},
features: (cards, title = "Features") => {
const norm = (Array.isArray(cards) ? cards : [cards]).map(c => ({
title: c.title ?? "",
...(c.sections ? { sections: c.sections } : {}),
buttons: (c.buttons ?? []).map(b => ({ label: b.label ?? "", state: b.state ?? "PENDING", kind: b.kind ?? "OTHER" }))
}));
return card({ title, hscroll: norm });
},
 // location map preset
map: (lat, lon, annotations = [], title = "Location") => {
const anns = annotations.map((a, idx) => ({
 annotationNumber: idx + 1,
 latitude: typeof a === 'number' ? a : a.latitude,
 longitude: typeof a === 'number' ? a : a.longitude,
 title: typeof a === 'string' ? a : a.title || "", body: typeof a === 'string' ? "" : a.body || ""
}));
return card({ title, map: { center: { lat, lon }, annotations: anns } });
},
 // latex formula preset
latex: (exprs, title = "Formulas") => {
const arr = Array.isArray(exprs) ? exprs : [exprs];
const items = arr.map(e => ({ expression: typeof e === 'string' ? e : e.expression, url: typeof e === 'string' ? '' : e.url }));
return card({ title, latex: items });
},
 // search results preset
search: (results, title = "Results") => {
const arr = Array.isArray(results) ? results : [results];
return card({ title, search: arr });
},
}

  return {
    text, code, image, gallery, table, product, products,
    buttons, actions, suggestions, sources, video, post, reels, html, imageV2, tip,
latex, map, dynamic, inlineImage, search, carousel, card, build, send, presets
  };
}

// Re-export the low-level assembler so power users can drive it directly.
function generateRichMessage(rich) {
  return genRich(rich);
}
