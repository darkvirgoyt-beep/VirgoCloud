import { describe, expect, it } from "vitest";
import { createServerSchema, filePathSchema, updateServerSchema } from "./index.js";

describe("control-plane contracts", () => {
  it("accepts a valid Java server request", () => {
    const value = createServerSchema.parse({
      name: "Sky Factory",
      edition: "JAVA",
      version: "1.21.4",
      ramMb: 4096,
      playerSlots: 20,
      difficulty: "normal",
      gameMode: "survival",
      software: "PAPER"
    });
    expect(value.name).toBe("Sky Factory");
  });

  it("rejects directory traversal in server-file paths", () => {
    expect(() => filePathSchema.parse("../secrets.txt")).toThrow();
    expect(() => filePathSchema.parse("plugins/../../host")).toThrow();
  });

  it("only accepts explicit durable running or stopped server intent", () => {
    expect(updateServerSchema.parse({ desiredState: "RUNNING" }).desiredState).toBe("RUNNING");
    expect(() => updateServerSchema.parse({ desiredState: "PAUSED" })).toThrow();
  });
});
