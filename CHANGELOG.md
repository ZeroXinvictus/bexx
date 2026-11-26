# Changelog

## 0.2.0 — bexx Engines

- **`sock.queue`** — priority message queue (p-queue): concurrency, rate control,
  connection-aware pause/resume, exponential backoff retry, duplicate prevention,
  abort, metrics.
- **`sock.messages`** — LRU message cache + dedup (`set/get/has/isDuplicate`),
  bounded memory, auto-flags duplicate inbound upserts.
- **`sock.media`** — smart media send: auto-detect source (Buffer/stream/file/URL)
  + MIME + type routing (image/video/audio/document/sticker).
- **`sock.schedule`** — persistent, restart-safe scheduled jobs (JSON file),
  retry on reconnect, cancel/list.
- **`BaileysManager`** — multi-session in one process: per-session auth isolation,
  auto-reconnect w/ backoff, state tracking.
- Engine self-tests: `test/engines.test.js` (`npm test`).
- Deliberately **skipped**: Message Transaction Engine (rollback/idempotency) —
  WA messages already sent cannot be rolled back; YAGNI.

## 0.1.0 — first public release as `bexx`

- Rename dari `@levvsync/baileys` → `bexx`.
- **VoIP two-way:** tambahkan `rejectCall()`, `hangUp()`, `toggleMic()`,
  `toggleCamera()`, dan event `callstate` di `BexxVoIPClient`
  (sebelumnya cuma outbound + `acceptCall`).
- **Helper baru** di `lib/cjs/Utils/bexx-extras.js`:
  - `sendScheduledMessage(sock, jid, msg, { delaySeconds })`
  - `makeScheduledSend(sock)` → closure
  - `replyStatus(sock, statusJid, text)`
  - `makeStatusReply(sock)` → closure
- Alias lama `LevviVoIPClient` / `createLevviVoIP` dipertahankan (backward compat).
- `package.json`: nama `bexx`, author `ZarOffc11`, repo `ZarOffc11/bexx`.
- `libsignal` di-upgrade ke `^6.0.0` (track upstream).

## 0.0.5 — fork dari @levvsync/baileys

- WAProto bundle (15 MB) dengan WASM + binary.
- Wrapper VoIP `LevviVoIPClient` (outbound).
- CJS output untuk seluruh `lib/`.
