"use client";

import { useEffect, useState } from "react";
import { useCharacters } from "@/store/characters";
import { useChat } from "@/store/chat";
import { rollD20, rollDice } from "@ash/core";

const tabs = ["Summary", "Actions", "Spells", "Inventory", "Features", "Notes"] as const;

export const CharacterSheet = ({ id }: { id: string }) => {
  const { selected, selectCharacter, updateCharacter } = useCharacters();
  const addRoll = useChat((state) => state.addRoll);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Summary");

  useEffect(() => {
    selectCharacter(id);
  }, [id, selectCharacter]);

  if (!selected) {
    return <div className="text-sm text-ash-500">Loading character...</div>;
  }

  const handleQuickRoll = () => {
    const roll = rollD20(0, "normal");
    addRoll(`${selected.name} rolls initiative`, roll);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <input
              className="text-xl font-semibold text-ash-800 outline-none"
              value={selected.name}
              onChange={(event) => updateCharacter(selected.id, { name: event.target.value })}
            />
            <p className="text-xs text-ash-500">
              Level {selected.level} {selected.className ?? "Adventurer"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-ash-200 px-3 py-2 text-xs"
              onClick={handleQuickRoll}
            >
              Initiative Roll
            </button>
            <button
              className="rounded-lg bg-ash-800 px-3 py-2 text-xs font-semibold text-white"
              onClick={() => addRoll(`${selected.name} rolls a d20`, rollD20(0, "advantage"))}
            >
              Advantage d20
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item}
              className={`rounded-full px-3 py-1 text-xs ${
                tab === item ? "bg-ash-800 text-white" : "bg-ash-100 text-ash-600"
              }`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {tab === "Summary" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-ash-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-ash-700">Vitals</h3>
            <div className="mt-3 grid gap-2 text-xs text-ash-600">
              <label className="flex items-center justify-between">
                HP
                <input
                  type="number"
                  className="w-20 rounded border border-ash-200 px-2 py-1"
                  value={selected.hitPoints ?? 0}
                  onChange={(event) => updateCharacter(selected.id, { hitPoints: Number(event.target.value) })}
                />
              </label>
              <label className="flex items-center justify-between">
                Temp HP
                <input
                  type="number"
                  className="w-20 rounded border border-ash-200 px-2 py-1"
                  value={selected.tempHp ?? 0}
                  onChange={(event) => updateCharacter(selected.id, { tempHp: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>
          <div className="rounded-2xl border border-ash-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-ash-700">Abilities</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {Object.entries(selected.abilities).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded bg-ash-50 px-2 py-1">
                  <span className="capitalize">{key}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-ash-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-ash-700">Quick Dice</h3>
            <div className="mt-3 space-y-2 text-xs">
              <button
                className="w-full rounded-lg border border-ash-200 px-3 py-2"
                onClick={() => addRoll(`${selected.name} rolls perception`, rollD20(2, "normal"))}
              >
                Perception Check (d20+2)
              </button>
              <button
                className="w-full rounded-lg border border-ash-200 px-3 py-2"
                onClick={() => addRoll(`${selected.name} rolls damage`, rollDice("2d6+3"))}
              >
                Damage Roll (2d6+3)
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "Actions" && (
        <div className="rounded-2xl border border-ash-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ash-700">Actions</h3>
          <p className="mt-2 text-xs text-ash-500">Add attacks and actions (MVP).</p>
        </div>
      )}

      {tab === "Spells" && (
        <div className="rounded-2xl border border-ash-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ash-700">Spells</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ash-600">
            {selected.spells.map((spell) => (
              <li key={spell.id}>{spell.name}</li>
            ))}
            {selected.spells.length === 0 && <li>No spells prepared.</li>}
          </ul>
        </div>
      )}

      {tab === "Inventory" && (
        <div className="rounded-2xl border border-ash-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ash-700">Inventory</h3>
          <ul className="mt-3 space-y-2 text-xs">
            {selected.equipment.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span>{item.name}</span>
                <button
                  className={`rounded-full px-3 py-1 text-[10px] ${
                    item.equipped ? "bg-ash-800 text-white" : "bg-ash-100 text-ash-600"
                  }`}
                  onClick={() =>
                    updateCharacter(selected.id, {
                      equipment: selected.equipment.map((entry) =>
                        entry.id === item.id ? { ...entry, equipped: !entry.equipped } : entry
                      )
                    })
                  }
                >
                  {item.equipped ? "Equipped" : "Equip"}
                </button>
              </li>
            ))}
            {selected.equipment.length === 0 && (
              <li className="text-ash-400">No equipment selected.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "Features" && (
        <div className="rounded-2xl border border-ash-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ash-700">Features</h3>
          <p className="mt-2 text-xs text-ash-500">Species and class features appear here.</p>
        </div>
      )}

      {tab === "Notes" && (
        <div className="rounded-2xl border border-ash-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ash-700">Notes</h3>
          <textarea
            className="mt-3 w-full rounded-lg border border-ash-200 p-3 text-xs"
            rows={6}
            value={selected.notes ?? ""}
            onChange={(event) => updateCharacter(selected.id, { notes: event.target.value })}
          />
        </div>
      )}
    </div>
  );
};
