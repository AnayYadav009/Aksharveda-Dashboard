import React from "react";
import { AlertCircle, RefreshCw, LucideIcon } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An error occurred while loading this data. Please try again.",
  icon: Icon = AlertCircle,
  onRetry,
  retryLabel = "Retry",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center sm:p-12 ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] shadow-2xs">
        <Icon className="h-7 w-7 stroke-[1.5]" />
      </div>

      <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)] leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-teal)] px-4 py-2 text-sm font-medium text-[var(--accent-teal-fg)] shadow-xs transition-colors hover:bg-[var(--accent-teal-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)]"
        >
          <RefreshCw className="h-4 w-4" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}
