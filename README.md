# bexx

WhatsApp Web API untuk Node.js dengan output CommonJS, akses WAProto langsung,
wrapper VoIP (`BexxVoIPClient`), dan helper baru: **scheduled-message**,
**status-reply**, dan **bloks-widget / A2UI** — di atas fork `WhiskeySockets/Baileys`
7.0.0-rc14.

```bash
npm install bexx
```

## Kenapa bexx

| Fitur | Baileys upstream (rc14) | bexx |
|---|---|---|
| Output | ESM | ESM **+ CJS** (`require`-able) |
| WAProto | text `.proto` + generated JS | bundle `.cjs` 15 MB (WASM + binary) — ready pakai |
| VoIP | tidak ada | `BexxVoIPClient` + `makeBexxVoIP` (outbound + two-way) |
| Scheduled message | util ada, socket tidak dibungkus | `sendScheduledMessage(sock, jid, msg, { delaySeconds })` |
| Status reply | proto `StatusQuotedMessage` saja | `replyStatus(sock, statusJid, text)` |
| A2UI / BloksWidget | schema ada, contoh minim | contoh + guide di README |

## Import

```js
// CommonJS
const { makeWASocket, proto, makeBexxVoIP, sendScheduledMessage, replyStatus } = require('bexx')

// WAProto saja
const { proto } = require('bexx/WAProto')
```

## Socket dasar

```js
const sock = makeWASocket({ logger: pino({ level: 'silent' }) })

sock.ev.on('connection.update', ({ status }) => {
  if (status === 'open') console.log('connected')
})

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) console.log('in:', m.key.remoteJid, m.message?.conversation)
})

// kirim teks
await sock.sendMessage('628xxxxxxxx@s.whatsapp.net', { text: 'hai' })
```

## VoIP — two-way

```js
const voip = await makeBexxVoIP(sock, { debug: true })

// telepon
const call = await voip.call('628xxxxxxxx@s.whatsapp.net', {
  video: true,
  playlist: ['./intro.mp3'],
  durationMs: 120000
})

call.on('connected', () => console.log('connected'))
call.on('audio', pcm => { /* pcm dari lawan */ })
call.on('ended', reason => console.log('ended:', reason))

// kontrol
voip.toggleMic(false)        // mute
voip.toggleCamera(true)      // on cam / screen
voip.acceptCall()            // terima panggilan masuk
voip.rejectCall()           // tolak
voip.hangUp()                // sama dengan rejectCall, alias

// event callstate dari wrapper (bukan cuma internal _state)
voip.on('callstate', ({ state, name }) => console.log('call state:', name))
```

Metode publik `BexxVoIPClient`:

| Metode | Efek |
|---|---|
| `call(jid, opts)` | mulai panggilan (audio/video) |
| `callGroup(jid, opts)` | mulai panggilan grup |
| `joinGroupCall(invite, opts)` | gabung panggilan grup yang sudah berjalan |
| `acceptCall(micOn)` | terima panggilan masuk |
| `rejectCall()` | tolak / akhiri panggilan |
| `hangUp()` | alias `rejectCall()` |
| `toggleMic(on)` | mute / unmute |
| `toggleCamera(on)` | on / off camera (screen share) |
| `disconnect()` | hancurkan client + feeder |
| `resetCallState()` | reset state internal |

Event: `ringing`, `connected`, `ended(reason)`, `idle`, `callstate({state,name})`,
`audio(pcm)`, `videotrack`, `videotrackend`.

## Scheduled message

```js
const { sendScheduledMessage, makeScheduledSend } = require('bexx')

// satu kali
const meta = await sendScheduledMessage(sock, '628xxx@s.whatsapp.net', {
  text: 'Ingatkan: meeting jam 9'
}, { delaySeconds: 3600 })

console.log(meta.scheduledAtMs, meta.tag, meta.revealKeyId)

// buat "klien" khusus
const scheduled = makeScheduledSend(sock)
await scheduled('628xxx@s.whatsapp.net', { text: 'reminder' }, { delaySeconds: 600 })
```

`delaySeconds` minimum 60 detik (WA enforce). Payload pakai
`proto.Message.ScheduledCallCreationMessage` + reveal key AES-256-GCM (lihat
`Utils/scheduled-message.js`).

## Status reply

```js
const { replyStatus, makeStatusReply } = require('bexx')

await replyStatus(sock, '628xxx@s.whatsapp.net', 'makasih sudah reply status 😄')

// atau bind ke sock
const reply = makeStatusReply(sock)
await reply('628xxx@s.whatsapp.net', 'text', { quotedMsgId: 'msgId', mentionJid: '628xxx@s.whatsapp.net' })
```

## BloksWidget / A2UI

Schema `proto.Message.InteractiveMessage.BloksWidget` sudah ada. Contoh kirim:

```js
const a2ui = {
  catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
  components: [
    { id: 'heading', component: 'Text', text: 'Halo dari Bexx', variant: 'body' }
  ]
}

await sock.sendMessage(jid, {
  interactiveMessage: {
    body: { text: 'widget' },
    bloksWidget: { data: JSON.stringify(a2ui), type: 'im_a2ui' }
  }
})
```

Render bergantung versi klien WhatsApp.

## Newsletter / Channel

```js
await sock.newsletterCreate('Channel', 'Deskripsi channel')
await sock.newsletterFollow(jid, true)
await sock.newsletterFetchMessages(jid, { sinceMsgId: '' })
await sock.newsletterReactMessage(jid, msgId, '👍')
```

## WAProto langsung

```js
const { proto } = require('bexx/WAProto')
const msg = new proto.Message()
msg.conversation = 'halo'
await sock.relayMessage(jid, msg, { msgId: sock.generateMessageTag() })
```

Runtime WAProto pakai **protobufjs 8.8.x**. Jangan turun ke 7.

## API yang diwarisi dari Baileys

- `sendMessage`, `relayMessage`, `group*`, `community*`, `newsletter*`, `chat*`,
  `presence*`, `privacy*`, `business*`, `onWhatsApp`, `requestPairingCode`, dll.
- Lihat `lib/cjs/Socket/*.js` untuk daftar lengkap.

## Dependency

- `whatsapp-rust-bridge@0.5.5` (WASM engine VoIP)
- `libsignal` (fork Signal Protocol)
- `protobufjs@8.8.x`
- Node ≥ 20

Peer optional: `sharp`, `jimp`, `audio-decode`.

## Repo

https://github.com/ZarOffc11/bexx

## Lisensi

MIT
