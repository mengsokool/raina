import crypto from "node:crypto";

const ttlMs = 60_000;
const secret = () => process.env.WS_TICKET_SECRET || process.env.JWT_SECRET || "";

export function issueWsTicket(sessionToken: string) {
  if (!secret()) throw new Error("WS ticket signing is not configured");
  const body = Buffer.from(JSON.stringify({ token: sessionToken, exp: Date.now() + ttlMs })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyWsTicket(ticket: string | undefined): string | null {
  if (!ticket || !secret()) return null;
  const [body, signature, ...extra] = ticket.split(".");
  if (!body || !signature || extra.length) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { token?: string; exp?: number };
    return payload.exp && payload.exp >= Date.now() && /^[a-f0-9]{64}$/i.test(payload.token || "") ? payload.token! : null;
  } catch { return null; }
}
