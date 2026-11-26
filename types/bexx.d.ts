// bexx public API — type surface for the bexx extension layer.
//
// bexx is a Baileys fork: every native Baileys API (sendMessage, ev, ws, ...)
// is inherited and re-exported unchanged, so we do NOT retype the whole Baileys
// surface here. We type the bexx-specific engines that bexx attaches to the
// socket plus the top-level factory, and fall back to `any` for the rest.
//
// Install consumers: `import * as bexx from "bexx"` or `require("bexx")`.
// Add this file via `types` in bexx's package.json.

declare module "bexx" {
 import type { EventEmitter } from "node:events";

 export type DisconnectReason = number;

 export interface WAMessage {
 key?: { id?: string; remoteJid?: string; fromMe?: boolean };
 [k: string]: unknown;
}
 export interface WAMessageContent {
 [k: string]: unknown;
}

 // ---- engines attached to the socket (bexx-native, additive) ----

 export interface BexxQueue {
 send(jid: string, content: WAMessageContent | string, options?: {
 priority?: "high" | "normal" | "low";
 retries?: number;
 timeout?: number;
 msgId?: string;
 }): Promise<{ key: { id: string; remoteJid: string }; [k: string]: unknown }>;
 pause(): void;
 resume(): void;
 cancel(id?: string): void;
 metrics(): { pending: number; running: number; completed: number; failed: number; retried: number };
}

 export interface BexxMessageCache {
 get(id: string): WAMessage | undefined;
 has(id: string): boolean;
 isDuplicate(id: string): boolean;
 set(id: string, message: WAMessage): void;
 delete(id: string): void;
 clear(): void;
 metrics(): { size: number; limit: number; ttlMs: number; duplicates: number };
}

 export interface BexxMediaEngine {
 send(
 jid: string,
 source: Buffer | Uint8Array | NodeJS.ReadableStream | string,
 options?: { caption?: string; mimeType?: string; filename?: string; sticker?: boolean }
 ): Promise<{ key: { id: string }; [k: string]: unknown }>;
}

 // ---- Rich / GenAI message builders (sock.rich) ----
export type RichMediaSource = Buffer | Uint8Array | NodeJS.ReadableStream | string;
export interface RichAction {
label?: string;
url?: string;
type?: string;
cta_text?: string;
cta_type?: string;
cta_url?: string;
}
export interface RichProduct {
title: string;
brand?: string;
price?: string;
sale_price?: string;
product_url?: string;
image?: string;
}
export interface RichCardSpec {
text?: string;
title?: string;
response_id?: string;
tip?: string;
inline_entities?: unknown[];
code?: string | { language?: string; code: string };
table?: { title?: string; rows: unknown[][] };
html?: string;
image?: string;
images?: string[];
imageV2?: string | { url: string; mime?: string; preview?: string; full?: string };
hscroll?: unknown[];
video?: string;
product?: RichProduct;
products?: RichProduct[];
post?: unknown[];
reels?: unknown[];
sources?: unknown[];
suggestions?: string[];
buttons?: RichAction[];
footer?: string | RichAction[] | Record<string, unknown>;
footerActionV2?: RichAction[];
}
export interface BexxRichEngine {
text(value: string, opts?: { title?: string; tip?: string; inline_entities?: unknown[] }): RichCardSpec;
code(body: string, opts?: { language?: string; title?: string; tip?: string }): RichCardSpec;
image(url: string, opts?: { title?: string; tip?: string }): RichCardSpec;
gallery(urls: string[], opts?: { title?: string; tip?: string }): RichCardSpec;
table(headers: unknown[], rows: unknown[][], opts?: { title?: string; tip?: string }): RichCardSpec;
product(p: RichProduct, opts?: { title?: string; tip?: string }): RichCardSpec;
products(items: RichProduct[], opts?: { title?: string; tip?: string }): RichCardSpec;
buttons(items: RichAction[], opts?: { title?: string; tip?: string }): RichCardSpec;
latex(items: Array<{ expression: string; url?: string; width?: number; height?: number; font_height?: number; image_top_padding?: number }>, opts?: { title?: string; tip?: string }): RichCardSpec;
map(spec: { center?: { lat: number; lon: number } | string; annotations?: Array<{ latitude: number; longitude: number; title?: string; body?: string; annotationNumber?: number }>; latDelta?: number; lonDelta?: number; showInfoList?: boolean; centerZoomLevel?: number }, opts?: { title?: string; tip?: string }): RichCardSpec;
dynamic(spec: { url: string; type?: "IMAGE" | "GIF"; loopCount?: number }, opts?: { title?: string; tip?: string }): RichCardSpec;
inlineImage(spec: { url: string; text?: string; mime_type?: string }, opts?: { title?: string; tip?: string }): RichCardSpec;
search(items: Array<{ title: string; url: string; favicon?: string; image?: string; mime_type?: string }>, opts?: { title?: string; tip?: string }): RichCardSpec;
suggestions(items: string[], opts?: { title?: string; tip?: string }): RichCardSpec;
sources(items: unknown[], opts?: { title?: string; tip?: string }): RichCardSpec;
video(url: string, opts?: { title?: string; tip?: string }): RichCardSpec;
post(items: unknown[], opts?: { title?: string; tip?: string }): RichCardSpec;
reels(items: unknown[], opts?: { title?: string; tip?: string }): RichCardSpec;
html(payload: string, opts?: { title?: string; tip?: string }): RichCardSpec;
imageV2(url: string | { url: string; mime?: string; preview?: string; full?: string }, opts?: { title?: string; tip?: string }): RichCardSpec;
tip(value: string): RichCardSpec;
carousel(cards: Array<{ title?: string; header?: string; sections?: unknown[]; buttons?: Array<{ label?: string; state?: string; kind?: string }>; body_typename?: string }>, opts?: { title?: string }): RichCardSpec;
card(spec: RichCardSpec): RichCardSpec;
build(richMsg: RichCardSpec): Promise<{ messageContextInfo: Record<string, unknown>; botForwardedMessage: { message: Record<string, unknown> } }>;
send(sock: BexxSocket, jid: string, richMsg: RichCardSpec): Promise<{ key: { id: string } }>;
presets: {
hello(): RichCardSpec;
code(body: string, lang?: string): RichCardSpec;
product(p: RichProduct): RichCardSpec;
gallery(urls: string[], title?: string): RichCardSpec;
shop(items: RichProduct[], title?: string): RichCardSpec;
features(cards: Array<{ title?: string; sections?: unknown[]; buttons?: Array<{ label?: string }> }>, title?: string): RichCardSpec;
map(lat: number, lon: number, annotations?: Array<number | string | { latitude: number; longitude: number; title?: string; body?: string }>, title?: string): RichCardSpec;
latex(exprs: Array<string | { expression: string; url?: string }>, title?: string): RichCardSpec;
search(results: Array<{ title: string; url: string; favicon?: string; image?: string }>, title?: string): RichCardSpec;
};
}

// ---- Audio (sound) sticker engine (sock.audioSticker) ----
export interface AudioStickerSources {
sticker: RichMediaSource;
audio: RichMediaSource;
}
export interface AudioStickerResult {
ok: boolean;
size: number;
seconds: number | null;
key?: { id: string };
}
export interface BexxAudioStickerEngine {
send(
jid: string,
sources: AudioStickerSources,
options?: { seconds?: number; isAnimated?: boolean }
): Promise<AudioStickerResult>;
}

// ---- Message builder engine (sock.msg) ----
export interface BexxMessageBuilderEngine {
sendPoll(jid: string, name: string, options: Array<string | { text?: string; label?: string; locality?: string }>, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
react(key: { remoteJid?: string; id: string; fromMe?: boolean }, reaction?: string): Promise<{ key: { id: string } }>;
edit(key: { remoteJid?: string; id: string; fromMe?: boolean }, text: string): Promise<{ key: { id: string } }>;
sendContact(jid: string, name: string, number: string, opts?: { org?: string; note?: string }): Promise<{ key: { id: string } }>;
sendLocation(jid: string, lat: number, lon: number, label?: string, description?: string, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
sendOrder(jid: string, items: Array<{ productId?: string; price?: number; quantity?: number; img?: unknown; productName?: string }>, currency?: string, note?: string, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
sendPayment(jid: string, amount: number, currency?: string, note?: string, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
sendButtons(jid: string, text: string, buttons: Array<string | { text?: string; label?: string; id?: string; type?: number }>, opts?: { footer?: string }): Promise<{ key: { id: string } }>;
sendList(jid: string, title: string, sections: Array<{ title?: string; rows: Array<string | { rowId?: string; id?: string; title?: string; description?: string }> }>, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
sendMessageWithQuote(jid: string, content: Record<string, unknown>, quotedKey: { id: string; remoteJid?: string; fromMe?: boolean }, opts?: Record<string, unknown>): Promise<{ key: { id: string } }>;
getGroupMembers(jid: string): Promise<Array<{ id: string; jid?: string; lid?: string; promotedTimestamp?: number }>>;
pinMessage(key: { id: string; remoteJid?: string; fromMe?: boolean }): Promise<{ key: { id: string } }>;
unpinMessage(key: { id: string; remoteJid?: string; fromMe?: boolean }): Promise<{ key: { id: string } }>;
readReceipt(jid: string, key: { id: string }, type?: string): Promise<void>;
generateVCard(name: string, number: string, opts?: { org?: string; note?: string }): string;
}

export interface BexxScheduler {
 send(jid: string, content: WAMessageContent | string, options?: { at?: number | Date }): Promise<string>;
 list(): Array<{ id: string; jid: string; at: number; status: "pending" | "running" | "completed" | "failed" | "cancelled" }>;
 get(id: string): { id: string; jid: string; at: number; status: string } | undefined;
 cancel(id: string): boolean;
}

 export interface BexxStabilityEngine {
 health(): { up: boolean; lastError?: string; attempts?: number };
 stop(): void;
}

 export interface BexxInspectorOptions {
 direction?: "in" | "out" | "both";
 namespaces?: string[];
 tags?: string[];
 redact?: boolean;
 maxEvents?: number;
}
 export interface InspectorEventRecord {
 seq: number;
 id: string;
 direction: "in" | "out";
 timestamp: number;
 tag: string;
 namespace: string;
 attrs: Record<string, unknown>;
 size: number;
 duration: number;
 correlationId: string | null;
}
 export interface BexxProtocolInspector {
 enable(options?: BexxInspectorOptions): BexxProtocolInspector;
 disable(): BexxProtocolInspector;
 isEnabled(): boolean;
 clear(): BexxProtocolInspector;
 export(): InspectorEventRecord[];
 diff(prev?: unknown): Array<{ field: string; previous?: unknown; current?: unknown; status: "INFO" | "WARNING" | "BREAKING" }>;
 events(): InspectorEventRecord[];
 stop(): void;
 metrics(): { events: number; dropped: number; enabled: boolean; size: number };
}

 export type DoctorStatus = "HEALTHY" | "WARNING" | "RECOVERABLE" | "REAUTH_REQUIRED" | "CORRUPTED";
 export interface DoctorDiagnostic {
 status: DoctorStatus;
 code: string;
 checks: Array<{ label: string; ok: boolean; detail: string; missing?: string[] }>;
 summary: string;
}
 export interface DoctorRepairResult {
 repaired: boolean;
 status: DoctorStatus;
 code?: string;
 note?: string;
 actions?: string[];
}
 export interface BexxSessionDoctor {
 readonly status: Record<string, DoctorStatus>;
 check(): Promise<DoctorDiagnostic>;
 diagnose(): DoctorDiagnostic;
 repair(confirm?: boolean): Promise<DoctorRepairResult>;
 metrics(): { status: DoctorStatus; code: string };
}

 export interface BexxTestHarness {
 sock: any;
 fake: EventEmitter;
 emit(event: string, data: unknown): void;
 receive(event: string, data: unknown): void;
 record(): void;
 saveFixture(file: string): string;
 loadFixture(file: string): unknown[];
 replay(source: string | unknown[]): Promise<number>;
 expect(event: string, predicate?: (data: unknown) => boolean): Promise<boolean>;
 network: {
 disconnect(): void;
 reconnect(): void;
 latency(ms: number): void;
 };
 reset(): void;
}

 // ---- the socket returned by makeWASocket: native Baileys surface + bexx engines ----

 export interface BexxSocket extends EventEmitter {
 // bexx extension engines
 queue: BexxQueue;
 messages: BexxMessageCache;
 media: BexxMediaEngine;
 schedule: BexxScheduler;
 stability: BexxStabilityEngine;
 inspector: BexxProtocolInspector;
 doctor: BexxSessionDoctor;
rich: BexxRichEngine;
audioSticker: BexxAudioStickerEngine;
msg: BexxMessageBuilderEngine;
/** Native Baileys spam-flow report (also sock.reportBlockList, sock.updateBlockStatus exist). */
reportFlow(jid: string, options?: { type?: string; source?: string; subject?: string; isKnownChat?: boolean }): Promise<{ jid: string; type: string; reported: boolean; node: unknown }>
 // native Baileys surface (inherited; typed loosely on purpose)
 ev: EventEmitter;
 ws: any;
 authState: any;
 user: any;
 sendMessage(jid: string, content: WAMessageContent, options?: Record<string, unknown>): Promise<{ key: { id: string; remoteJid?: string }; [k: string]: unknown }>;
 sendNode(node: any, ...rest: unknown[]): Promise<any>;
 query(node: any, timeoutMs?: number): Promise<any>;
 generateMessageTag(): string;
 logout(): Promise<void>;
 end(error?: Error): Promise<void>;
 requestPairingCode(): Promise<string>;
 [k: string]: any;
}

 export interface BexxMakeWASocketOptions {
 auth?: any;
 logger?: any;
 printQRInTerminal?: boolean;
 media?: Record<string, unknown>;
 queue?: Record<string, unknown>;
 messages?: Record<string, unknown>;
 schedule?: Record<string, unknown>;
 stability?: Record<string, unknown>;
 inspector?: BexxInspectorOptions;
 doctor?: Record<string, unknown>;
 browser?: any;
 version?: any;
 [k: string]: unknown;
}

 // ---- factories ----
 export function makeWASocket(options?: BexxMakeWASocketOptions): BexxSocket;
 export function makeSessionDoctor(sock: BexxSocket, options?: Record<string, unknown>): BexxSessionDoctor;
 export function makeProtocolInspector(sock: BexxSocket, options?: BexxInspectorOptions): BexxProtocolInspector;
 export function createBaileysTestHarness(options?: { latencyMs?: number; expectTimeoutMs?: number }): BexxTestHarness;
export function makeRichEngine(sock?: BexxSocket, options?: Record<string, unknown>): BexxRichEngine;
export function makeAudioStickerEngine(sock: BexxSocket, options?: Record<string, unknown>): BexxAudioStickerEngine;
export function makeMessageBuilderEngine(sock: BexxSocket, options?: Record<string, unknown>): BexxMessageBuilderEngine;
 export function makeVoipClient(sock: BexxSocket, config?: Record<string, unknown>): Promise<any>;
 export function makeBexxVoIP(sock: BexxSocket, config?: Record<string, unknown>): Promise<any>;
 export function useMultiFileAuthState(folder: string): Promise<{ state: any; saveCreds: () => void }>;

 // The default export of bexx is the module namespace itself (CJS).
 export default { makeWASocket, useMultiFileAuthState, makeVoipClient, makeBexxVoIP };
}
