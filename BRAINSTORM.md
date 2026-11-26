# bexx v2 brainstorm — features + system optimization

## bexx base

- bexx = CommonJS fork of **Baileys 6.x** (libsignal ^6, WAProto, WAM, WAUSync)
- Upstream Baileys now at **7.0.0-rc14** (ESM, no libsignal yet, Rust app-state sync)
- bexx already has: 11 engines (queue/cache/media/scheduler/manager/stability/inspector/doctor/harness/rich/audioSticker) + VoIP relay-transport
- bexx is **NOT** a thin wrapper — it's the full Baileys socket layer, just CommonJS + bexx extensions

## What bexx already has (don't re-build)

| Area | Status |
|---|---|
| `sendMessage` (all types via content keys) | ✓ pollCreation, reactionMessage, orderMessage, buttonsMessage, listMessage, contactMessage, locationMessage all routed through generic `sendMessage` |
| Group: create/leave/updateSubject/updateDescription/participantsUpdate/invite/revokeInvite/acceptInvite | ✓ in `groups.js` |
| `fetchMessageHistory` | ✓ in `messages-recv.js` |
| `updateProfilePicture` | ✓ in `chats.js` |
| Newsletter (v2) | ✓ in `newsletter.js` |
| mex (LID mapping) | ✓ in `mex.js` |
| placeholderResendCache | ✓ in `chats.js` |
| `fetchLatestBaileysVersion` | ✓ (fetches from upstream master) |
| `generateRichMessage` (all primitives) | ✓ |
| Audio sticker | ✓ (bexx-native) |
| VoIP relay-transport | ✓ |
| In-memory store | ✓ (`Store/make-in-memory-store.js`) |

## What's missing (candidates for bexx v2)

### Tier 1 — high-value, low-effort (wrap existing socket methods)

1. **`sock.sendPoll(jid, name, options, opts)`**
   `sendMessage` already routes `pollCreationMessageV5` — just add a friendly wrapper that takes `(name, options[], pollType, selectableCount)` and builds the proto. No new socket code, just a builder + send.

2. **`sock.react(jid, msgId, reaction)`**
   `sendMessage` already handles `reactionMessage` — add a one-liner wrapper `sock.react(key, '👍')` that builds `{ reactionMessage: { key, text } }` and sends.

3. **`sock.editMessage(key, newText)`**
   `generateWAMessageContent` already reads `content.editrich` — add `sock.edit(key, text)` that wraps `{ richMessage: { editrich: { text } } }`. For plain text, build a `extendedTextMessage` edit.

4. **`sock.sendContact(jid, name, number)` / `sock.sendLocation(jid, lat, lon, label)`**
   `sendMessage` already routes `contactMessage` / `locationMessage` — add friendly builders.

5. **`sock.sendOrder(jid, items, currency, note)` / `sock.sendPayment(jid, amount, currency, note)`**
   `sendMessage` already routes `orderMessage` / `paymentRequestMessage` — add builders.

6. **`sock.sendButtons(jid, text, buttons)` / `sock.sendList(jid, title, sections)`**
   `sendMessage` already routes `buttonsMessage` / `listMessage` — add builders.

7. **`sock.getGroupMembers(jid)`**
   `groupMetadata(jid)` already returns member list — just expose it under a clearer name.

8. **`sock.fetchProfilePicture(jid, type)`**
   `updateProfilePicture` exists, but no `fetchProfilePicture`. Add a GET query for the ppic binary.

### Tier 2 — medium-effort, real new features

9. **`sock.resendMessage(key)`**
   `placeholderResendCache` exists in bexx, but there's no user-facing `resendMessage` that takes a key and triggers a resend via the placeholder-resend mechanism. Add it.

10. **`sock.sendMessageWithQuote(jid, content, quotedKey, opts)`**
    Convenience wrapper: builds `contextInfo` with `quotedMessage` from a cached key. `sendMessage` already supports `contextInfo` — just auto-wire the quoted message from `sock.messages.get(quotedKey)`.

11. **`sock.sendGroupInvite(jid, inviteCode)` / `sock.joinGroup(inviteCode)`**
    `groupAcceptInvite(code)` exists but is buried. Re-export as `sock.joinGroup(code)`.

12. **`sock.pinMessage(key)` / `sock.unpinMessage(key)`**
    `pinInChatMessage` is already in `normalizeMessageContent`. Add a wrapper.

13. **`sock.markMessageAsRead(jid, key, type)`**
    `sendReceipt` exists internally. Expose a user-facing `sock.readReceipt(jid, key, 'READ')`.

### Tier 3 — system optimization (perf + stability)

14. **LRU cache for group metadata**
    `groupMetadata` does a network query every time. Add a `lru-cache` (bexx already has `lru-cache` as a dep) with 5-min TTL so repeated calls for the same group are free.

15. **Batched message sending**
    Currently each `sendMessage` is a separate relay. For bulk-scheduling (scheduler engine), batch N messages into a single `sendNode` call to reduce round-trips. Add `sock.queue.batchSend(jids, content, opts)` that groups by target.

16. **Memory leak guard**
    bexx's `stability` engine does reconnect, but the `messages` cache is unbounded in practice (only `max` option, no eviction when exceeded). Add actual LRU eviction when `size > max` (currently just rejects new entries).

17. **Connection health metrics**
    `sock.stability.health()` exists. Add `sock.stability.metrics()` that tracks: reconnects per hour, avg reconnect delay, ws ping/pong latency, last message timestamp. Useful for dashboards.

18. **Graceful shutdown**
    `sock.end()` exists but doesn't flush pending queue items or close ws cleanly. Add `sock.end({ flushQueue: true })` that drains the queue before closing.

19. **App-state sync resilience**
    Upstream rc14 added "resilient app state" + Rust app-state sync. bexx (6.x base) still uses JS app-state. Add a `sock.appState.diagnose()` that checks key count, last sync time, and warns if stale.

### Tier 4 — new engine (high value)

20. **`sock.mediaThumbnails`** — auto-generate image/video thumbnails with `sharp` or `jimp` before upload (upstream Baileys does this when `sharp` is installed; bexx doesn't have a wrapper).

21. **`sock.disappearingMessages`** — set/get disappearing message duration per-chat. `updateDisappearingMessages` exists in `messages-send.js` but isn't exposed cleanly.

22. **`sock.statusSticker`** — send a status update with a sticker/media. `sendStatus` exists; add a `sendStatusSticker(jid, sticker, audio?)` that combines status + sticker.

## Recommended order (ship fast)

**v0.6.0** — Tier 1 (all 8 wrappers, ~200 lines total, no new deps)
**v0.6.1** — Tier 2 (5 more wrappers + resendMessage + quoted send)
**v0.6.2** — Tier 3 (LRU group cache + batch send + LRU eviction + metrics + graceful shutdown)
**v0.7.0** — Tier 4 (mediaThumbnails + disappearingMessages + statusSticker)
