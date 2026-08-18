import { describe, expect, it } from "vitest";
import { isSafeRelativePath, isSafeServerId } from "../src/lib/validation.js";

describe("runner scope validation", () => {
  it("accepts opaque server identifiers without filesystem delimiters", () => {
    expect(isSafeServerId("cme1v28w40000b0f3u1234567")).toBe(true);
    expect(isSafeServerId("../../host")).toBe(false);
  });

  it("rejects file paths that can escape the assigned server root", () => {
    expect(isSafeRelativePath("config/server.properties")).toBe(true);
    expect(isSafeRelativePath("../secrets.env")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
  });
});
