import { describe, expect, it } from "vitest";
import { createRng, hash } from "../random";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    expect(Array.from({ length: 50 }, () => a())).toEqual(
      Array.from({ length: 50 }, () => b()),
    );
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 10 }, () => a())).not.toEqual(
      Array.from({ length: 10 }, () => b()),
    );
  });

  it("returns values in [0, 1)", () => {
    const rnd = createRng(99999);
    for (let i = 0; i < 1000; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hash", () => {
  it("is deterministic", () => {
    expect(hash(42)).toBe(hash(42));
  });

  it("returns values in [0, 1)", () => {
    for (let n = 0; n < 500; n++) {
      const v = hash(n * 13.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
