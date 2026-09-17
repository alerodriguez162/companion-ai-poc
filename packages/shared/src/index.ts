export const PACKAGE_NAME = "@companion/shared";

export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type MemoryType =
  | "USER_FACT"
  | "CHARACTER_FACT"
  | "RELATIONSHIP_EVENT"
  | "STORY_EVENT"
  | "PREFERENCE"
  | "PROMISE"
  | "IMPORTANT_EVENT";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "USER_FACT",
  "CHARACTER_FACT",
  "RELATIONSHIP_EVENT",
  "STORY_EVENT",
  "PREFERENCE",
  "PROMISE",
  "IMPORTANT_EVENT",
] as const;

export type RelationshipStage =
  | "STRANGER"
  | "ACQUAINTANCE"
  | "FRIEND"
  | "CLOSE_FRIEND";

export const RELATIONSHIP_STAGES: readonly RelationshipStage[] = [
  "STRANGER",
  "ACQUAINTANCE",
  "FRIEND",
  "CLOSE_FRIEND",
] as const;

/** Trait keys are data-driven. Values must stay in [0, 1]. */
export type CharacterTraits = Record<string, number>;

export type Character = {
  id: string;
  name: string;
  description: string;
  personality: string;
  background: string;
  speakingStyle: string;
  scenario: string;
  traits: CharacterTraits;
};

export type CharacterContext = {
  identity: string;
  personality: string;
  background: string;
  speakingStyle: string;
  behavioralTraits: string[];
  scenario: string;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type MemoryRecord = {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  createdAt: string;
};

export type StoryStateSnapshot = {
  currentScene: string;
  location: string;
  participants: string[];
  activeEvents: string[];
  openThreads: string[];
  timelineSummary: string;
};

export type RelationshipStateSnapshot = {
  affinity: number;
  trust: number;
  relationshipStage: RelationshipStage;
};

export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;
export const RELATIONSHIP_MAX_DELTA = 5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampTrait(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp(value, 0, 1);
}

export function stageFromAffinity(affinity: number): RelationshipStage {
  if (affinity >= 75) {
    return "CLOSE_FRIEND";
  }
  if (affinity >= 50) {
    return "FRIEND";
  }
  if (affinity >= 25) {
    return "ACQUAINTANCE";
  }
  return "STRANGER";
}

export function applyRelationshipDelta(
  current: RelationshipStateSnapshot,
  delta: { affinityDelta: number; trustDelta: number },
): RelationshipStateSnapshot {
  const affinityDelta = clamp(delta.affinityDelta, -RELATIONSHIP_MAX_DELTA, RELATIONSHIP_MAX_DELTA);
  const trustDelta = clamp(delta.trustDelta, -RELATIONSHIP_MAX_DELTA, RELATIONSHIP_MAX_DELTA);
  const affinity = Math.round(clamp(current.affinity + affinityDelta, AFFINITY_MIN, AFFINITY_MAX));
  const trust = Math.round(clamp(current.trust + trustDelta, AFFINITY_MIN, AFFINITY_MAX));
  return {
    affinity,
    trust,
    relationshipStage: stageFromAffinity(affinity),
  };
}

export const DEFAULT_RELATIONSHIP_STATE: RelationshipStateSnapshot = {
  affinity: 10,
  trust: 10,
  relationshipStage: "STRANGER",
};

export const DEFAULT_STORY_STATE: StoryStateSnapshot = {
  currentScene: "Opening",
  location: "Unspecified",
  participants: ["User"],
  activeEvents: [],
  openThreads: [],
  timelineSummary: "The conversation has just started.",
};
