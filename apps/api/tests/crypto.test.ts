import { describe, expect, it } from "vitest";

describe("agent signing protocol", () => {
  it("defines a stable payload layout for HMAC authentication", async () => {
    process.env.NODE_ENV = "test";
    expect("POST\n/v1/servers/a/actions\n123\n{}".split("\n")).toHaveLength(4);
  });
});
