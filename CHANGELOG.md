# Changelog

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
