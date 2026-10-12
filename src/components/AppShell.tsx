'use client';

import { ComponentDock } from './ComponentDock';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rv-theme rv-app-shell">
      <ComponentDock />
      <main className="rv-app-content">
        {children}
      </main>
    </div>
  );
}
