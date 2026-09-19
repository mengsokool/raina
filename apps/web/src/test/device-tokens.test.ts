import { describe, it, expect } from "vitest";
import crypto from "crypto";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

describe("Device Token Security & Lifecycle Contract", () => {
  it("generates SHA-256 hash correctly for project tokens", () => {
    const rawToken = "tok_abc123xyz456_test";
    const hash = sha256(rawToken);

    expect(hash).toHaveLength(64);
    expect(sha256(rawToken)).toBe(hash);
    expect(sha256("tok_different")).not.toBe(hash);
  });

  it("verifies that revoked tokens are properly identified and rejected", () => {
    const activeTokenRecord = {
      id: "t_123",
      projectId: "proj_farm_01",
      hash: sha256("tok_valid_secret"),
      revokedAt: null,
      lastUsedAt: null,
    };

    const revokedTokenRecord = {
      id: "t_456",
      projectId: "proj_farm_01",
      hash: sha256("tok_revoked_secret"),
      revokedAt: BigInt(Date.now()),
      lastUsedAt: BigInt(Date.now() - 10000),
    };

    const isTokenValid = (record: typeof activeTokenRecord | null) => {
      if (!record || record.revokedAt !== null) return false;
      return true;
    };

    expect(isTokenValid(activeTokenRecord)).toBe(true);
    expect(isTokenValid(revokedTokenRecord)).toBe(false);
    expect(isTokenValid(null)).toBe(false);
  });
});
