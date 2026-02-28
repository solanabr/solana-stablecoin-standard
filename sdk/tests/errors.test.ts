import { describe, it, expect } from "vitest";
import {
  SssError,
  PausedError,
  SupplyCapExceededError,
  UnauthorizedError,
  SenderBlacklistedError,
  mapAnchorError,
} from "../src/errors";

describe("Error classes", () => {
  it("SssError has correct name and code", () => {
    const err = new SssError("test message", "TestCode");
    expect(err.name).toBe("SssError");
    expect(err.code).toBe("TestCode");
    expect(err.message).toBe("test message");
    expect(err instanceof Error).toBe(true);
  });

  it("PausedError has correct defaults", () => {
    const err = new PausedError();
    expect(err.code).toBe("Paused");
    expect(err.message).toBe("Operations are paused");
  });

  it("SupplyCapExceededError has correct defaults", () => {
    const err = new SupplyCapExceededError();
    expect(err.code).toBe("SupplyCapExceeded");
  });

  it("UnauthorizedError has correct defaults", () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe("Unauthorized");
  });

  it("SenderBlacklistedError has correct defaults", () => {
    const err = new SenderBlacklistedError();
    expect(err.code).toBe("SenderBlacklisted");
  });
});

describe("mapAnchorError", () => {
  it("maps known core error codes", () => {
    const anchorErr = {
      error: { errorCode: { code: "Paused" } },
    };
    const mapped = mapAnchorError(anchorErr);
    expect(mapped).toBeInstanceOf(PausedError);
  });

  it("maps known hook error codes", () => {
    const anchorErr = {
      error: { errorCode: { code: "SenderBlacklisted" } },
    };
    const mapped = mapAnchorError(anchorErr);
    expect(mapped).toBeInstanceOf(SenderBlacklistedError);
  });

  it("wraps non-Error objects with unknown codes into Error", () => {
    const anchorErr = {
      error: { errorCode: { code: "SomeUnknownError" } },
    };
    const mapped = mapAnchorError(anchorErr);
    // Plain objects get wrapped since they're not Error instances
    expect(mapped).toBeInstanceOf(Error);
  });

  it("returns original Error for unknown codes when input is Error", () => {
    const originalErr = new Error("some anchor error");
    (originalErr as unknown as Record<string, unknown>).error = { errorCode: { code: "SomeUnknownError" } };
    const mapped = mapAnchorError(originalErr);
    expect(mapped).toBe(originalErr);
  });

  it("handles non-anchor errors gracefully", () => {
    const plainErr = new Error("plain error");
    const mapped = mapAnchorError(plainErr);
    expect(mapped).toBe(plainErr);
  });

  it("handles string errors", () => {
    const mapped = mapAnchorError("string error");
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped.message).toBe("string error");
  });

  it("handles null/undefined", () => {
    const mapped = mapAnchorError(null);
    expect(mapped).toBeInstanceOf(Error);
  });
});
