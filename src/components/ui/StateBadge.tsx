import React from "react";
import { AlertCircle, Clock, CheckCircle2, AlertOctagon, HelpCircle } from "lucide-react";

export type POState =
  | "Unscheduled"
  | "Scheduled"
  | "Partially Scheduled"
  | "Fulfilled"
  | "Expired"
  | string;

export type StateType = POState;

interface StateBadgeProps {
  state: POState;
  size?: "sm" | "md" | "lg";
  className?: string;
  showDot?: boolean;
}

const stateConfig: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  Unscheduled: {
    bg: "bg-[var(--status-warning-bg)]",
    text: "text-[var(--status-warning-text)]",
    border: "border-[var(--status-warning-border)]",
    icon: AlertCircle,
    label: "Unscheduled",
  },
  Scheduled: {
    bg: "bg-[var(--status-info-bg)]",
    text: "text-[var(--status-info-text)]",
    border: "border-[var(--status-info-border)]",
    icon: Clock,
    label: "Scheduled",
  },
  "Partially Scheduled": {
    bg: "bg-purple-100 dark:bg-purple-950/80",
    text: "text-purple-800 dark:text-purple-200",
    border: "border-purple-300 dark:border-purple-800",
    icon: Clock,
    label: "Partially Scheduled",
  },
  Fulfilled: {
    bg: "bg-[var(--status-success-bg)]",
    text: "text-[var(--status-success-text)]",
    border: "border-[var(--status-success-border)]",
    icon: CheckCircle2,
    label: "Fulfilled",
  },
  Expired: {
    bg: "bg-[var(--status-danger-bg)]",
    text: "text-[var(--status-danger-text)]",
    border: "border-[var(--status-danger-border)]",
    icon: AlertOctagon,
    label: "Expired",
  },
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export function StateBadge({
  state,
  size = "md",
  className = "",
  showDot = true,
}: StateBadgeProps) {
  const config = stateConfig[state] || {
    bg: "bg-[var(--status-neutral-bg)]",
    text: "text-[var(--text-primary)]",
    border: "border-[var(--status-neutral-border)]",
    icon: HelpCircle,
    label: state,
  };

  const dotColor =
    state === "Unscheduled"
      ? "bg-amber-500"
      : state === "Scheduled"
      ? "bg-sky-500"
      : state === "Partially Scheduled"
      ? "bg-purple-500"
      : state === "Fulfilled"
      ? "bg-emerald-500"
      : state === "Expired"
      ? "bg-rose-500"
      : "bg-slate-400";

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-[4px] border font-medium text-xs tracking-normal transition-colors ${
        config.bg
      } ${config.text} ${config.border} ${sizeClasses[size]} ${className}`}
    >
      {showDot && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}
