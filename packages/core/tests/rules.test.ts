import { describe, expect, it } from "vitest";
import { abilityModifier, armorClass, proficiencyBonus } from "../src/rules/engine";

describe("rules engine", () => {
  it("calculates proficiency bonus by level", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
  });

  it("calculates armor class with dex cap", () => {
    expect(armorClass(14, 18, 2)).toBe(16);
    expect(abilityModifier(12)).toBe(1);
  });
});
