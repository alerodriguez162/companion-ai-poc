import type { Character as SharedCharacter, CharacterTraits } from "@companion/shared";
import type { Character, Prisma } from "@prisma/client";

export function asTraits(value: Prisma.JsonValue): CharacterTraits {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const traits: CharacterTraits = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "number") {
      traits[key] = raw;
    }
  }
  return traits;
}

export function toSharedCharacter(character: Character): SharedCharacter {
  return {
    id: character.id,
    name: character.name,
    description: character.description,
    personality: character.personality,
    background: character.background,
    speakingStyle: character.speakingStyle,
    scenario: character.scenario,
    traits: asTraits(character.traits),
  };
}
