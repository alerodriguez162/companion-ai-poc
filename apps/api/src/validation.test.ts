import { describe, expect, it } from "vitest";
import { createCharacterSchema, createMessageSchema } from "./config.js";

describe("API validation", () => {
  it("rejects an empty chat message", () => {
    const result = createMessageSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects oversized chat messages", () => {
    const result = createMessageSchema.safeParse({ content: "x".repeat(5001) });
    expect(result.success).toBe(false);
  });

  it("accepts a valid character payload", () => {
    const result = createCharacterSchema.parse({
      name: "Mira",
      description: "Botanist",
      personality: "Warm",
      background: "Coast",
      speakingStyle: "Casual",
      scenario: "Cafe",
      traits: { humor: 0.5 },
    });
    expect(result.name).toBe("Mira");
  });

  it("rejects traits outside 0-1", () => {
    const result = createCharacterSchema.safeParse({
      name: "Mira",
      description: "Botanist",
      personality: "Warm",
      background: "Coast",
      speakingStyle: "Casual",
      scenario: "Cafe",
      traits: { humor: 2 },
    });
    expect(result.success).toBe(false);
  });
});
