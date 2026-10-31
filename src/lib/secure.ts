import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Aadhaar numbers are encrypted before they reach the database, so a leaked backup does not expose
// them. DATA_KEY is 32 random bytes in base64, kept only in the server's environment. Losing it
// makes stored numbers unreadable; the last four digits stay available.
function key() {
  const k = Buffer.from(process.env.DATA_KEY ?? "", "base64");
  return k.length === 32 ? k : null;
}

export const canEncrypt = () => !!key();

export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key()!, iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(stored: string) {
  const [iv, tag, body] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key()!, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// 12 digits, not starting with 0 or 1, with a valid Verhoeff check digit: catches typing mistakes.
export function validAadhaar(n: string) {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  return [...n].reverse().reduce((c, d, i) => D[c][P[i % 8][Number(d)]], 0) === 0;
}

export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4}`;
