'use client';

import { Sidebar, MobileBottomNav } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 min-w-0 bg-gray-50/50">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
