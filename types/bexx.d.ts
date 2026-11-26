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
 export function makeVoipClient(sock: BexxSocket, config?: Record<string, unknown>): Promise<any>;
 export function makeBexxVoIP(sock: BexxSocket, config?: Record<string, unknown>): Promise<any>;
 export function useMultiFileAuthState(folder: string): Promise<{ state: any; saveCreds: () => void }>;

 // The default export of bexx is the module namespace itself (CJS).
 export default { makeWASocket, useMultiFileAuthState, makeVoipClient, makeBexxVoIP };
}
