'use client';

import React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  statusOptions?: FilterOption[];
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  cityOptions?: FilterOption[];
  selectedCity?: string;
  onCityChange?: (city: string) => void;
  onReset?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  searchPlaceholder = 'Search PO number, city, or SKU...',
  searchValue = '',
  onSearchChange,
  statusOptions = [],
  selectedStatus = '',
  onStatusChange,
  cityOptions = [],
  selectedCity = '',
  onCityChange,
  onReset,
  children,
  className = '',
}: FilterBarProps) {
  const hasActiveFilters = Boolean(
    searchValue || (selectedStatus && selectedStatus !== 'ALL') || (selectedCity && selectedCity !== 'ALL')
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg shadow-xs transition-colors duration-200 ${className}`}
    >
      {/* Search Input */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-8 py-1.5 text-sm bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] transition"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange?.('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status Filter */}
      {statusOptions.length > 0 && (
        <div className="min-w-[140px]">
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange?.(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] transition cursor-pointer"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* City Filter */}
      {cityOptions.length > 0 && (
        <div className="min-w-[140px]">
          <select
            value={selectedCity}
            onChange={(e) => onCityChange?.(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] focus:ring-1 focus:ring-[var(--accent-teal)] transition cursor-pointer"
          >
            <option value="">All Cities</option>
            {cityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom filter elements */}
      {children}

      {/* Reset button */}
      {hasActiveFilters && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-md transition"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  );
}
