import { describe, expect, it } from "vitest";
import { shadeForSim } from "../wallDefaults";

describe("shadeForSim", () => {
  it("scales each RGB channel to ~80%, approximating the darkened installation-view bezel tone", () => {
    expect(shadeForSim("#181a20")).toBe("#13151a");
  });

  it("scales white down without any channel overflowing", () => {
    expect(shadeForSim("#ffffff")).toBe("#cccccc");
  });

  it("leaves black unchanged", () => {
    expect(shadeForSim("#000000")).toBe("#000000");
  });
});
