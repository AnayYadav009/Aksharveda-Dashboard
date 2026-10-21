import React from "react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

export type SortDirection = "asc" | "desc" | null;

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  isLoading?: boolean;
  loadingRows?: number;
  emptyState?: React.ReactNode;
  onRowClick?: (item: T) => void;
  stickyHeader?: boolean;
  className?: string;
  maxHeight?: string;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  loadingRows = 5,
  emptyState,
  onRowClick,
  stickyHeader = true,
  className = "",
  maxHeight,
  sortKey,
  sortDirection,
  onSort,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={`overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs ${className}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs font-semibold uppercase text-[var(--text-muted)]">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3" style={{ width: col.width }}>
                    <Skeleton className="h-4 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {Array.from({ length: loadingRows }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs ${className}`}>
        {emptyState || (
          <EmptyState
            title="No records found"
            description="No items match your active filters or search criteria."
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs transition-colors ${className}`}
    >
      <div
        className="overflow-x-auto"
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        <table className="w-full text-left text-xs border-collapse">
          <thead
            className={`border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] ${
              stickyHeader ? "sticky top-0 z-10 backdrop-blur-xs" : ""
            }`}
          >
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={{ width: col.width }}
                    onClick={() => {
                      if (col.sortable && onSort) {
                        onSort(col.key);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (col.sortable && onSort && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSort(col.key);
                      }
                    }}
                    tabIndex={col.sortable ? 0 : undefined}
                    className={`px-3 py-2.5 font-medium select-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:ring-inset rounded-xs ${
                      col.sortable ? "cursor-pointer hover:text-[var(--text-primary)] transition-colors" : ""
                    } ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === "right"
                          ? "justify-end flex-row-reverse"
                          : col.align === "center"
                          ? "justify-center"
                          : "justify-start"
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="shrink-0 text-[var(--text-muted)]">
                          {isSorted && sortDirection === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
                          ) : isSorted && sortDirection === "desc" ? (
                            <ArrowDown className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
            {data.map((item, idx) => {
              const rowKey = keyExtractor(item, idx);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  className={`transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)] ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => {
                    const content = col.render
                      ? col.render(item, idx)
                      : (item as Record<string, any>)[col.key];

                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 whitespace-nowrap text-xs ${
                          col.align === "right"
                            ? "text-right font-mono"
                            : col.align === "center"
                            ? "text-center"
                            : "text-left"
                        }`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
