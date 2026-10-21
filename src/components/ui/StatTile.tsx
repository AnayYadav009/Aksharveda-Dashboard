import React from "react";
import { LucideIcon } from "lucide-react";

export type StatTileVariant = "default" | "teal" | "warning" | "danger" | "success" | "info";

interface StatTileProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: StatTileVariant;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  onClick?: () => void;
  className?: string;
}

const variantStyles: Record<
  StatTileVariant,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    badgeBg?: string;
    badgeText?: string;
  }
> = {
  default: {
    border: "border-[var(--border-subtle)]",
    iconBg: "bg-[var(--surface-raised)]",
    iconColor: "text-[var(--text-secondary)]",
  },
  teal: {
    border: "border-[var(--accent-teal)]/30 hover:border-[var(--accent-teal)]",
    iconBg: "bg-[var(--accent-teal-subtle)]",
    iconColor: "text-[var(--accent-teal)]",
  },
  warning: {
    border: "border-[var(--status-warning)]/40 hover:border-[var(--status-warning)]",
    iconBg: "bg-[var(--status-warning-bg)]",
    iconColor: "text-[var(--status-warning-text)]",
  },
  danger: {
    border: "border-[var(--status-danger)]/40 hover:border-[var(--status-danger)]",
    iconBg: "bg-[var(--status-danger-bg)]",
    iconColor: "text-[var(--status-danger-text)]",
  },
  success: {
    border: "border-[var(--status-success)]/40 hover:border-[var(--status-success)]",
    iconBg: "bg-[var(--status-success-bg)]",
    iconColor: "text-[var(--status-success-text)]",
  },
  info: {
    border: "border-[var(--status-info)]/40 hover:border-[var(--status-info)]",
    iconBg: "bg-[var(--status-info-bg)]",
    iconColor: "text-[var(--status-info-text)]",
  },
};

export function StatTile({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  trend,
  onClick,
  className = "",
}: StatTileProps) {
  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border bg-[var(--surface-card)] p-5 shadow-xs transition-all duration-200 hover:shadow-md ${
        styles.border
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </p>
          <div className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {value}
          </div>
        </div>

        {Icon && (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${styles.iconBg} ${styles.iconColor}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center font-semibold ${
                trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {trend.value}
            </span>
          )}
          {trend?.label && <span className="text-[var(--text-muted)]">{trend.label}</span>}
          {subtitle && !trend && <span className="text-[var(--text-muted)]">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
