"use client";

import React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className = "", compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-xs transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] ${className}`}
        title={`Current theme: ${theme} (resolved: ${resolvedTheme}). Click to toggle.`}
        aria-label="Toggle theme"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="h-4 w-4 text-amber-400" />
        ) : (
          <Moon className="h-4 w-4 text-slate-600" />
        )}
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1 text-[var(--text-secondary)] shadow-xs ${className}`}
    >
      <button
        onClick={() => setTheme("light")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
          theme === "light"
            ? "bg-[var(--surface-card)] text-teal-700 dark:text-teal-400 shadow-xs"
            : "hover:text-[var(--text-primary)]"
        }`}
        title="Light theme"
      >
        <Sun className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Light</span>
      </button>

      <button
        onClick={() => setTheme("dark")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
          theme === "dark"
            ? "bg-[var(--surface-card)] text-teal-700 dark:text-teal-400 shadow-xs"
            : "hover:text-[var(--text-primary)]"
        }`}
        title="Dark theme"
      >
        <Moon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </button>

      <button
        onClick={() => setTheme("system")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
          theme === "system"
            ? "bg-[var(--surface-card)] text-teal-700 dark:text-teal-400 shadow-xs"
            : "hover:text-[var(--text-primary)]"
        }`}
        title="Follow System Theme"
      >
        <Laptop className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">System</span>
      </button>
    </div>
  );
}
