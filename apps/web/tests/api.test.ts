import { describe, expect, it } from "vitest";
import { baseUrl } from "../lib/api";

describe("web API configuration", () => {
  it("defaults to the local standalone control-plane endpoint", () => {
    expect(baseUrl).toBe("http://localhost:4000");
  });
});
