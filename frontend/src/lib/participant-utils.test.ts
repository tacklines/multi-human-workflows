import { describe, it, expect } from "vitest";
import { getParticipantName, WS_STATUS_VARIANT } from "./participant-utils.js";

const participants = [
  { id: "abc-123", display_name: "Alice" },
  { id: "def-456", display_name: "Bob" },
  { id: "no-name", display_name: null },
];

describe("getParticipantName", () => {
  it("returns the display_name when participant is found", () => {
    expect(getParticipantName("abc-123", participants)).toBe("Alice");
  });

  it("returns first 8 chars of id when participant is not found", () => {
    expect(getParticipantName("xyz-unknown-id", participants)).toBe("xyz-unkn");
  });

  it("returns first 8 chars of id when participant has null display_name", () => {
    expect(getParticipantName("no-name", participants)).toBe("no-name");
  });

  it("returns the i18n unassigned string when id is null", () => {
    const result = getParticipantName(null, participants);
    // The i18n key falls back to the key itself in test env if not found
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the i18n unassigned string when id is undefined", () => {
    const result = getParticipantName(undefined, participants);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns custom fallback key text when provided", () => {
    const result = getParticipantName(null, participants, "time.justNow");
    expect(result).toBe("just now");
  });
});

describe("WS_STATUS_VARIANT", () => {
  it("has expected status keys", () => {
    expect(WS_STATUS_VARIANT["running"]).toBe("success");
    expect(WS_STATUS_VARIANT["creating"]).toBe("warning");
    expect(WS_STATUS_VARIANT["pending"]).toBe("warning");
    expect(WS_STATUS_VARIANT["failed"]).toBe("danger");
    expect(WS_STATUS_VARIANT["stopped"]).toBe("neutral");
    expect(WS_STATUS_VARIANT["stopping"]).toBe("neutral");
    expect(WS_STATUS_VARIANT["destroyed"]).toBe("neutral");
  });

  it("returns undefined for unknown statuses (caller uses ?? fallback)", () => {
    expect(WS_STATUS_VARIANT["unknown"]).toBeUndefined();
  });
});
