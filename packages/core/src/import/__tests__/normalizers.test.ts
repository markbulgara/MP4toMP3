import { describe, expect, it } from "vitest";
import { normalizeDetectedPayload } from "../normalizers";
import type { DetectedPayload } from "../importTypes";

const ctx = { sourceHint: "USER" };

describe("normalizeDetectedPayload", () => {
  it("normalizes spells with required fields", () => {
    const payload: DetectedPayload = {
      entityType: "spell",
      records: [{ name: "Fireball", level: 3, school: "Evocation" }],
      confidence: 1,
      originalFileName: "spells.json"
    };
    const batch = normalizeDetectedPayload(payload, ctx);
    expect(batch.entities[0]).toMatchObject({ name: "Fireball", type: "spell", level: 3 });
    expect(batch.entities[0].id).toBeTruthy();
  });

  it("handles missing name", () => {
    const payload: DetectedPayload = {
      entityType: "item",
      records: [{ weight: 1 }],
      confidence: 1,
      originalFileName: "items.json"
    };
    const batch = normalizeDetectedPayload(payload, ctx);
    expect(batch.entities[0].name).toBe("Unnamed Item");
    expect(batch.entities[0].id).toBeTruthy();
  });
});
