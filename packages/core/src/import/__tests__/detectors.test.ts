import { describe, expect, it } from "vitest";
import { detectFilePayload } from "../detectors";

const fileName = "test.json";

describe("detectFilePayload", () => {
  it("detects top-level spell key", () => {
    const payloads = detectFilePayload({ spell: [{ name: "Fireball" }] }, fileName);
    expect(payloads[0]?.entityType).toBe("spell");
  });

  it("detects items from array", () => {
    const payloads = detectFilePayload(
      [
        { name: "Sword", weight: 3, value: "10 gp" },
        { name: "Dagger", weight: 1 }
      ],
      fileName
    );
    expect(payloads[0]?.entityType).toBe("item");
  });

  it("detects wrapped data", () => {
    const payloads = detectFilePayload({ data: { classes: [{ name: "Wizard" }] } }, fileName);
    expect(payloads[0]?.entityType).toBe("class");
  });

  it("detects background by key", () => {
    const payloads = detectFilePayload({ backgrounds: [{ name: "Sage" }] }, fileName);
    expect(payloads[0]?.entityType).toBe("background");
  });

  it("detects species by key", () => {
    const payloads = detectFilePayload({ races: [{ name: "Elf" }] }, fileName);
    expect(payloads[0]?.entityType).toBe("species");
  });

  it("returns empty for unknown payload", () => {
    const payloads = detectFilePayload({ foo: [{ name: "Bar" }] }, fileName);
    expect(payloads.length).toBe(0);
  });
});
