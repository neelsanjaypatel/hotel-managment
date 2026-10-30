import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Owner sign-in with Google (OAuth authorization code flow with PKCE).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. APP_URL fixes the address sent to Google;
// behind Caddy the request itself only sees 127.0.0.1.
export const FLOW_COOKIE = "hm_google";
export const FLOW_COOKIE_PATH = "/auth/google";

export type Flow = { state: string; verifier: string; nonce: string; mode: "login" | "connect" };

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const appOrigin = (req: Request) => process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;

const random = () => randomBytes(32).toString("base64url");

export function newFlow(mode: Flow["mode"]): Flow {
  return { state: random(), verifier: random(), nonce: random(), mode };
}

export function authorizeUrl(flow: Flow, redirectUri: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// The id_token comes straight from Google over TLS here, so its signature need not be
// checked again; the claims still are.
export async function exchangeCode(code: string, flow: Flow, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
  });
  if (!res.ok) return null;
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    iss?: string; aud?: string; exp?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean;
  };
  const issuerOk = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  const valid = issuerOk && c.aud === process.env.GOOGLE_CLIENT_ID && c.nonce === flow.nonce && (c.exp ?? 0) * 1000 > Date.now();
  if (!valid || !c.sub || !c.email || !c.email_verified) return null;
  return { sub: c.sub, email: c.email };
}
