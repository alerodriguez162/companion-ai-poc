import {
  type Character,
  type CharacterContext,
  clampTrait,
} from "@companion/shared";

export const PACKAGE_NAME = "@companion/character-engine";

function traitLine(name: string, value: number): string {
  return `${name}=${clampTrait(value).toFixed(2)}`;
}

/**
 * Deterministic mapping from structured character data to prompt sections.
 * Trait values come from the character record; nothing is hardcoded here.
 */
export function buildCharacterContext(character: Character): CharacterContext {
  const traitNames = Object.keys(character.traits).sort((a, b) => a.localeCompare(b));
  return {
    identity: `${character.name.trim()}: ${character.description.trim()}`,
    personality: character.personality.trim(),
    background: character.background.trim(),
    speakingStyle: character.speakingStyle.trim(),
    behavioralTraits: traitNames.map((name) => {
      const value = character.traits[name];
      return traitLine(name, value ?? 0);
    }),
    scenario: character.scenario.trim(),
  };
}
