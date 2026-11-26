# bexx

Production extensions layer for a Baileys fork. Adds developer tooling and
reliability engines that Baileys core does not ship:

| Engine | Socket API | Purpose |
|--------|------------|---------|
| Queue + Retry | `sock.queue` | send with priority, retry/backoff, pause/resume on connection loss |
| Message Cache + Dedup | `sock.messages` | bounded TTL/LRU cache, duplicate detection |
| Media Pipeline | `sock.media` | auto-detect source + MIME + type, upload via socket pipeline |
| Scheduler | `sock.schedule` | persistent, file-backed timed sends (atomic writes) |
| Stability | `sock.stability` | auto-reconnect w/ backoff, heartbeat, graceful degradation |
| **Protocol Inspector** | `sock.inspector` | DevTools-style protocol capture, redaction, diff |
| **Session Doctor** | `sock.doctor` | diagnose session health; safe repair only, else REAUTH_REQUIRED |
| **Offline Test Harness** | `createBaileysTestHarness()` | deterministic record/replay + network simulation |
| **Rich / GenAI** | `sock.rich` | friendly builders + presets for rich response cards (text, image, code, table, buttons, pills, products, reels…) |
| **Report Flow** | `sock.reportFlow(jid, opts)` | native spam-flow report IQ (overflow_menu_report, block, etc.) |
| **Audio Sticker** | `sock.audioSticker` | combine a WebP sticker + audio into a WA "sound sticker" (nested `stickerMessage.audioMessage`, renders natively) |
| VoIP | `makeBexxVoIP(sock)` | WebRTC relay calls (relay-transport) |

All engines are **additive**: `sock.sendMessage(...)` and every native Baileys
API keep working. Engines are wired only when you use them.

## Install

```bash
npm install bexx            # registry
# or, from source:
npm install github:ZeroXinvictus/bexx#main
```

## Pairing (bexx-native, no custom code)

```js
const bexx = require("bexx");

const auth = await bexx.useMultiFileAuthState("./auth");
const sock = bexx.makeWASocket({
  logger: pino({ level: "silent" }),
  auth: auth.state,
  printQRInTerminal: false,
  media: {},
});

sock.ev.on("connection.update", async (u) => {
  if (u.connection === "close") {
    // bexx stability engine auto-reconnects; you can just wait
  }
});

sock.ev.on("qr", async () => {
  // bexx-native pairing: it generates and returns the code, no custom logic
  const code = await sock.requestPairingCode();
  console.log("pair:", code);
});
```

## Queue + Retry

```js
await sock.queue.send("628123456789@s.whatsapp.net", { text: "hi" }, {
  priority: "high",
  retries: 5,
  timeout: 30_000,
});
sock.queue.pause();      // manually
sock.queue.resume();
console.log(sock.queue.metrics());
// { pending, running, completed, failed, retried }
```

When the connection drops the queue auto-pauses (via the stability engine)
and resumes when it's back. Retries use exponential backoff + jitter, capped.

## Message Cache + Dedup

```js
sock.messages.set(msg.key.id, msg);
if (sock.messages.isDuplicate(msg.key.id)) return;   // skip
sock.messages.get(msg.key.id);
console.log(sock.messages.metrics()); // { size, limit, ttlMs, duplicates }
```

Bounded by default (TTL + LRU max entries). Configurable via
`makeWASocket({ messages: { ttlMs, maxSize } })`.

## Media Pipeline

```js
await sock.media.send(jid, "./photo.png", { caption: "hello" });
await sock.media.send(jid, buffer, {});
await sock.media.send(jid, "https://example.com/x.mp4", {});
```

Auto-detects MIME (via `mime-types`), media type, and uploads through the
socket's real pipeline. `sock.media` does **not** replace ffmpeg/sharp — it
normalizes + prepares, leaving transcoding to you.

## Scheduler

```js
const jobId = await sock.schedule.send(jid, { text: "scheduled" }, { at: Date.now() + 60_000 });
sock.schedule.list();
sock.schedule.cancel(jobId);
```

Jobs persist to disk and survive restarts (atomic writes prevent
corruption). The scheduler routes through the queue/retry engine, so a
scheduled send on a dropped connection is retried, not lost.

## Protocol Inspector

```js
sock.inspector.enable({ direction: "both", redact: true });

sock.ev.on("messages.upsert", (p) => { /* your handler */ });

const events = sock.inspector.events();
const exported = sock.inspector.export();        // NDJSON-friendly
const diffs = sock.inspector.diff(previousCapture);
sock.inspector.metrics(); // { events, dropped, enabled, size }
sock.inspector.disable();
```

Sensitive attrs (`to`, `secret`, key/signature material) are redacted to
`[REDACTED]` by default. Capture is bounded (ring buffer, default 1024).

## Session Doctor

```js
const d = await sock.doctor.check();
console.log(d.status, d.summary);
// HEALTHY | WARNING | RECOVERABLE | REAUTH_REQUIRED | CORRUPTED

if (d.status === "RECOVERABLE") {
  const r = await sock.doctor.repair(true); // confirm=true authorizes safe repair
}
```

The doctor **never** wipes auth state. When repair is unsafe (would log the
user out / lose credentials), it returns `SESSION_REAUTH_REQUIRED` instead of
touching anything.

## Offline Test Harness

```js
const t = bexx.createBaileysTestHarness();

t.fake.on("messages.upsert", (p) => { /* assert bot behavior */ });

// record from a live socket
t.record();
// ... let events flow ...
t.saveFixture("fixtures/upsert.ndjson");

// deterministic replay in CI
await t.replay("fixtures/upsert.ndjson");

// network simulation
t.network.disconnect();
t.network.reconnect();
```

Replay is deterministic; fixtures are NDJSON so they're diff-able and
sanitizable before committing.

## Rich / GenAI messages (`sock.rich`)

Builders return a **plain** `richMessage` object you feed straight to
`sendMessage`. Each maps to the GenAI UX primitive WA actually renders.

```js
// one-call nice card (text+link + image + CTA buttons + follow-up pills)
await sock.rich.send(sock, jid, sock.rich.presets.hello());

// or compose your own
await sock.sendMessage(jid, sock.rich.card({
  title: "Result",
  text: "Halo, ini **bold** + [link](https://wa.me) + $E=mc^2$.",
  image: "https://mmg.whatsapp.net/f/...",
  buttons: [{ label: "Detail", url: "https://wa.me" }],
  suggestions: ["Coba lagi", "Jelasin"]
}));

// single-primitive helpers
sock.rich.code("function x(){...}", { language: "js" });
sock.rich.table(["col1","col2"], [["a","b"],["c","d"]]);
sock.rich.product({ title: "Kopi", price: "15rb", image: "https://..." });
sock.rich.gallery(["u1","u2"]);
sock.rich.carousel([{ title: "Card", buttons: [{ label: "Go" }] }]);      // swipeable hscroll
await sock.rich.send(sock, jid, sock.rich.presets.shop([product]));       // product carousel
await sock.rich.send(sock, jid, sock.rich.presets.features([card]));     // feature carousel
sock.rich.reels([reel]);
sock.rich.latex([{ expression: "E=mc^2" }]); // math formula
sock.rich.map({ center: { lat: -6.2, lon: 106.8 }, annotations: [{ latitude: -6.21, longitude: 106.81, title: "Pin" }] }); // location pins
sock.rich.dynamic({ url: "https://x/a.gif", type: "GIF" }); // animated media
sock.rich.search([{ title: "Result", url: "https://x", favicon: "https://x/favicon.ico" }]); // search results
```

`buttons`/`footer` arrays are normalised to the `cta_*` action-row shape the
renderer reads (no more blank footer cards). `build()` returns the prepared
proto; `send()` is build + `sendMessage` in one step.

## Audio (sound) sticker (`sock.audioSticker`)

Combine a WebP sticker with an audio track (or a video — its audio is
extracted) into a WA sound sticker using the **rendering** mechanism
(`stickerMessage.audioMessage`, not the opaque `audioStickerMessage` wrapper):

```js
const res = await sock.audioSticker.send(jid, {
  sticker: "sticker.webp",          // Buffer / path / {url} / {stream}
  audio: "voice.ogg"               // audio, or a video whose audio is used
});
// res = { ok, size, seconds }
```

Audio is transcoded to Ogg/Opus via `ffmpeg` when present (already-Opus
sources pass through untouched). Dimensions are read straight from the WebP
(RIFF/VP8/VP8L/VP8X) — no `sharp` required.

## VoIP

```js
const voip = await bexx.makeBexxVoIP(sock);
voip.on("callstate", (e) => console.log(e.state, e.name));
await voip.dial("62895410790928");
```

## Self-tests

```bash
npm test
```

Runs `test/engines.test.js` — 10 engine self-tests (queue, cache, scheduler,
manager, media, stability×2, inspector, doctor, harness). No framework.
