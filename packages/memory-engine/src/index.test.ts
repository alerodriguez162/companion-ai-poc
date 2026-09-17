import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEMORY_SCORE_WEIGHTS,
  PACKAGE_NAME,
  lexicalSimilarity,
  rankMemories,
  recencyScore,
  scoreMemory,
} from "./index.js";

describe("memory-engine", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@companion/memory-engine");
  });

  it("uses the documented score weights", () => {
    const score = scoreMemory({
      similarity: 1,
      importance: 1,
      recency: 1,
    });
    expect(score).toBeCloseTo(
      DEFAULT_MEMORY_SCORE_WEIGHTS.similarity +
        DEFAULT_MEMORY_SCORE_WEIGHTS.importance +
        DEFAULT_MEMORY_SCORE_WEIGHTS.recency,
    );
  });

  it("ranks a matching fact above an unrelated one", () => {
    const now = new Date("2026-09-17T00:00:00.000Z");
    const ranked = rankMemories(
      "What is my dog's name?",
      [
        {
          content: "The user's dog is named Toto.",
          importance: 0.8,
          createdAt: now,
        },
        {
          content: "It rained on Tuesday.",
          importance: 0.9,
          createdAt: now,
        },
      ],
      { limit: 2, now },
    );
    expect(ranked[0]?.content).toContain("Toto");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("computes lexical similarity for shared tokens", () => {
    expect(lexicalSimilarity("dog named Toto", "The user's dog is named Toto")).toBeGreaterThan(0.3);
    expect(lexicalSimilarity("dog named Toto", "quantum mechanics lecture")).toBe(0);
  });

  it("decays recency over time", () => {
    const now = new Date("2026-09-17T00:00:00.000Z");
    const recent = recencyScore(now, now);
    const older = recencyScore(new Date("2026-06-17T00:00:00.000Z"), now);
    expect(recent).toBe(1);
    expect(older).toBeLessThan(recent);
  });
});
