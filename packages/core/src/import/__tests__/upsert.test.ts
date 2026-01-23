import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "../../storage/db";
import { upsertNormalizedBatch } from "../upsert";

const options = { overwrite: false, mergeMode: true, skipUnknown: true };

describe("upsertNormalizedBatch", () => {
  it("resolves collisions with suffix", async () => {
    await db.items.clear();
    await db.items.put({
      id: "sword",
      name: "Sword",
      type: "item",
      source: "USER"
    });
    const result = await upsertNormalizedBatch(
      {
        entityType: "item",
        entities: [{ id: "sword", name: "Sword", type: "item", source: "USER" }]
      },
      options
    );
    expect(result.inserted).toBe(1);
    const items = await db.items.toArray();
    expect(items.length).toBe(2);
    expect(items.some((item) => item.id.startsWith("sword~"))).toBe(true);
  });
});
