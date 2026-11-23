import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const CONTEXT = "rideops-session-v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_SECRET_LENGTH = 32;
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), CONTEXT, 32));
}

export const isSessionConfigured = () => sessionKey() !== null;

/** Returns null when the session secret is missing or too short. */
export function sealSession(accessCode: string, now = Date.now()): string | null {
  const key = sessionKey();
  if (!key) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(CONTEXT));
  const payload = JSON.stringify({ code: accessCode, exp: now + SESSION_TTL_SECONDS * 1000 });
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

const decode = (value: string) =>
  /^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, "base64url") : null;

/** Returns the access code, or null for any invalid, tampered or expired value. */
export function openSession(sealed: string | undefined, now = Date.now()): string | null {
  const key = sessionKey();
  if (!key || !sealed) return null;
  const [version, ivText, ciphertextText, tagText, ...rest] = sealed.split(".");
  if (version !== VERSION || !ivText || !ciphertextText || !tagText || rest.length > 0) return null;
  const iv = decode(ivText);
  const ciphertext = decode(ciphertextText);
  const tag = decode(tagText);
  if (iv?.length !== IV_BYTES || tag?.length !== TAG_BYTES || !ciphertext) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(CONTEXT));
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload: unknown = JSON.parse(text);
    if (typeof payload !== "object" || payload === null) return null;
    const { code, exp } = payload as { code?: unknown; exp?: unknown };
    if (typeof code !== "string" || !code || typeof exp !== "number" || exp <= now) return null;
    return code;
  } catch {
    return null;
  }
}
