'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--surface-ground)] text-[var(--text-primary)] flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 md:hidden flex" style={{ zIndex: "var(--z-drawer)" }}>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 bg-[var(--surface-card)] h-full shadow-2xl" style={{ zIndex: "var(--z-drawer)" }}>
            <Sidebar
              collapsed={false}
              onToggleCollapsed={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Container */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          collapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        <TopBar onToggleSidebarMobile={() => setMobileOpen(!mobileOpen)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 max-w-7xl w-full mx-auto animate-in fade-in duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
