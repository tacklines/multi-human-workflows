import { describe, it, expect, vi, beforeEach } from "vitest";
import { wrapText, roundRect } from "./graph-card-renderer.js";

// ─── wrapText ───

describe("wrapText", () => {
  /**
   * Build a minimal CanvasRenderingContext2D mock where measureText returns
   * the character count as the width (1 unit per character). This keeps test
   * arithmetic simple and deterministic.
   */
  function makeCtx(charWidth = 1): CanvasRenderingContext2D {
    return {
      measureText: (text: string) => ({ width: text.length * charWidth }),
      font: "",
    } as unknown as CanvasRenderingContext2D;
  }

  it("returns a single line when text fits within maxWidth", () => {
    const ctx = makeCtx(1);
    // maxWidth = 20, text = "hello" (5 chars) — fits in one line
    const lines = wrapText(ctx, "hello", 20, 3);
    expect(lines).toEqual(["hello"]);
  });

  it("wraps long text into multiple lines", () => {
    const ctx = makeCtx(1);
    // Each word is 5 chars. maxWidth = 6 chars → only one word fits per line.
    const lines = wrapText(ctx, "alpha beta gamma", 6, 5);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe("alpha");
  });

  it("respects maxLines limit", () => {
    const ctx = makeCtx(1);
    // 6 words, each 4 chars, maxWidth = 5 → one word per line, capped at 2
    const lines = wrapText(ctx, "aaaa bbbb cccc dddd eeee ffff", 5, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("truncates the last line with ellipsis when maxLines is reached", () => {
    const ctx = makeCtx(1);
    // Force overflow: 4 words, maxWidth = 5, maxLines = 2
    // Line 1: "aaaa", line 2 must hold "bbbb" but more words follow
    const lines = wrapText(ctx, "aaaa bbbb cccc", 5, 2);
    expect(lines.length).toBe(2);
    // The last line should end with the ellipsis character
    expect(lines[lines.length - 1]).toContain("…");
  });

  it("returns empty array for empty string", () => {
    const ctx = makeCtx(1);
    const lines = wrapText(ctx, "", 100, 3);
    expect(lines).toEqual([]);
  });

  it("does not add ellipsis when text fits exactly within maxLines", () => {
    const ctx = makeCtx(1);
    // "ab cd" → 2 words, maxWidth = 5 (each word ≤ 5), maxLines = 3
    const lines = wrapText(ctx, "ab cd", 5, 3);
    // Should not have ellipsis since we didn't overflow
    for (const line of lines) {
      expect(line).not.toContain("…");
    }
  });
});

// ─── roundRect ───

describe("roundRect", () => {
  it("calls canvas path methods without throwing", () => {
    const ctx: Partial<CanvasRenderingContext2D> = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
    };

    expect(() =>
      roundRect(ctx as CanvasRenderingContext2D, 0, 0, 100, 50, 8),
    ).not.toThrow();

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.closePath).toHaveBeenCalledOnce();
    // 4 corners → 4 quadraticCurveTo calls
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(4);
  });

  it("draws the same shape regardless of radius being 0", () => {
    const calls: string[] = [];
    const ctx: Partial<CanvasRenderingContext2D> = {
      beginPath: vi.fn(() => calls.push("beginPath")),
      moveTo: vi.fn(() => calls.push("moveTo")),
      lineTo: vi.fn(() => calls.push("lineTo")),
      quadraticCurveTo: vi.fn(() => calls.push("quadraticCurveTo")),
      closePath: vi.fn(() => calls.push("closePath")),
    };

    // r = 0 still completes without error
    expect(() =>
      roundRect(ctx as CanvasRenderingContext2D, 10, 10, 80, 40, 0),
    ).not.toThrow();

    expect(calls[0]).toBe("beginPath");
    expect(calls[calls.length - 1]).toBe("closePath");
  });
});
