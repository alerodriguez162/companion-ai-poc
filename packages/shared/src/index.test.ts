import { describe, expect, it } from "vitest";
import {
  AFFINITY_MAX,
  DEFAULT_RELATIONSHIP_STATE,
  PACKAGE_NAME,
  RELATIONSHIP_MAX_DELTA,
  applyRelationshipDelta,
  stageFromAffinity,
} from "./index.js";

describe("shared", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@companion/shared");
  });
});

describe("relationship bounds", () => {
  it("clamps a single-turn delta", () => {
    const next = applyRelationshipDelta(DEFAULT_RELATIONSHIP_STATE, {
      affinityDelta: 90,
      trustDelta: -40,
    });
    expect(next.affinity).toBe(DEFAULT_RELATIONSHIP_STATE.affinity + RELATIONSHIP_MAX_DELTA);
    expect(next.trust).toBe(DEFAULT_RELATIONSHIP_STATE.trust - RELATIONSHIP_MAX_DELTA);
    expect(next.relationshipStage).toBe("STRANGER");
  });

  it("does not exceed max affinity", () => {
    const next = applyRelationshipDelta(
      { affinity: 98, trust: 98, relationshipStage: "CLOSE_FRIEND" },
      { affinityDelta: 5, trustDelta: 5 },
    );
    expect(next.affinity).toBe(AFFINITY_MAX);
    expect(next.trust).toBe(AFFINITY_MAX);
  });

  it("derives stage from affinity bands", () => {
    expect(stageFromAffinity(10)).toBe("STRANGER");
    expect(stageFromAffinity(25)).toBe("ACQUAINTANCE");
    expect(stageFromAffinity(50)).toBe("FRIEND");
    expect(stageFromAffinity(75)).toBe("CLOSE_FRIEND");
  });
});
