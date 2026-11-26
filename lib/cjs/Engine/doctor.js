"use strict";
// bexx Session Doctor — diagnoses auth/session health and repairs ONLY when
// safe. The core rule: if repair would risk logging the user out or wiping
// credentials, the doctor reports REAUTH_REQUIRED instead of touching
// anything. Read-mostly tool; it never auto-deletes the auth directory.
//
// Status ladder: HEALTHY > WARNING > RECOVERABLE > REAUTH_REQUIRED > CORRUPTED
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSessionDoctor = makeSessionDoctor;
Object.defineProperty(exports, "makeSessionDoctor", { enumerable: true, get: function () { return makeSessionDoctor; } });

const STATUS = Object.freeze({
 HEALTHY: "HEALTHY",
 WARNING: "WARNING",
 RECOVERABLE: "RECOVERABLE",
 REAUTH_REQUIRED: "REAUTH_REQUIRED",
 CORRUPTED: "CORRUPTED"
});

const ERROR_CODES = Object.freeze({
 SESSION_CORRUPTED: "SESSION_CORRUPTED",
 SESSION_REAUTH_REQUIRED: "SESSION_REAUTH_REQUIRED",
 SESSION_REPAIR_UNSAFE: "SESSION_REPAIR_UNSAFE",
 SESSION_HEALTHY: "SESSION_HEALTHY"
});

function makeSessionDoctor(sock, options = {}) {
 const creds = () => sock.authState?.creds ?? {};
 const keys = () => sock.authState?.keys ?? {};

 const checkAuth = () => {
 const c = creds();
 const ok = !!(c.me?.id || c.jid);
 return { label: "auth credentials", ok, detail: ok ? "me.jid present" : "no bot jid (not paired or creds wiped)" };
};

 const checkKeys = () => {
 const k = keys();
 const has = (name) => k[name] && (Array.isArray(k[name]) ? k[name].length > 0 : !!k[name]);
 const items = {
 prekeys: has("preKeys"),
 signedPreKeys: has("signedPreKey"),
 "session record": has("sessions"),
 "sender keys": has("senderKeys"),
 "app-state": has("appStateSyncKeys")
 };
 const failing = Object.entries(items).filter(([, ok]) => !ok).map(([n]) => n);
 return { label: "key material", ok: failing.length === 0, detail: failing.length ? "missing " + failing.join(", ") : "all key stores present", missing: failing };
};

 const checkConnection = () => {
 const online = sock.stability?.health?.().up ?? sock.ws?.isOpen === true;
 return { label: "live connection", ok: !!online, detail: online ? "socket open / stable" : "socket not open (pairing or dropped)" };
};

 const classify = (checks) => {
 const [auth, keys, conn] = checks;
 if (!auth.ok && !keys.ok) {
 return STATUS.CORRUPTED;
 }
 if (!auth.ok || (!keys.ok && keys.missing?.some(m => m !== "app-state"))) {
 return STATUS.REAUTH_REQUIRED;
 }
 if (!conn.ok) {
 return STATUS.WARNING;
 }
 if (keys.ok) {
 return STATUS.HEALTHY;
 }
 return STATUS.RECOVERABLE;
};

 const codeFor = (status) => {
 if (status === STATUS.HEALTHY) {
 return ERROR_CODES.SESSION_HEALTHY;
 }
 if (status === STATUS.RECOVERABLE) {
 return "SESSION_RECOVERABLE";
 }
 if (status === STATUS.WARNING) {
 return "SESSION_WARNING";
 }
 if (status === STATUS.REAUTH_REQUIRED) {
 return ERROR_CODES.SESSION_REAUTH_REQUIRED;
 }
 return ERROR_CODES.SESSION_CORRUPTED;
};

 const diagnose = () => {
 const checks = [checkAuth(), checkKeys(), checkConnection()];
 const status = classify(checks);
 const lines = checks.map(c => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`);
 lines.push("");
 lines.push("Diagnosis: " + (
 status === STATUS.HEALTHY ? "session healthy" :
 status === STATUS.RECOVERABLE ? "recoverable — safe repair available" :
 status === STATUS.WARNING ? "degraded but usable" :
 status === STATUS.CORRUPTED ? "corrupt — re-pair required" :
 "re-auth required"));
 return { status, code: codeFor(status), checks, summary: lines.join("\n") };
};

 const repair = async (confirm = false) => {
 const d = diagnose();
 if (d.status === STATUS.HEALTHY) {
 return { repaired: false, status: d.status, note: "nothing to repair" };
}
 if (d.status === STATUS.REAUTH_REQUIRED || d.status === STATUS.CORRUPTED) {
 return { repaired: false, status: d.status, code: ERROR_CODES.SESSION_REAUTH_REQUIRED, note: "repair would risk logout/credential loss — re-pairing required. The doctor will not wipe auth state without explicit confirmation." };
}
 if (d.status === STATUS.WARNING || d.status === STATUS.RECOVERABLE) {
 if (!confirm) {
 return { repaired: false, status: d.status, code: ERROR_CODES.SESSION_REPAIR_UNSAFE, note: "pass { confirm: true } to authorize the safe repair (re-upload pre-keys / rotate signed pre-key)" };
}
 const actions = [];
 try {
 if (sock.uploadPreKeys) {
 await sock.uploadPreKeys();
 actions.push("re-uploaded pre-keys");
 }
 if (sock.rotateSignedPreKey) {
 await sock.rotateSignedPreKey();
 actions.push("rotated signed pre-key");
 }
}
catch (err) {
 return { repaired: false, status: STATUS.REAUTH_REQUIRED, code: ERROR_CODES.SESSION_REAUTH_REQUIRED, note: "safe repair failed: " + err.message };
}
 return { repaired: true, status: STATUS.HEALTHY, actions };
}
 return { repaired: false, status: d.status, note: "no safe repair path" };
};

 return {
 status: STATUS,
 check: async () => diagnose(),
 diagnose,
 repair,
 metrics: () => {
 const d = diagnose();
 return { status: d.status, code: d.code };
 }
};
}
