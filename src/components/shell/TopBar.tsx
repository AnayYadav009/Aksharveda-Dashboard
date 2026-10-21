'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  Layers,
  ChevronDown,
  Menu,
} from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { NotificationBell } from '../notifications/NotificationBell';

interface TopBarProps {
  onToggleSidebarMobile?: () => void;
}

export function TopBar({ onToggleSidebarMobile }: TopBarProps) {
  const router = useRouter();
  const [searchPo, setSearchPo] = useState('');

  const handlePoSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchPo.trim()) {
      router.push(`/pos?search=${encodeURIComponent(searchPo.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-[var(--surface-card)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-6 flex items-center justify-between gap-4 transition-colors duration-200">
      {/* Left section: mobile hamburger + Channel Selector */}
      <div className="flex items-center gap-3">
        {onToggleSidebarMobile && (
          <button
            type="button"
            onClick={onToggleSidebarMobile}
            className="md:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)]"
            aria-label="Open mobile menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Channel Selector Pill */}
        <div className="relative inline-flex items-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 font-medium text-xs shadow-xs">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
            <Layers className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span className="font-semibold tracking-wide">Blinkit</span>
            <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 uppercase font-mono ml-0.5">
              Only
            </span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </div>
        </div>
      </div>

      {/* Global PO Search */}
      <form
        onSubmit={handlePoSearchSubmit}
        className="flex-1 max-w-md mx-2 relative hidden sm:block"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchPo}
          onChange={(e) => setSearchPo(e.target.value)}
          placeholder="Global PO search (e.g. PO number, SKU)..."
          className="w-full pl-9 pr-12 py-1.5 text-xs sm:text-sm bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] transition"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-ground)] border border-[var(--border-subtle)] rounded pointer-events-none">
          ↵ Enter
        </kbd>
      </form>

      {/* Right controls: Date, Notifications, Theme Toggle */}
      <div className="flex items-center gap-3">
        {/* Date Display */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-[4px] bg-[var(--surface-ground)]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>

        <div className="hidden lg:block h-4 w-px bg-[var(--border-subtle)]" />

        {/* Notification Bell Dropdown */}
        <NotificationBell />

        <div className="h-4 w-px bg-[var(--border-subtle)]" />

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </header>
  );
}
