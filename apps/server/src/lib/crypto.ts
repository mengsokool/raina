// At-rest sealing for integration configs (API keys, webhook URLs, bot tokens, auth secrets).
// Uses AES-256-GCM derived via HKDF-SHA-256 with a purpose-specific info string ('raina/encrypt/integration-config').
// Format: v1:<base64_iv>:<base64_ciphertext>

const ENC_VERSION = "v1";
const IV_BYTES = 12; // Standard AES-GCM IV length
const KEY_INFO_PREFIX = "raina/encrypt/";
const DEFAULT_SECRET = "raina-default-secret-key-change-in-production";

function getMasterSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || DEFAULT_SECRET;
}

async function deriveKey(secret: string, info: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("raina-encrypt-salt"),
      info: enc.encode(KEY_INFO_PREFIX + info),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function b64encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export async function encryptSecret(
  secret: string,
  plaintext: string,
  info: string
): Promise<string> {
  const key = await deriveKey(secret, info);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    )
  );
  return `${ENC_VERSION}:${b64encode(iv)}:${b64encode(ct)}`;
}

export async function decryptSecret(
  secret: string,
  payload: string,
  info: string
): Promise<string> {
  const [version, ivB64, ctB64] = payload.split(":");
  if (version !== ENC_VERSION || !ivB64 || !ctB64) {
    throw new Error("encrypted payload has unexpected shape");
  }
  const key = await deriveKey(secret, info);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as unknown as BufferSource },
    key,
    b64decode(ctB64) as unknown as BufferSource
  );
  return new TextDecoder().decode(pt);
}

const INTEGRATION_INFO = "integration-config";

/**
 * Seals an integration config object into an encrypted ciphertext string.
 */
export async function sealIntegrationConfig(config: unknown): Promise<string> {
  const secret = getMasterSecret();
  const jsonStr = JSON.stringify(config ?? {});
  return encryptSecret(secret, jsonStr, INTEGRATION_INFO);
}

/**
 * Opens an integration config.
 * If the stored value starts with 'v1:', it decrypts it.
 * If not, it falls back safely to returning the raw string (backward compatibility for legacy plaintext).
 */
export async function openIntegrationConfig(stored: string): Promise<string> {
  if (!stored) return "{}";
  if (!stored.startsWith(`${ENC_VERSION}:`)) {
    return stored; // legacy unsealed value
  }
  const secret = getMasterSecret();
  try {
    return await decryptSecret(secret, stored, INTEGRATION_INFO);
  } catch (err) {
    console.error("[crypto] Failed to decrypt integration config:", err);
    return "{}";
  }
}
