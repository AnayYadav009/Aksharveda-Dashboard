'use client';

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader,
  StatTile,
  StateBadge,
  DataTable,
  Column,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { StateType } from '@/components/ui/StateBadge';
import { PODetailDrawer, PODetailResponse } from '@/components/po/PODetailDrawer';
import { formatINR, formatUnits, formatDate, daysLeft } from '@/lib/format';
import {
  Package,
  Boxes,
  IndianRupee,
  AlertTriangle,
  Calendar,
  Clock,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';

import { Hub } from '@/lib/types';

interface POItem {
  po_number: string;
  facility_raw: string;
  city: string;
  facility_code: string;
  order_date: string;
  expiry_date: string;
  days_to_expiry: number;
  is_near_expiry: boolean;
  po_state: string;
  total_qty: number;
  total_amount: number;
}

interface DashboardApiResponse {
  summary: {
    total_pos: number;
    total_value: number;
    total_units: number;
    near_expiry_count: number;
  };
  pagination?: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
  };
  available_months: string[];
  active_month: string;
  cities: string[];
  states: string[];
  pos: POItem[];
}

const PRESET_DAYS = [7, 15, 30, 45, 60] as const;

function PODashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Read URL state
  const rawHub = searchParams.get('hub');
  const hub: Hub = rawHub === 'kolkata' ? 'kolkata' : 'delhi';
  const view = (searchParams.get('view') as 'month' | 'recent') || 'month';
  const urlMonth = searchParams.get('month') || '';
  const urlDays = parseInt(searchParams.get('days') || '30', 10);
  const urlSearch = searchParams.get('search') || '';
  const urlCity = searchParams.get('city') || '';
  const urlState = searchParams.get('state') || '';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Local debounced search input
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Sort state
  const [sortKey, setSortKey] = useState<string>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Custom days input state
  const [isCustomDays, setIsCustomDays] = useState(!PRESET_DAYS.includes(urlDays as any));
  const [customDaysValue, setCustomDaysValue] = useState(urlDays.toString());

  // Drawer selection
  const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);

  // Synchronize local search input with URL if URL changes externally
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // Debounce search update to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== urlSearch) {
        updateQuery({ search: searchInput || null, page: '1' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Helper to safely push updated params to URL
  const updateQuery = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, val);
      }
    });
    // Ensure hub is always set
    if (!nextParams.has('hub')) {
      nextParams.set('hub', hub);
    }
    router.replace(`/pos?${nextParams.toString()}`, { scroll: false });
  };

  const handleHubChange = (newHub: Hub) => {
    if (newHub === hub) return;
    updateQuery({ hub: newHub, page: '1', city: null, state: null });
  };

  // 2. Fetch dashboard data using TanStack Query (server-side pagination & sorting)
  const pageSize = 50;
  const { data, isLoading, isError, error, refetch } = useQuery<DashboardApiResponse>({
    queryKey: ['pos', hub, view, urlMonth, urlDays, urlSearch, urlCity, urlState, urlPage, sortKey, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({
        hub,
        view,
        days: urlDays.toString(),
        page: urlPage.toString(),
        pageSize: pageSize.toString(),
        sortKey,
        sortDir,
      });
      if (urlMonth) params.set('month', urlMonth);
      if (urlSearch) params.set('search', urlSearch);
      if (urlCity) params.set('city', urlCity);
      if (urlState) params.set('state', urlState);

      const res = await fetch(`/api/pos?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // 3. Fetch single PO detail for drawer
  const {
    data: drawerData,
    isLoading: drawerLoading,
    error: drawerError,
  } = useQuery<PODetailResponse>({
    queryKey: ['po-detail', hub, selectedPoNumber],
    queryFn: async () => {
      if (!selectedPoNumber) return null as any;
      const res = await fetch(`/api/pos/${selectedPoNumber}?hub=${hub}`);
      if (!res.ok) throw new Error('Failed to load PO details');
      return res.json();
    },
    enabled: Boolean(selectedPoNumber),
  });

  // Server-paginated rows and totals
  const totalCount = data?.pagination?.total_count ?? (data?.summary?.total_pos || 0);
  const totalPages = data?.pagination?.total_pages ?? Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, urlPage), totalPages);
  const paginatedRows = data?.pos || [];

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Table Columns
  const columns: Column<POItem>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      sortable: true,
      render: (item) => (
        <span className="font-mono font-medium text-[var(--accent-teal)] hover:underline">
          #{item.po_number}
        </span>
      ),
    },
    {
      key: 'facility_raw',
      header: 'Facility / Darkstore',
      sortable: true,
      render: (item) => (
        <div className="max-w-[200px] truncate" title={item.facility_raw}>
          <p className="font-medium text-[var(--text-primary)] truncate">{item.facility_raw}</p>
          <p className="text-[10px] text-[var(--text-muted)] font-mono">{item.city} ({item.facility_code || 'FC'})</p>
        </div>
      ),
    },
    {
      key: 'order_date',
      header: 'Order Date',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {formatDate(item.order_date)}
        </span>
      ),
    },
    {
      key: 'expiry_date',
      header: 'Expiry Date',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {formatDate(item.expiry_date)}
        </span>
      ),
    },
    {
      key: 'days_to_expiry',
      header: 'Days Left',
      align: 'center',
      sortable: true,
      render: (item) => {
        const { label, isUrgent, isExpired } = daysLeft(item.expiry_date);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium ${
              isExpired
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold'
                : isUrgent
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold'
                : 'bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
            }`}
          >
            {label}
          </span>
        );
      },
    },
    {
      key: 'po_state',
      header: 'State',
      align: 'center',
      sortable: true,
      render: (item) => <StateBadge state={item.po_state as StateType} size="sm" />,
    },
    {
      key: 'total_qty',
      header: 'Units',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
          {formatUnits(item.total_qty)}
        </span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total Value',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
          {formatINR(item.total_amount)}
        </span>
      ),
    },
  ];

  // Active filter count
  const activeFilters = [
    urlCity ? { label: `City: ${urlCity}`, onRemove: () => updateQuery({ city: null, page: '1' }) } : null,
    urlState ? { label: `State: ${urlState}`, onRemove: () => updateQuery({ state: null, page: '1' }) } : null,
    urlSearch ? { label: `Search: "${urlSearch}"`, onRemove: () => { setSearchInput(''); updateQuery({ search: null, page: '1' }); } } : null,
  ].filter(Boolean) as Array<{ label: string; onRemove: () => void }>;

  const handleClearAllFilters = () => {
    setSearchInput('');
    updateQuery({ search: null, city: null, state: null, page: '1' });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <PageHeader
        title="Purchase Orders Dashboard"
        subtitle="Channel: Blinkit • Centralized order tracking, SLAs, and darkstore delivery schedules."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'PO Dashboard' },
        ]}
      />

      {/* Top-Level Hub Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleHubChange('delhi')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
              hub === 'delhi'
                ? 'bg-[var(--accent-teal)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <span>Delhi POs</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                hub === 'delhi' ? 'bg-white/20 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-muted)]'
              }`}
            >
              North Hub
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleHubChange('kolkata')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
              hub === 'kolkata'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <span>Kolkata POs</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                hub === 'kolkata' ? 'bg-white/20 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-muted)]'
              }`}
            >
              East Hub
            </span>
          </button>
        </div>

        <div className="text-[11px] text-[var(--text-muted)] hidden sm:block">
          Active Hub: <span className="font-semibold uppercase tracking-wider text-[var(--text-primary)]">{hub}</span>
        </div>
      </div>

      {/* 2. Metrics in one bordered strip */}
      <div className="rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-card)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] overflow-hidden">
        {isLoading ? (
          <>
            <div className="p-4"><Skeleton className="h-16 rounded-[4px]" /></div>
            <div className="p-4"><Skeleton className="h-16 rounded-[4px]" /></div>
            <div className="p-4"><Skeleton className="h-16 rounded-[4px]" /></div>
            <div className="p-4"><Skeleton className="h-16 rounded-[4px]" /></div>
          </>
        ) : (
          <>
            <div className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Total Purchase Orders
              </span>
              <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                {data?.summary ? data.summary.total_pos.toLocaleString() : '—'}
              </div>
              <span className="mt-1 text-[11px] text-[var(--text-muted)]">
                Orders matching active view
              </span>
            </div>

            <div className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Total PO Value
              </span>
              <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                {data?.summary ? formatINR(data.summary.total_value) : '—'}
              </div>
              <span className="mt-1 text-[11px] text-[var(--text-muted)]">
                Gross order valuation
              </span>
            </div>

            <div className="p-4 flex flex-col justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Total Units Ordered
              </span>
              <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">
                {data?.summary ? formatUnits(data.summary.total_units) : '—'}
              </div>
              <span className="mt-1 text-[11px] text-[var(--text-muted)]">
                Reconciled item quantity
              </span>
            </div>

            <div className="p-4 flex flex-col justify-between bg-amber-500/5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                Expiring Within 7 Days
              </span>
              <div className="mt-1 text-2xl font-bold font-mono tracking-tight text-amber-800 dark:text-amber-400">
                {data?.summary ? data.summary.near_expiry_count.toString() : '—'}
              </div>
              <span className="mt-1 text-[11px] text-amber-900/90 dark:text-amber-300">
                Urgent open POs requiring dispatch
              </span>
            </div>
          </>
        )}
      </div>

      {/* 3. Controls & Filter Bar Card */}
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-4 shadow-xs">
        {/* Top row: Segmented Control "By month | Last X days" */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div className="inline-flex rounded-lg bg-[var(--surface-ground)] p-1 border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => updateQuery({ view: 'month', page: '1' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                view === 'month'
                  ? 'bg-[var(--surface-card)] text-[var(--accent-teal)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>By Month</span>
            </button>
            <button
              type="button"
              onClick={() => updateQuery({ view: 'recent', page: '1' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                view === 'recent'
                  ? 'bg-[var(--surface-card)] text-[var(--accent-teal)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Last X Days</span>
            </button>
          </div>

          {/* Sub-selector based on active segmented control */}
          <div className="flex items-center gap-3">
            {view === 'month' ? (
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                <span>Month:</span>
                <select
                  value={urlMonth || data?.active_month || ''}
                  onChange={(e) => updateQuery({ month: e.target.value, page: '1' })}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] cursor-pointer"
                >
                  {(data?.available_months || ['2026-10']).map((m) => (
                    <option key={m} value={m}>
                      {new Date(`${m}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Window:</span>
                <div className="flex items-center gap-1 bg-[var(--surface-ground)] p-1 rounded-lg border border-[var(--border-subtle)]">
                  {PRESET_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setIsCustomDays(false);
                        updateQuery({ days: d.toString(), page: '1' });
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                        !isCustomDays && urlDays === d
                          ? 'bg-[var(--accent-teal)] text-white shadow-xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomDays(true)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                      isCustomDays
                        ? 'bg-[var(--accent-teal)] text-white shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {isCustomDays && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={customDaysValue}
                      onChange={(e) => setCustomDaysValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateQuery({ days: customDaysValue, page: '1' });
                        }
                      }}
                      className="w-16 px-2 py-1 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuery({ days: customDaysValue, page: '1' })}
                      className="px-2 py-1 text-xs font-medium rounded bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter bar: Search, City, State, Clear All */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Debounced Search */}
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search PO # or facility name..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-teal)] transition"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  updateQuery({ search: null, page: '1' });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* City filter */}
          <div className="sm:col-span-3">
            <select
              value={urlCity}
              onChange={(e) => updateQuery({ city: e.target.value || null, page: '1' })}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] cursor-pointer"
            >
              <option value="">All Cities ({data?.cities?.length || 0})</option>
              {(data?.cities || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* State filter */}
          <div className="sm:col-span-3">
            <select
              value={urlState}
              onChange={(e) => updateQuery({ state: e.target.value || null, page: '1' })}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] cursor-pointer"
            >
              <option value="">All PO States ({data?.states?.length || 0})</option>
              {(data?.states || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Chips & Clear All */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)] font-medium">Active filters:</span>
            {activeFilters.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="text-[var(--text-muted)] hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[var(--accent-teal)] hover:underline ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* 4. PO Table or Error / Empty States */}
      {isError ? (
        <ErrorState
          title="Failed to Load Purchase Orders"
          message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching PO data.'}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={paginatedRows}
            keyExtractor={(item) => item.po_number}
            isLoading={isLoading}
            loadingRows={10}
            stickyHeader
            sortKey={sortKey}
            sortDirection={sortDir}
            onSort={handleSort}
            onRowClick={(item) => setSelectedPoNumber(item.po_number)}
            emptyState={
              <EmptyState
                title="No POs match these filters"
                description="Try clearing your search query or adjusting your city/state selection."
                action={
                  activeFilters.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition"
                    >
                      Clear All Filters
                    </button>
                  ) : undefined
                }
              />
            }
          />

          {/* Pagination Controls */}
          {!isLoading && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2 text-xs text-[var(--text-muted)]">
              <div>
                Showing{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {Math.min(currentPage * pageSize, totalCount)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {totalCount.toLocaleString()}
                </span>{' '}
                purchase orders
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2 self-center sm:self-auto">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => updateQuery({ page: (currentPage - 1).toString() })}
                    className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none hover:bg-[var(--surface-hover)] transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-medium text-[var(--text-primary)]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => updateQuery({ page: (currentPage + 1).toString() })}
                    className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] disabled:opacity-40 disabled:pointer-events-none hover:bg-[var(--surface-hover)] transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. PO Detail Drawer */}
      <PODetailDrawer
        poNumber={selectedPoNumber}
        isOpen={Boolean(selectedPoNumber)}
        onClose={() => setSelectedPoNumber(null)}
        data={drawerData || null}
        isLoading={drawerLoading}
        error={drawerError instanceof Error ? drawerError.message : null}
      />
    </div>
  );
}

export default function PODashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-16 w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64" />
        </div>
      }
    >
      <PODashboardContent />
    </Suspense>
  );
}
