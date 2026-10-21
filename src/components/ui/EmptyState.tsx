import React from "react";
import { FolderOpen, LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "No data available",
  description = "There are no records to display at this time.",
  icon: Icon = FolderOpen,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center sm:p-12 ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-muted)] shadow-2xs">
        <Icon className="h-7 w-7 stroke-[1.5]" />
      </div>

      <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)] leading-relaxed">
        {description}
      </p>

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
