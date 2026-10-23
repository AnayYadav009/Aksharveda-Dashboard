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
  /** Allow this column's cells to wrap text (default: nowrap) */
  wrap?: boolean;
  /** Apply tabular-nums font-feature on this column */
  numeric?: boolean;
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

/** Shared border-radius applied to all three states (loading / empty / data). */
const SHELL_CLS =
  "overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs";

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
  // Default maxHeight allows sticky header to work within the viewport.
  const resolvedMaxHeight = maxHeight ?? "calc(100vh - 320px)";

  if (isLoading) {
    return (
      <div className={`${SHELL_CLS} ${className}`}>
        <div className="overflow-x-auto scroll-shadow-right">
          <table className="w-full min-w-max text-left text-sm">
            <thead
              className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs font-semibold uppercase text-[var(--text-muted)]"
              style={{ zIndex: "var(--z-table-sticky)" }}
            >
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 whitespace-nowrap" style={{ width: col.width }}>
                    <Skeleton className="h-4 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {Array.from({ length: loadingRows }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
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
      <div className={`${SHELL_CLS} ${className}`}>
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
    <div className={`${SHELL_CLS} transition-colors ${className}`}>
      <div
        className="overflow-x-auto scroll-shadow-right"
        style={{ maxHeight: resolvedMaxHeight, overflowY: "auto" }}
      >
        <table className="w-full min-w-max text-left text-xs border-collapse">
          <thead
            className={`border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]${
              stickyHeader ? " sticky top-0 backdrop-blur-xs" : ""
            }`}
            style={stickyHeader ? { zIndex: "var(--z-table-sticky)" } : undefined}
          >
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
                    style={{ width: col.width }}
                    onClick={() => {
                      if (col.sortable && onSort) onSort(col.key);
                    }}
                    onKeyDown={(e) => {
                      if (col.sortable && onSort && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSort(col.key);
                      }
                    }}
                    tabIndex={col.sortable ? 0 : undefined}
                    className={`px-3 py-2 font-medium select-none whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:ring-inset rounded-xs${
                      col.sortable ? " cursor-pointer hover:text-[var(--text-primary)] transition-colors" : ""
                    }${
                      col.align === "right"
                        ? " text-right"
                        : col.align === "center"
                        ? " text-center"
                        : " text-left"
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5${
                        col.align === "right"
                          ? " justify-end flex-row-reverse"
                          : col.align === "center"
                          ? " justify-center"
                          : " justify-start"
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
          <tbody className="text-[var(--text-secondary)]">
            {data.map((item, idx) => {
              const rowKey = keyExtractor(item, idx);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  className={`border-b border-[var(--border-subtle)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]${
                    onRowClick ? " cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => {
                    const content = col.render
                      ? col.render(item, idx)
                      : (item as Record<string, any>)[col.key];

                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-xs${col.wrap ? "" : " whitespace-nowrap"}${
                          col.numeric ? " tabular-nums" : ""
                        }${
                          col.align === "right"
                            ? " text-right font-mono"
                            : col.align === "center"
                            ? " text-center"
                            : " text-left"
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
