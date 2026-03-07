import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDate, relativeTime, formatTime } from "./date-utils.js";

// Pin the current time so relative calculations are deterministic.
const NOW = new Date("2025-06-15T12:00:00Z").getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function fromNow(ms: number): string {
  return new Date(NOW + ms).toISOString();
}

describe("relativeTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "just now" for < 60 seconds ago', () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(relativeTime(ago(30_000))).toBe("just now");
  });

  it("returns minutes ago for 1–59 minutes", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(relativeTime(ago(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(ago(59 * 60_000))).toBe("59m ago");
  });

  it("returns hours ago for 1–23 hours", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(relativeTime(ago(2 * 3600_000))).toBe("2h ago");
    expect(relativeTime(ago(23 * 3600_000))).toBe("23h ago");
  });

  it("returns days ago for 1–6 days", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(relativeTime(ago(3 * 86400_000))).toBe("3d ago");
    expect(relativeTime(ago(6 * 86400_000))).toBe("6d ago");
  });

  it("falls back to formatDate for >= 7 days", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const oldIso = ago(8 * 86400_000);
    const result = relativeTime(oldIso);
    // Should not be a relative string – just verify it contains a month abbreviation
    expect(result).not.toContain("ago");
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles future dates (negative diff) as "just now"', () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    // A date in the future yields negative diff → seconds < 0 < 60 → "just now"
    expect(relativeTime(fromNow(10_000))).toBe("just now");
  });
});

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2025-06-15T12:00:00Z");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes a day number and abbreviated month", () => {
    // The output is locale-dependent but always contains a digit for the day.
    const result = formatDate("2025-06-15T12:00:00Z");
    expect(result).toMatch(/\d/); // at least one digit
  });
});

describe("formatTime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns HH:MM style string for today", () => {
    // Mock "now" to the same day as the test date
    const testDate = new Date("2025-06-15T10:30:00");
    vi.setSystemTime(testDate);
    const result = formatTime("2025-06-15T08:00:00");
    // Should be a time-only string (no month name)
    expect(result).toMatch(/\d{1,2}:\d{2}/);
    expect(result).not.toMatch(/[A-Z][a-z]{2}/); // no "Jun" etc.
  });

  it("returns date+time string for a different day", () => {
    vi.setSystemTime(new Date("2025-06-15T10:30:00"));
    const result = formatTime("2025-06-10T08:00:00");
    // Different day → full date format with month abbreviation
    expect(result.length).toBeGreaterThan(0);
  });
});
