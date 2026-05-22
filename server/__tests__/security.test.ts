import { describe, expect, it } from "vitest";
import { encryptSecret, maskSecret, decryptSecret } from "../lib/crypto";
import { isValidReferenceAssistantId } from "../lib/validation";

describe("assistant security helpers", () => {
  it("encrypts permanent tokens and masks saved values", () => {
    const encrypted = encryptSecret("EAAB-permanent-token");

    expect(encrypted).not.toContain("EAAB-permanent-token");
    expect(decryptSecret(encrypted)).toBe("EAAB-permanent-token");
    expect(maskSecret("EAAB-permanent-token")).toBe("EAAB*********oken");
  });

  it("accepts only UUID values as assistant references", () => {
    expect(isValidReferenceAssistantId("8b8658b7-20c2-4fd8-8a6a-727970a6f0be")).toBe(true);
    expect(isValidReferenceAssistantId("seller@example.com")).toBe(false);
    expect(isValidReferenceAssistantId("")).toBe(true);
  });
});
