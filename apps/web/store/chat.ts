import { create } from "zustand";
import type { RollResult } from "@ash/core";

export type ChatEntry = {
  id: string;
  type: "roll" | "system";
  message: string;
  roll?: RollResult;
  timestamp: string;
};

export type ChatState = {
  log: ChatEntry[];
  addSystem: (message: string) => void;
  addRoll: (message: string, roll: RollResult) => void;
};

export const useChat = create<ChatState>((set) => ({
  log: [],
  addSystem: (message) =>
    set((state) => ({
      log: [
        {
          id: crypto.randomUUID(),
          type: "system",
          message,
          timestamp: new Date().toISOString()
        },
        ...state.log
      ]
    })),
  addRoll: (message, roll) =>
    set((state) => ({
      log: [
        {
          id: crypto.randomUUID(),
          type: "roll",
          message,
          roll,
          timestamp: new Date().toISOString()
        },
        ...state.log
      ]
    }))
}));
