import { describe, it, expect } from "bun:test";
import { createInMemoryTokenBlacklist } from "../../src/infrastructure/security/token-blacklist.js";

describe("InMemory TokenBlacklist", () => {
  it("reports token as not blacklisted initially", async () => {
    const bl = createInMemoryTokenBlacklist();
    const result = await bl.isBlacklisted("abc");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  it("blacklists a token", async () => {
    const bl = createInMemoryTokenBlacklist();
    await bl.add("token-hash", Date.now() + 60_000);

    const result = await bl.isBlacklisted("token-hash");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  it("auto-removes expired tokens on read", async () => {
    const bl = createInMemoryTokenBlacklist();
    await bl.add("expired", Date.now() - 1000); // already expired

    const result = await bl.isBlacklisted("expired");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });
});
