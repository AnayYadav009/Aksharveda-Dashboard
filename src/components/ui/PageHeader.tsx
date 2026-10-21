import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  breadcrumbs,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`mb-6 flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span>/</span>}
                {bc.href ? (
                  <a href={bc.href} className="hover:text-[var(--text-primary)] hover:underline">
                    {bc.label}
                  </a>
                ) : (
                  <span className="font-medium text-[var(--text-secondary)]">{bc.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          {actions}
        </div>
      )}
    </div>
  );
}
