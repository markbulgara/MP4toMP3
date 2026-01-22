import { db } from "../storage/db";

export const getSpellsForClass = async (classId: string) => {
  const spells = await db.spells.toArray();
  const filtered = spells.filter((spell) => spell.classes?.includes(classId));
  return filtered.length > 0 ? filtered : spells;
};

export const getStartingEquipmentForClass = async (classId: string) => {
  const classRecord = await db.classes.get(classId);
  if (!classRecord?.raw || typeof classRecord.raw !== "object") {
    return [];
  }
  const raw = classRecord.raw as Record<string, unknown>;
  const items = Array.isArray(raw.startingEquipment) ? raw.startingEquipment : [];
  const equipmentNames = items.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
  if (equipmentNames.length === 0) {
    return [];
  }
  const allItems = await db.items.toArray();
  return allItems.filter((item) => equipmentNames.includes(item.name));
};
