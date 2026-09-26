import { describe, expect, it } from "vitest";
import { elapsed, paceOf, paceSide, runsOutAt } from "./pace";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe("runsOutAt", () => {
  it("a fast pace runs out before the reset", () => {
    // 2 h of a 5 h window gone, 60 % used: 100 % at 3 h20, before the reset.
    expect(runsOutAt(0.6, NOW + 3 * HOUR, 5 * HOUR, NOW)).toBe(NOW + 80 * 60_000);
    expect(runsOutAt(0.2, NOW + 3 * HOUR, 5 * HOUR, NOW)).toBeNull();
    expect(runsOutAt(1, NOW + HOUR, 5 * HOUR, NOW)).toBe(NOW);
    // A reset further away than the window is not trusted.
    expect(runsOutAt(0.5, NOW + 6 * HOUR, 5 * HOUR, NOW)).toBeNull();
  });
});

describe("elapsed", () => {
  it("needs a reset inside the window", () => {
    expect(elapsed(NOW + 3 * HOUR, 5 * HOUR, NOW)).toBeCloseTo(0.4, 9);
    expect(elapsed(NOW, 5 * HOUR, NOW)).toBeNull();
    expect(elapsed(NOW + HOUR, 0, NOW)).toBeNull();
  });
});

describe("paceOf", () => {
  it("the pace delta is used minus time gone", () => {
    const p = paceOf({ used: 0.6, resets_at: NOW + 3 * HOUR, span_ms: 5 * HOUR }, NOW);
    expect(p).not.toBeNull();
    expect(p!.expected).toBeCloseTo(0.4, 9);
    expect(p!.delta).toBeCloseTo(0.2, 6);
    expect(p!.runsOutAt).not.toBeNull();
  });

  it("too early in the window: no pace at all", () => {
    expect(paceOf({ used: 0.05, resets_at: NOW + 5 * HOUR - 60_000, span_ms: 5 * HOUR }, NOW)).toBeNull();
    expect(paceOf({ used: 0.5, resets_at: NOW + HOUR, span_ms: null }, NOW)).toBeNull();
    expect(paceOf({ used: null, resets_at: NOW + HOUR, span_ms: 5 * HOUR }, NOW)).toBeNull();
  });

  it("reads a small delta as on pace", () => {
    expect(paceSide(0.2)).toBe("ahead");
    expect(paceSide(-0.2)).toBe("under");
    expect(paceSide(0.02)).toBe("on");
  });
});
