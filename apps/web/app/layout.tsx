import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatLog } from "@/components/chat-log";

export const metadata = {
  title: "AshBeyond",
  description: "Offline-first compendium and character builder"
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ash-50">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <div className="flex h-full flex-col lg:flex-row">
              <div className="flex-1 overflow-auto p-6">{children}</div>
              <ChatLog />
            </div>
          </main>
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
