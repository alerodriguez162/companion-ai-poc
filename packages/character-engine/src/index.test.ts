import type { Character } from "@companion/shared";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, buildCharacterContext } from "./index.js";

const sample: Character = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Mira",
  description: "A friendly neighborhood botanist.",
  personality: "Warm and curious",
  background: "Grew up in a coastal town",
  speakingStyle: "Casual, short sentences, occasional plant metaphors",
  scenario: "A quiet greenhouse cafe",
  traits: {
    curiosity: 0.8,
    humor: 0.7,
    sarcasm: 0.3,
    affection: 0.5,
  },
};

describe("character-engine", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@companion/character-engine");
  });

  it("builds deterministic context sections from character data", () => {
    const context = buildCharacterContext(sample);
    expect(context.identity).toBe("Mira: A friendly neighborhood botanist.");
    expect(context.personality).toBe("Warm and curious");
    expect(context.background).toBe("Grew up in a coastal town");
    expect(context.speakingStyle).toContain("Casual");
    expect(context.scenario).toBe("A quiet greenhouse cafe");
    expect(context.behavioralTraits).toEqual([
      "affection=0.50",
      "curiosity=0.80",
      "humor=0.70",
      "sarcasm=0.30",
    ]);
  });

  it("clamps out-of-range traits instead of copying them", () => {
    const context = buildCharacterContext({
      ...sample,
      traits: { humor: 4, sarcasm: -2 },
    });
    expect(context.behavioralTraits).toEqual(["humor=1.00", "sarcasm=0.00"]);
  });
});
