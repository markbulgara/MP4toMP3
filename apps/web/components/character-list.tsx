"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCharacters } from "@/store/characters";

export const CharacterList = () => {
  const { characters, loadCharacters, deleteCharacter, duplicateCharacter } = useCharacters();

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  return (
    <div className="rounded-2xl border border-ash-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ash-800">Characters</h2>
          <p className="text-sm text-ash-500">Manage your heroes stored locally.</p>
        </div>
        <Link
          href="/characters/new"
          className="rounded-lg bg-ash-800 px-4 py-2 text-xs font-semibold text-white"
        >
          New Character
        </Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {characters.map((character) => (
          <div key={character.id} className="rounded-xl border border-ash-100 bg-ash-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ash-800">{character.name}</h3>
                <p className="text-xs text-ash-500">
                  Level {character.level} {character.className ?? "Adventurer"}
                </p>
              </div>
              <Link
                href={`/characters/${character.id}`}
                className="rounded-full bg-white px-3 py-1 text-xs text-ash-600"
              >
                Open
              </Link>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <button
                className="rounded-lg border border-ash-200 px-2 py-1"
                onClick={() => duplicateCharacter(character.id)}
              >
                Duplicate
              </button>
              <button
                className="rounded-lg border border-ash-200 px-2 py-1 text-ash-500"
                onClick={() => deleteCharacter(character.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {characters.length === 0 && (
          <div className="rounded-xl border border-dashed border-ash-200 p-6 text-center text-sm text-ash-500">
            Create your first character to get started.
          </div>
        )}
      </div>
    </div>
  );
};
