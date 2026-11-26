# bexx

WhatsApp Web API untuk Node.js. Fork `WhiskeySockets/Baileys` 7.0.0-rc14 dengan:
output **CommonJS**, akses **WAProto** langsung (bundle 15 MB siap pakai),
wrapper **VoIP two-way** (`BexxVoIPClient`), dan helper baru
**`sendScheduledMessage`** + **`replyStatus`**.

> ⚠️ Tidak terafiliasi dengan WhatsApp. Gunakan sesuai ToS — jangan spam.

```bash
npm install bexx
```

## Struktur paket

| Path | Isi |
|---|---|
| `bexx` | `makeWASocket` + semua Util/Type/Default/WABinary/WAM/WAUSync + VoIP + extras |
| `bexx/WAProto` | proto WA lengkap (256 top-level message, 40+ `Bot*`, 30+ `AI*`, dll) |

## Import

```js
// CommonJS — semua dalam satu baris
const {
  makeWASocket, proto,
  makeBexxVoIP, sendScheduledMessage, replyStatus
} = require('bexx')

// WAProto saja
const { proto } = require('bexx/WAProto')
```

---

## 1. Socket dasar

```js
const sock = makeWASocket({
  logger: pino({ level: 'silent' }),
 printQRInTerminal: false,
 auth: (await useMultiFileAuthState('auth')).state
})

sock.ev.on('connection.update', ({ connection, lastDisconnect, isNewLogin, qr }) => {
 if (isNewLogin) console.log('pairing baru, socket restart')
 if (connection === 'open') console.log('connected')
  if (status === 'close') {
 const banned = (lastDisconnect?.error?.output?.statusCode ?? 0) === 408
 if (!banned) console.log('bexx.stability auto-reconnects')
  }
})

sock.ev.on('messages.upsert', ({ messages, type }) => {
  for (const m of messages) console.log('in:', m.key.remoteJid, m.message?.conversation)
})

await sock.sendMessage('628xxx@s.whatsapp.net', { text: 'hai' })
```

### Method inti socket (`makeWASocket` return)

| Method | Fungsi |
|---|---|
| `sock.ev` | `EventEmitter` — semua event WA (lihat §3) |
| `sock.ws` | WebSocket mentah (`sendRawMessage`, dll) |
| `sock.authState` | `{ creds, keys }` — kredensial & sinyal |
| `sock.signalRepository` | repo sinyal (LID mapping, dll) |
| `sock.user` | getter — JID bot |
| `sock.generateMessageTag()` | buat tag pesan unik |
| `sock.query(node, timeoutMs?)` | query XMPP/USync mentah |
| `sock.waitForMessage(id, timeoutMs?)` | tunggu ack suatu node |
| `sock.sendNode(node)` | kirim stanza |
| `sock.sendRawMessage(data)` | kirim buffer mentah |
| `sock.sendWAMBuffer(buf)` | kirim WAM buffer |
| `sock.executeUSyncQuery(query)` | query USync (kontak, chat, dll) |
| `sock.onWhatsApp(...pn)` | cek nomor online/di WA |
| `sock.onWhatsAppUsername(...un)` | cek username |
| `sock.getUsernames(...jids)` | resolve JID → username |
| `sock.requestPairingCode(pn, code?)` | pairing code |
| `sock.logout(msg?)` | logout |
| `sock.end(error?)` | tutup socket |
| `sock.uploadPreKeys(n?)` | upload pre-key |
| `sock.digestKeyBundle()` / `rotateSignedPreKey()` | kunci sinyal |
| `sock.waitForSocketOpen()` / `waitForConnectionUpdate(cb)` | tunggu koneksi |
| `sock.fetchAccountReachoutTimelock()` / `fetchNewChatMessageCap()` | limit akun |
| `sock.registerSocketEndHandler(cb)` | hook saat socket berakhir |
| `sock.onUnexpectedError(err, msg)` | tangani error tak terduga |

---

## 2. Method per kelompok

Semua method di bawah **sudah ada di object `sock`** (di-merge dari modul
`Socket/*`). Contoh pemakaian: `sock.groupMetadata(jid)`.

### 2.1 Chat & profil & privacy (`Socket/chats.js`)

| Method | Fungsi |
|---|---|
| `sendMessage(jid, content, opts)` | kirim pesan apa pun |
| `relayMessage(jid, protoMsg, opts)` | relay `proto.Message` yang sudah kamu build |
| `upsertMessage(jid, msg, fromMe)` | paksa upsert pesan ke store |
| `fetchPrivacySettings()` | ambil setting privacy |
| `fetchBlocklist()` / `updateBlockStatus(jid, block)` | blocklist |
| `fetchStatus(jid)` / `updateProfileStatus(status)` | status |
| `updateProfileName(name)` / `updateProfilePicture(url)` / `removeProfilePicture()` | profil |
| `profilePictureUrl(jid)` | URL foto profil |
| `getUsername(jid)` / `setUsername(jid, u)` / `removeUsername(jid)` / `checkUsernameAvailability(u)` | username |
| `setUsernamePin(jid, pin)` / `removeUsernamePin(jid)` | pin username |
| `fetchDisappearingDuration(jid)` | mode disappear |
| `sendPresenceUpdate(presence, jid, to)` / `presenceSubscribe(jid)` | presence |
| `createCallLink(jid, opts)` | buat link panggilan |
| `reportFlow(jid, opts)` | laporan (spam/overflow menu) |
| `chatModify(jid, action)` | arsip/pin/mute chat |
| `addOrEditContact(c)` / `removeContact(jid)` | kontak |
| `addLabel(...)` / `addChatLabel` / `addMessageLabel` / `removeChatLabel` / `removeMessageLabel` | label |
| `star(jid, msgId, star)` | bintang pesan |
| `addOrEditQuickReply(text)` / `removeQuickReply(text)` | quick reply |
| `cleanDirtyBits(type, ts?)` / `resyncAppState(collections, isInitial?)` | app-state sync |
| `updateLastSeenPrivacy(v)` / `updateOnlinePrivacy(v)` / `updateProfilePicturePrivacy(v)` / `updateStatusPrivacy(v)` / `updateReadReceiptsPrivacy(v)` / `updateMessagesPrivacy(v)` / `updateCallPrivacy(v)` / `updateGroupsAddPrivacy(v)` / `updateDisableLinkPreviewsPrivacy(v)` / `updateDefaultDisappearingMode(v)` | granular privacy |
| `getBotListV2()` | daftar bot |

### 2.2 Grup (`Socket/groups.js`)

| Method | Fungsi |
|---|---|
| `groupMetadata(jid)` | metadata grup |
| `groupCreate(subject, participants)` | buat grup |
| `groupLeave(jid)` / `groupInviteCode(jid)` / `groupRevokeInvite(jid)` | kelola |
| `groupUpdateSubject(jid, s)` / `groupUpdateDescription(jid, d)` | ubah |
| `groupParticipantsUpdate(jid, participants, action)` | add/remove/promote/demote |
| `groupRequestParticipantsList(jid)` / `groupRequestParticipantsUpdate(jid, parts, action)` | approval mode |
| `groupAcceptInvite(code)` / `groupAcceptInviteV4(jid, code, hash)` / `groupGetInviteInfo(jid)` / `groupRevokeInviteV4(jid, hash)` | invite v4 |
| `groupJoinApprovalMode(jid, mode)` / `groupMemberAddMode(jid, mode)` | approval |
| `groupToggleEphemeral(jid, ms)` / `groupSettingUpdate(jid, key, value)` | ephemeral & setting |
| `groupFetchAllParticipating()` | semua grup bot |
| `groupInviteMessage(jid, code, opts)` | isi pesan invite |

### 2.3 Komunitas (`Socket/communities.js`)

| Method | Fungsi |
|---|---|
| `communityMetadata(jid)` / `communityCreate(subject, body)` / `communityLeave(jid)` | dasar |
| `communityCreateGroup(subject, participants, parentJid)` | grup anak |
| `communityLinkGroup(groupJid, communityJid)` / `communityUnlinkGroup(groupJid)` | link |
| `communityFetchLinkedGroups(communityJid)` | grup terkait |
| `communityParticipantsUpdate(jid, participants, action)` | anggota |
| `communityRequestParticipantsList/Update(jid, ...)` / `communityAcceptInvite(V4)` / `communityGetInviteInfo(jid)` | approval & invite |
| `communityRevokeInvite(V4)` / `communityJoinApprovalMode` / `communityMemberAddMode` | approval |
| `communityToggleEphemeral(jid, ms)` / `communitySettingUpdate(jid, key, v)` / `communityUpdateSubject/Description` | setting |
| `communityFetchAllParticipating()` | semua komunitas bot |

### 2.4 Bisnis / katalog (`Socket/business.js`)

| Method | Fungsi |
|---|---|
| `getBusinessProfile(jid)` / `updateBussinesProfile(data)` | profil bisnis |
| `getCatalog(jid)` / `getCollections(jid)` | katalog & koleksi |
| `productCreate(node)` / `productUpdate(jid, node)` / `productDelete(jid)` | produk |
| `getOrderDetails(jid, orderId)` | detail order |
| `updateCoverPhoto(photo)` / `removeCoverPhoto(id)` | foto sampul |

### 2.5 Newsletter / Channel (`Socket/newsletter.js`)

| Method | Fungsi |
|---|---|
| `newsletterCreate(name, desc?)` | buat channel |
| `newsletterUpdate(jid, updates)` | update metadata |
| `newsletterUpdateName(jid, n)` / `newsletterUpdateDescription(jid, d)` / `newsletterUpdatePicture(jid, img)` / `newsletterRemovePicture(jid)` | field spesifik |
| `newsletterMetadata('jid'\|'invite', key)` | ambil metadata |
| `newsletterFollow(jid)` / `newsletterUnfollow(jid)` / `newsletterMute(jid)` / `newsletterUnmute(jid)` | follow & notifikasi |
| `newsletterSubscribers(jid)` | daftar subscriber |
| `newsletterFetchMessages(jid, opts)` / `newsletterReactMessage(jid, msgId, emoji)` | pesan & reaksi |
| `newsletterDelete(jid)` / `newsletterChangeOwner(jid, newOwner)` / `newsletterDemote(jid)` / `newsletterAdminCount(jid)` | kepemilikan |

### 2.6 Terima pesan (`Socket/messages-recv.js`)

| Method | Fungsi |
|---|---|
| `downloadMediaMessage(msg)` | download media |
| `getFullMessage(msg)` | resolve semua ref (reply, quoted, dll) |
| `getMessage(msgId, opts)` | ambil pesan dari store |

---

## 3. Event (`sock.ev.on`)

| Event | Payload |
|---|---|
| `connection.update` | `{ connection: 'open'|'close'|'connecting', lastDisconnect?, isNewLogin?, qr? }` |
| `pairing.success` | `{ method: 'code'|'qr', me, registered }` - pairing HP baru sukses |
| `creds.update` | `{ myAppStateKeyId, noiseKey, ... }` |
| `messages.upsert` | `{ messages, type: 'notify'\|'append'\|'history'\|'unknown' }` |
| `messages.update` | `{ updates, type }` |
| `messages.delete` | `{ deletes, type }` |
| `messages.reaction` | `{ reactions }` |
| `messages.retry` | retry info |
| `chats.upsert` / `chats.update` / `chats.delete` | perubahan chat |
| `groups.upsert` / `groups.update` | grup |
| `contacts.upsert` / `contacts.update` | kontak |
| `presence.update` | `{ presences }` |
| `call` | data panggilan |
| `newsletter` / `newsletter.reaction` / `newsletter.view` | channel |
| `app.state` / `app-state-v1` | app-state sync |
| `keys` | kunci media |
| `protocol.message` / `protocol.action` | protocol message |

> Lihat `lib/cjs/Types/State.js` untuk definisi lengkap payload.

---

## 4. Kirim pesan — semua keluarga tombol/interaktif

`sendMessage(jid, content)` menerima object `proto.Message` atau shorthand.
Untuk payload yang belum punya shorthand, build `proto.Message` lalu
`relayMessage()`.

### 4.1 Shorthand `content` untuk `sendMessage`

| Field | Contoh |
|---|---|
| `text` | `{ text: 'halo' }` |
| `image` / `imageMessage` | `{ url, caption?, mentions?, jpegThumbnail? }` |
| `video` / `videoMessage` | `{ url, caption?, gifPlayback?, mentions? }` |
| `audio` / `audioMessage` | `{ url, ptt?, seconds? }` |
| `document` / `documentMessage` | `{ url, filename, caption?, mimetype? }` |
| `sticker` / `stickerMessage` | `{ url, exif? }` |
| `location` / `liveLocation` | `{ lat, lng, name? }` |
| `contact` / `contacts` | `{ contacts: [...] }` |
| `reaction` | `{ text, message }` |
| `poll` | `{ name, values, selectableCount? }` |
| `order` | `{ orders, currency, source: 'native_flow' }` |
| `product` | `{ product: {...} }` |
| `invite` | `{ code, groupJid? }` |
| `forward` | `{ message, ... }` |
| `template` / `buttons` / `list` / `carousel` | object sesuai schema di bawah |
| `status` | kirim ke status: `sock.sendMessage('status@broadcast', {...})` |

### 4.2 Keluarga `ButtonsMessage` (tombol teks)

```js
await sock.sendMessage(jid, {
  buttonsMessage: {
    text: 'Pilih',
    footer: 'footer',
    buttons: [
      { buttonText: 'Ya', buttonId: 'yes', type: 'response' },
      { buttonText: 'Buka', buttonId: 'https://x.co', type: 'url' },
      { buttonText: 'Telepon', buttonId: '628xxx', type: 'phone' }
    ]
  }
})
```

### 4.3 Keluarga `ListMessage` (list menu)

```js
await sock.sendMessage(jid, {
  listMessage: {
    title: 'Pilih',
    description: '',
    singleSelect: {
      options: [
        { rowId: '1', title: 'Opsi 1', description: '' },
        { rowId: '2', title: 'Opsi 2', description: '' }
      ],
      button: { text: 'Kirim', id: 'submit' }
    }
  }
})
```

### 4.4 Keluarga `TemplateMessage` (tombol hydrated)

```js
await sock.sendMessage(jid, {
  templateMessage: {
    hydratedTemplate: {
      content: { text: 'Pesan' },
      buttons: [
        { type: 'reply', reply: { id: '1', text: 'Tombol 1' } },
        { type: 'url', url: { text: 'Buka', url: 'https://x.co' } },
        { type: 'call', call: { text: 'Telepon', phoneNumber: '628xxx' } }
      ],
      footer: ''
    }
  }
})
```

### 4.5 `CarouselMessage`

```js
await sock.sendMessage(jid, {
  carouselMessage: {
    carousel: { cards: [ { /* InteractiveMessage */ }, { /* ... */ } ] },
    message: 'swipe'
  }
})
```

### 4.6 `BloksWidget` / A2UI (fitur distribusi)

```js
const a2ui = {
  catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
  components: [
    { id: 'h', component: 'Text', text: 'Halo Bexx', variant: 'body' }
  ]
}
await sock.sendMessage(jid, {
  interactiveMessage: {
    body: { text: 'widget' },
    bloksWidget: { data: JSON.stringify(a2ui), type: 'im_a2ui' }
  }
})
```

### 4.7 Raw WAProto (kontrol penuh)

```js
const { proto } = require('bexx/WAProto')
const msg = new proto.Message()
msg.conversation = 'halo lewat WAProto'
await sock.relayMessage(jid, msg, { msgId: sock.generateMessageTag() })
```

> `proto` punya **256 top-level message** termasuk `Bot*` (50+), `AI*` (30+),
> `EventInviteMessage`, `SplitPaymentMessage`, `MusicMessage`,
> `ScheduledCallCreation/EditMessage`, `GroupMembershipForm*`.

---

## 5. VoIP — two-way (`BexxVoIPClient`)

Wrapper `whatsapp-rust-bridge` + WASM. Bisa **menelepon** dan **mengendalikan**
panggilan (menerima/menolak/mute/camera).

```js
const voip = await makeBexxVoIP(sock, { debug: true })

const call = await voip.call('628xxx@s.whatsapp.net', {
  video: true, playlist: ['./intro.mp3'], durationMs: 120000
})
call.on('connected', () => console.log('connected'))
call.on('audio', pcm => { /* pcm lawan bicara */ })
call.on('ended', reason => console.log('ended:', reason))

voip.toggleMic(false)     // mute
voip.toggleCamera(true)   // on cam / screen
voip.acceptCall()         // terima masuk
voip.rejectCall()         // tolak / akhiri
voip.hangUp()             // alias rejectCall
voip.on('callstate', ({ state, name }) => console.log('call:', name))
```

| Method / event | Efek |
|---|---|
| `call(jid, opts)` | mulai panggilan (audio/video, playlist, duration) |
| `callGroup(jid, opts)` | panggilan grup |
| `joinGroupCall(invite, opts)` | gabung panggilan grup berjalan |
| `acceptCall(micOn?)` | terima panggilan masuk |
| `rejectCall()` | tolak / akhiri |
| `hangUp()` | alias `rejectCall()` |
| `toggleMic(on)` | mute / unmute |
| `toggleCamera(on)` | on / off camera (screen share) |
| `disconnect()` | hancurkan client + feeder |
| `resetCallState()` | reset state |
| `call.on('ringing'\|'connected'\|'ended'\|'idle'\|'audio'\|'videotrack')` | event panggilan |
| `voip.on('callstate', ({state,name}))` | state mesin (Idle/Calling/Active/…) |

`CallState`: `Idle(0) Calling(1) PreacceptReceived(2) ReceivedCall(3) AcceptSent(4)
AcceptReceived(5) Active(6) ActiveElsewhere(7) Ending(13)`.

> Alias lama `LevviVoIPClient` / `createLevviVoIP` masih tersedia (backward compat).

---

## 6. Helper baru — scheduled message & status reply

Ditambah di `lib/cjs/Utils/bexx-extras.js`, di-export dari `require('bexx')`.

### 6.1 Scheduled message

```js
const { sendScheduledMessage, makeScheduledSend } = require('bexx')

// satu kali
const meta = await sendScheduledMessage(sock, '628xxx@s.whatsapp.net', {
  text: 'Ingatkan: meeting jam 9'
}, { delaySeconds: 3600 })
// meta = { scheduledAtMs, tag, revealKeyId, revealKey, delaySeconds, ack }

// closure
const scheduled = makeScheduledSend(sock)
await scheduled('628xxx@s.whatsapp.net', { text: 'reminder' }, { delaySeconds: 600 })
```

`delaySeconds` minimum **60 detik** (WA enforce). Payload pakai
`proto.Message.ScheduledCallCreationMessage` + reveal key AES-256-GCM
(lihat `Utils/scheduled-message.js`).

### 6.2 Status reply

```js
const { replyStatus, makeStatusReply } = require('bexx')

await replyStatus(sock, '628xxx@s.whatsapp.net', 'makasih sudah reply status')

const reply = makeStatusReply(sock)
await reply('628xxx@s.whatsapp.net', 'text', {
  quotedMsgId: 'msgId',
  mentionJid: '628xxx@s.whatsapp.net'
})
```

Pakai `proto.Message.StatusQuotedMessage`.

---

## 7. WAProto langsung

```js
const { proto } = require('bexx/WAProto')
console.log(Object.keys(proto.Message).slice(0, 10)) // 'conversation','imageMessage',...
```

- Runtime: **protobufjs 8.8.x** (jangan turun ke 7).
- File: `lib/WAProto/index.cjs` (15 MB, WASM + binary + generated JS).
- 256 top-level message, termasuk `Bot*`, `AI*`, `Event*`, `GroupMembershipForm*`.

---

## 8. Util lain yang tersedia (di-export dari `require('bexx')`)

| Modul | Fungsi |
|---|---|
| `Utils/messages.js` | `downloadMediaMessage`, `extractMessageContent`, `generateWAMessage(FromContent)`, `getContentType`, `normalizeMessageContent`, `prepareWAMessageMedia`, `generateForwardMessageContent`, `extractUrlFromText`, dll |
| `Utils/rich-message.js` | `generateRichMessage` (AI rich response) |
| `Utils/modern-messages.js` | `prepareModernMessageContent`, `makeStatusMentionMessage`, `makeGroupStatusAttribution` |
| `Utils/scheduled-message.js` | `encodeScheduledMessage`, `decodeScheduledMessage`, `encryptWithRevealKey`, `buildConditionalRevealMessage` |
| `Utils/status-stickers.js` | `readStickers`, `messageSticker`, `buildMusicMessage`, `MusicMessageStyle` |
| `Utils/newsletter-status.js` | `makeNewsletterStatusFetcher`, `parseNewsletterStatusesResponse` |
| `Utils/username.js` | `validateUsername`, `displayUsername`, `stripUsernamePrefix`, `isUsernamePin` |
| `Utils/chat-utils.js` | `getBusinessMetadata`, `getNewsletterMetadata`, `toJid`, dll |
| `Utils/process-message.js` | `processMessage` |
| `Utils/link-preview.js` | `generateLinkPreview` |
| `Utils/crypto.js` | `encryptMessage`, `decryptMessage`, `hkdf` |
| `Utils/history.js` | `makeHistorySyncStore` |
| `Utils/event-buffer.js` | buffering event |
| `Types/*` | `Wid`, `Jid`, `Message`, `Call`, `ReportType`, `QueryIds`, `SyncState` |
| `Defaults/*` | `DEFAULTS`, `TimeMs`, `DICT_VERSION`, `WA_DEFAULT_EPHEMERAL` |
| `WABinary/*` | `getBinaryNodeChild`, `getBinaryNodeChildren`, `encodeBinaryNode`, `S_WHATSAPP_NET` |
| `WAUSync/*` | `USyncQuery`, protocol kontak/chat/LID |
| `Store/*` | `makeInMemoryStore` |

> Untuk daftar lengkap export tiap modul, jalankan:
> `node -e "Object.keys(require('bexx')).sort().forEach(k=>console.log(k))"`.

---

## 9. bexx Engines (queue / cache / media / scheduler / manager)

bexx adds native engines attached to `sock` (not just `sendMessage` wrappers).
All are opt-in via config and tested in `test/engines.test.js`.

```js
const { makeWASocket } = require('bexx')
const sock = makeWASocket({
  queue:    { concurrency: 4, ratePerSecond: 10, maxRetries: 4 },
  messages: { max: 5000, dedup: true },
  media:    { logger },
  schedule: { file: './jobs.json' },
 stability: { heartbeatIntervalMs: 30000, maxRetries: 8 }
})
```

### 9.1 `sock.queue` — priority message queue + retry
```js
await sock.queue.send(jid, { text: 'hi' }, { msgId, priority: 1 }) // 1=high
sock.queue.pause()            // stop sending
sock.queue.resume()           // resume (auto-resumes on reconnect)
sock.queue.abort(msgId)       // cancel a queued message
sock.queue.drain()            // wait until empty
sock.queue.metrics()          // { submitted, sent, failed, retried, dropped, ... }
// events: submit | sent | error | retry | abort | pause | resume | connection
```
Connection-aware: auto-pauses on socket `close`, auto-resumes on `open`.
Exponential backoff with jitter on connection errors (408/401/close).
Duplicate `msgId` sends are de-duplicated.

### 9.2 `sock.messages` — LRU cache + dedup
```js
sock.messages.set(msgId, msg, jid)
sock.messages.get(msgId, jid)
sock.messages.has(msgId, jid)
sock.messages.isDuplicate(msgId)   // true if already seen
sock.messages.metrics()
```
Inbound `messages.upsert` that were already seen get flagged `m._bexxDuplicate = true`
so your handler can skip re-processing. Bounded by `max` (no memory leak).

### 9.3 `sock.media` — smart media send
```js
// auto-detect source (Buffer | stream | file path | URL)
// MIME otomatis via modul `mime-types` (bukan tabel manual)
await sock.media.send(jid, '/path/to/video.mp4', { caption: 'vid' })
await sock.media.send(jid, { buffer: png, filename: 'a.png' })
await sock.media.send(jid, 'https://x.co/pic.jpg')
// image->imageMessage, video->videoMessage, audio->audioMessage,
// pdf/zip/...->documentMessage, webp->stickerMessage
```
MIME detection memakai modul standard `mime-types` (sudah jadi dependency),
bukan tabel hardcode — semua ekstensi dikenal otomatis.

### 9.4 `sock.stability` — connection watchdog (prioritas utama)
```js
sock.stability.health()
// { up, lastSeenAt, uptimeMs, retries, maxRetries, reconnecting, staleMs }
sock.stability.on('healthy', () => {})   // socket sehat lagi
sock.stability.on('unhealthy', () => {}) // socket mati
sock.stability.on('reconnect', () => {}) // barusan reconnect
```
Stability engine:
- **Auto-reconnect** dengan exponential backoff + jitter (anti thundering herd)
- **Heartbeat / keepalive** — deteksi socket "hanging", force-reconnect
- **Graceful degradation** — pause `sock.queue` otomatis saat unhealthy,
  resume saat sehat (pesan nggak masuk ke socket mati)
- **Banned detection** — status 408 tidak di-retry
- Monitor health via `sock.stability.health()`

### 9.5 `sock.schedule` — persistent scheduler (restart-safe)
```js
sock.schedule.add(jid, { text: 'reminder' }, { dueAt: Date.now() + 3600_000 })
sock.schedule.list()
sock.schedule.cancel(id)
sock.schedule.size
// jobs persist ke JSON file; pending jobs retry saat reconnect / setelah restart
```

### 9.6 `BaileysManager` — multi-session, satu process
```js
const { BaileysManager } = require('bexx')
const mgr = new BaileysManager(makeWASocket, { authDir: '.bexx-sessions' })
await mgr.create('account1')   // isolated auth per session
await mgr.create('account2')
console.log(mgr.states())      // { account1: 'open', account2: 'open' }
await mgr.closeAll()
```
Auto-reconnect dengan backoff, isolasi error per session.

> Tidak diimplementasikan: **Message Transaction Engine** (rollback/idempotency) —
> sengaja skip (YAGNI), karena pesan WA sudah terkirim tidak bisa di-rollback.

---

## 11. Catatan distribusi

- **Depen VoIP**: `whatsapp-rust-bridge@0.5.5` (WASM engine). Kalau WA mengubah
  format, rebuild WASM + selaraskan WAProto.
- **libsignal**: `^6.0.0` (track upstream).
- **Node** ≥ 20.
- Peer optional: `sharp`, `jimp`, `audio-decode`.
- `require('bexx')` memuat bundle WAProto 15 MB — normal. Untuk import ringan
  pakai `require('bexx/WAProto')` saja.

## 11b. Bexx engines — extension layer

Di luar API native Baileys, bexx menempel engine production di socket.
Semua **additive**: `sendMessage` lama tetap jalan. Detail + contoh di
`BEXX.md` dan di `test/engines.test.js` (self-test, `npm test`).

| Engine | API | Fungsi |
|---|---|---|
| Queue + Retry | `sock.queue` | kirim dgn prioritas, retry/backoff, pause/resume |
| Cache + Dedup | `sock.messages` | cache TTL/LRU + deteksi duplikat |
| Media | `sock.media` | deteksi source+MIME+type, upload via pipeline socket |
| Scheduler | `sock.schedule` | kirim terjadwal, persist ke disk (atomic) |
| Stability | `sock.stability` | auto-reconnect + heartbeat + degradasi graceful |
| **Inspector** | `sock.inspector` | capture protocol, redaction, diff |
| **Doctor** | `sock.doctor` | diagnose session, repair aman saja |
| **Harness** | `createBaileysTestHarness()` | record/replay deterministik + sim network |
| VoIP | `makeBexxVoIP(sock)` | relay call (WebRTC) |

```js
const bexx = require('bexx')
const sock = bexx.makeWASocket({ auth: state, printQRInTerminal: false })

await sock.queue.send(jid, { text: 'hi' }, { retries: 5 })
sock.inspector.enable()                    // capture protocol (redacted)
const d = await sock.doctor.check()        // HEALTHY | ... | REAUTH_REQUIRED

const t = bexx.createBaileysTestHarness()  // offline, deterministic
```

`sock.doctor` tidak pernah menghapus auth dir — kalau repair tidak aman,
ia melaporkan `SESSION_REAUTH_REQUIRED` dan berhenti.

## 12. Repo & lisensi

- GitHub: https://github.com/ZeroXinvictus/bexx
- Lisensi: MIT
- Berbasis: `WhiskeySockets/Baileys` 7.0.0-rc14
