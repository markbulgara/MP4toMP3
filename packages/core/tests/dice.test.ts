import { describe, expect, it } from "vitest";
import { parseDiceExpression, rollD20, rollDice } from "../src/dice/engine";

describe("dice engine", () => {
  it("parses damage expressions", () => {
    expect(parseDiceExpression("2d6+3")).toEqual(["2d6", "+3"]);
  });

  it("handles advantage rolls", () => {
    const result = rollD20(2, "advantage");
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.dice.length).toBe(2);
  });

  it("evaluates modifiers", () => {
    const result = rollDice("1d4+2");
    expect(result.total).toBeGreaterThanOrEqual(3);
  });
});
