"use client";

import { useChat } from "@/store/chat";

export const ChatLog = () => {
  const log = useChat((state) => state.log);
  return (
    <aside className="w-full border-t border-ash-200 bg-white p-4 lg:w-80 lg:border-l lg:border-t-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ash-700">Chat Log</h2>
        <span className="text-xs text-ash-400">{log.length} entries</span>
      </div>
      <div className="scrollbar-hidden flex max-h-[70vh] flex-col gap-3 overflow-auto">
        {log.length === 0 ? (
          <p className="text-xs text-ash-400">Roll dice or take actions to see results here.</p>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-ash-100 bg-ash-50 p-3 text-xs">
              <div className="flex items-center justify-between text-[10px] text-ash-400">
                <span>{entry.type === "roll" ? "Roll" : "System"}</span>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-ash-700">{entry.message}</p>
              {entry.roll && (
                <p className="mt-2 font-mono text-[10px] text-ash-500">
                  {entry.roll.prettyBreakdown} = {entry.roll.total}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
