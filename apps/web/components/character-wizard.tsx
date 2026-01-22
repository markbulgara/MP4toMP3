"use client";

import { useEffect, useMemo, useState } from "react";
import { useCreator } from "@/store/creator";
import { useCharacters } from "@/store/characters";
import { getRegistry } from "@/lib/providers";
import type { AnyEntity, EntityType } from "@ash/core";

const stepTitles: Record<string, string> = {
  species: "Choose a species",
  class: "Choose a class & subclass",
  background: "Select a background",
  abilities: "Set ability scores",
  proficiencies: "Select skills & proficiencies",
  equipment: "Pick starting equipment",
  spells: "Prepare spells",
  review: "Review & create"
};

const abilityOrder = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma"
];

const AbilityRow = ({
  ability,
  value,
  onChange
}: {
  ability: string;
  value: number;
  onChange: (value: number) => void;
}) => (
  <div className="flex items-center justify-between rounded-lg border border-ash-200 bg-white px-3 py-2">
    <span className="text-sm capitalize text-ash-700">{ability}</span>
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-16 rounded-md border border-ash-200 px-2 py-1 text-sm"
    />
  </div>
);

export const CharacterWizard = () => {
  const { step, selections, next, back, updateSelection } = useCreator();
  const { createCharacter } = useCharacters();
  const [list, setList] = useState<AnyEntity[]>([]);
  const [detail, setDetail] = useState<AnyEntity | null>(null);
  const registry = getRegistry();

  const typeForStep: EntityType | null = useMemo(() => {
    switch (step) {
      case "species":
        return "species";
      case "class":
        return "class";
      case "background":
        return "background";
      case "equipment":
        return "item";
      case "spells":
        return "spell";
      default:
        return null;
    }
  }, [step]);

  useEffect(() => {
    const load = async () => {
      if (!typeForStep) {
        setList([]);
        return;
      }
      const result = await registry.listEntities(typeForStep, {}, { page: 0, pageSize: 50 });
      setList(result.items);
      setDetail(result.items[0] ?? null);
    };
    load();
  }, [registry, typeForStep]);

  const handleSelect = (entry: AnyEntity) => {
    setDetail(entry);
    if (step === "species") {
      updateSelection({ species: entry.name });
    }
    if (step === "class") {
      updateSelection({ class: entry.name });
    }
    if (step === "background") {
      updateSelection({ background: entry.name });
    }
    if (step === "equipment") {
      updateSelection({ equipment: Array.from(new Set([...selections.equipment, entry.name])) });
    }
    if (step === "spells") {
      updateSelection({ spells: Array.from(new Set([...selections.spells, entry.name])) });
    }
  };

  const create = async () => {
    await createCharacter({
      name: selections.class ? `${selections.class} Hero` : "AshBeyond Hero",
      className: selections.class,
      species: selections.species,
      background: selections.background,
      abilities: selections.abilityScores,
      skills: selections.skills,
      equipment: selections.equipment.map((name) => ({ id: name, name })),
      spells: selections.spells.map((name) => ({ id: name, name }))
    });
    next();
  };

  return (
    <div className="rounded-2xl border border-ash-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ash-800">Character Builder</h2>
          <p className="text-sm text-ash-500">{stepTitles[step]}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={back}
            className="rounded-lg border border-ash-200 px-3 py-2 text-xs"
          >
            Back
          </button>
          <button
            onClick={step === "review" ? create : next}
            className="rounded-lg bg-ash-800 px-3 py-2 text-xs font-semibold text-white"
          >
            {step === "review" ? "Create" : "Next"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr,1fr]">
        <div className="rounded-xl border border-ash-100 bg-ash-50 p-4">
          {typeForStep ? (
            <div className="space-y-2">
              {list.map((entry) => (
                <button
                  key={entry.id}
                  className="flex w-full items-center justify-between rounded-lg border border-ash-200 bg-white px-3 py-2 text-left text-sm hover:border-ash-400"
                  onClick={() => handleSelect(entry)}
                >
                  <span>{entry.name}</span>
                  <span className="text-[10px] text-ash-400">{entry.source ?? "Custom"}</span>
                </button>
              ))}
              {list.length === 0 && (
                <p className="text-xs text-ash-400">No content installed for this step.</p>
              )}
            </div>
          ) : step === "abilities" ? (
            <div className="space-y-3">
              {abilityOrder.map((ability) => (
                <AbilityRow
                  key={ability}
                  ability={ability}
                  value={selections.abilityScores[ability] ?? 10}
                  onChange={(value) =>
                    updateSelection({
                      abilityScores: { ...selections.abilityScores, [ability]: value }
                    })
                  }
                />
              ))}
            </div>
          ) : step === "proficiencies" ? (
            <div className="space-y-2 text-sm text-ash-600">
              <p>Select skills manually (MVP).</p>
              <div className="flex flex-wrap gap-2">
                {["Athletics", "Stealth", "Arcana", "Perception", "Persuasion"].map((skill) => (
                  <button
                    key={skill}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selections.skills.includes(skill)
                        ? "border-ash-800 bg-ash-800 text-white"
                        : "border-ash-200 bg-white text-ash-600"
                    }`}
                    onClick={() =>
                      updateSelection({
                        skills: selections.skills.includes(skill)
                          ? selections.skills.filter((item) => item !== skill)
                          : [...selections.skills, skill]
                      })
                    }
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-ash-600">
              <p>Spells and gear will appear here if the selected class supports them.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ash-100 bg-white p-4">
          {step === "review" ? (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-sm font-semibold text-ash-700">Summary</h3>
                <p className="text-ash-500">{selections.species ?? "Species"}</p>
                <p className="text-ash-500">{selections.class ?? "Class"}</p>
                <p className="text-ash-500">{selections.background ?? "Background"}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ash-600">Abilities</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(selections.abilityScores).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded bg-ash-50 p-2">
                      <span className="capitalize">{key}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ash-600">Skills</h4>
                <p className="text-xs text-ash-500">
                  {selections.skills.length ? selections.skills.join(", ") : "None"}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ash-600">Equipment</h4>
                <p className="text-xs text-ash-500">
                  {selections.equipment.length ? selections.equipment.join(", ") : "None"}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ash-600">Spells</h4>
                <p className="text-xs text-ash-500">
                  {selections.spells.length ? selections.spells.join(", ") : "None"}
                </p>
              </div>
            </div>
          ) : detail ? (
            <div>
              <h3 className="text-sm font-semibold text-ash-800">{detail.name}</h3>
              <p className="mt-2 text-xs text-ash-500">
                {detail.description ?? "Select an entry to see details."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-ash-400">Select an option to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
};
