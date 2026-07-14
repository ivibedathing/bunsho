import { describe, expect, it } from "vitest";
import { isValidDocCode, normalizeDocCode } from "./docCode";

describe("isValidDocCode", () => {
  it("accepts a well-formed code", () => {
    expect(isValidDocCode("POL-007")).toBe(true);
    expect(isValidDocCode("SOP-013")).toBe(true);
    expect(isValidDocCode("WI-1024")).toBe(true);
  });

  it("rejects malformed codes", () => {
    expect(isValidDocCode("pol-007")).toBe(false); // lowercase
    expect(isValidDocCode("POL-7")).toBe(false); // too few digits
    expect(isValidDocCode("POLICY007")).toBe(false); // missing hyphen
    expect(isValidDocCode("P-007")).toBe(false); // prefix too short
    expect(isValidDocCode("")).toBe(false);
  });
});

describe("normalizeDocCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeDocCode("  pol-007 ")).toBe("POL-007");
  });

  it("collapses whitespace around the hyphen", () => {
    expect(normalizeDocCode("pol - 007")).toBe("POL-007");
  });
});
