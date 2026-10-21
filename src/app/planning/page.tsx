'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  PageHeader,
  StateBadge,
  SaveStatus,
  SaveState,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { StateType } from '@/components/ui/StateBadge';
import { PODetailDrawer, PODetailResponse } from '@/components/po/PODetailDrawer';
import { formatINR, formatUnits, formatDate, daysLeft } from '@/lib/format';
import {
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface SKUInfo {
  item_id: string;
  name: string;
  short_name: string;
  stock_in_hand: number | null;
  is_stock_known?: boolean;
  total_open_order: number;
  balance: number | null;
}

interface PlanningRow {
  channel_id: string;
  channel_name: string;
  po_number: string;
  facility_raw: string;
  city: string;
  facility_code: string;
  order_date: string;
  expiry_date: string;
  days_to_expiry: number;
  po_state: string;
  total_amount: number;
  total_qty: number;
  remarks: string;
  central_appointment_date: string;
  internal_dispatch_date: string;
  actual_dispatch_date: string;
  qty_dispatched: number;
  sku_quantities: Record<string, number>;
}

interface PlanningApiResponse {
  skus: SKUInfo[];
  rows: PlanningRow[];
  cities: string[];
  states: string[];
  isStockLoaded: boolean;
  totalMasterSkus?: number;
  hiddenSkusCount?: number;
}

export default function PlanningPage() {
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);

  // Filters
  const [hideClosed, setHideClosed] = useState(true);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [onlyShortfall, setOnlyShortfall] = useState(false);

  // Global & Per-cell save status
  const [globalSaveStatus, setGlobalSaveStatus] = useState<SaveState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date>(new Date());
  const [cellSaving, setCellSaving] = useState<Record<string, 'saving' | 'failed' | 'saved'>>({});

  // Drawer state
  const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);

  // Data Query
  const { data, isLoading, isError, error, refetch } = useQuery<PlanningApiResponse>({
    queryKey: ['planning', hideClosed, selectedCity, selectedState],
    queryFn: async () => {
      const p = new URLSearchParams({
        hideClosed: hideClosed.toString(),
        city: selectedCity,
        state: selectedState,
      });
      const res = await fetch(`/api/planning?${p.toString()}`);
      if (!res.ok) throw new Error('Failed to load planning grid');
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Drawer Query
  const { data: drawerData, isLoading: drawerLoading } = useQuery<PODetailResponse>({
    queryKey: ['po-detail', selectedPoNumber],
    queryFn: async () => {
      if (!selectedPoNumber) return null as any;
      const res = await fetch(`/api/pos/${selectedPoNumber}`);
      if (!res.ok) throw new Error('Failed to load PO detail');
      return res.json();
    },
    enabled: Boolean(selectedPoNumber),
  });

  // Optimistic Row Mutation
  const updateRowMutation = useMutation({
    mutationFn: async (payload: { po_number: string; [key: string]: any }) => {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onMutate: async (newPayload) => {
      setGlobalSaveStatus('saving');
      const cellKey = `${newPayload.po_number}:${Object.keys(newPayload)[1]}`;
      setCellSaving((prev) => ({ ...prev, [cellKey]: 'saving' }));
    },
    onSuccess: (_, variables) => {
      setGlobalSaveStatus('saved');
      setLastSavedAt(new Date());
      queryClient.invalidateQueries({ queryKey: ['planning'] });
      const cellKey = `${variables.po_number}:${Object.keys(variables)[1]}`;
      setCellSaving((prev) => ({ ...prev, [cellKey]: 'saved' }));
      setTimeout(() => {
        setCellSaving((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      }, 1500);
    },
    onError: (_, variables) => {
      setGlobalSaveStatus('failed');
      const cellKey = `${variables.po_number}:${Object.keys(variables)[1]}`;
      setCellSaving((prev) => ({ ...prev, [cellKey]: 'failed' }));
    },
  });

  // Optimistic Stock Mutation
  const updateStockMutation = useMutation({
    mutationFn: async (payload: { item_id: string; qty_in_hand: number }) => {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Stock update failed');
      return res.json();
    },
    onMutate: async ({ item_id, qty_in_hand }) => {
      setGlobalSaveStatus('saving');
      setCellSaving((prev) => ({ ...prev, [`stock:${item_id}`]: 'saving' }));

      // Optimistically update query data
      queryClient.setQueryData<PlanningApiResponse>(
        ['planning', hideClosed, selectedCity, selectedState],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            isStockLoaded: true,
            skus: old.skus.map((s) =>
              s.item_id === item_id
                ? {
                    ...s,
                    stock_in_hand: qty_in_hand,
                    is_stock_known: true,
                    balance: qty_in_hand - s.total_open_order,
                  }
                : s
            ),
          };
        }
      );
    },
    onSuccess: (_, { item_id }) => {
      setGlobalSaveStatus('saved');
      setLastSavedAt(new Date());
      setCellSaving((prev) => ({ ...prev, [`stock:${item_id}`]: 'saved' }));
      setTimeout(() => {
        setCellSaving((prev) => {
          const next = { ...prev };
          delete next[`stock:${item_id}`];
          return next;
        });
      }, 1500);
    },
    onError: (_, { item_id }) => {
      setGlobalSaveStatus('failed');
      setCellSaving((prev) => ({ ...prev, [`stock:${item_id}`]: 'failed' }));
    },
  });

  // Mutation for editable SKU short name
  const updateSkuShortNameMutation = useMutation({
    mutationFn: async (payload: { item_id: string; short_name: string }) => {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_sku_short_name', ...payload }),
      });
      if (!res.ok) throw new Error('Short name update failed');
      return res.json();
    },
    onMutate: async ({ item_id, short_name }) => {
      setGlobalSaveStatus('saving');
      setCellSaving((prev) => ({ ...prev, [`sku_name:${item_id}`]: 'saving' }));
      queryClient.setQueryData<PlanningApiResponse>(
        ['planning', hideClosed, selectedCity, selectedState],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            skus: old.skus.map((s) => (s.item_id === item_id ? { ...s, short_name } : s)),
          };
        }
      );
    },
    onSuccess: (_, { item_id }) => {
      setGlobalSaveStatus('saved');
      setLastSavedAt(new Date());
      setCellSaving((prev) => ({ ...prev, [`sku_name:${item_id}`]: 'saved' }));
      setTimeout(() => {
        setCellSaving((prev) => {
          const next = { ...prev };
          delete next[`sku_name:${item_id}`];
          return next;
        });
      }, 1500);
    },
    onError: (_, { item_id }) => {
      setGlobalSaveStatus('failed');
      setCellSaving((prev) => ({ ...prev, [`sku_name:${item_id}`]: 'failed' }));
    },
  });

  // Filtered SKUs (shortfall filter & search)
  // Shortfall is strictly defined as known stock < open order (balance < 0)
  const filteredSkus = useMemo(() => {
    if (!data?.skus) return [];
    return data.skus.filter((s) => {
      if (onlyShortfall) {
        if (s.balance === null || s.balance >= 0) return false;
      }
      if (skuSearch) {
        const q = skuSearch.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.short_name && s.short_name.toLowerCase().includes(q)) ||
          s.item_id.includes(q)
        );
      }
      return true;
    });
  }, [data?.skus, onlyShortfall, skuSearch]);

  const rows = data?.rows || [];

  // Virtualizer for 400+ Rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  // Cell Navigation: Enter / Tab / Arrows
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    if (['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const targetRow = e.key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
      const targetInput = document.querySelector<HTMLInputElement>(
        `input[data-row="${targetRow}"][data-col="${colIndex}"]`
      );
      targetInput?.focus();
    }
  };

  // Stock edit handler with validation (supports explicit 0)
  const handleStockBlur = (itemId: string, currentVal: number | null, newValStr: string) => {
    if (newValStr.trim() === '') return;
    const val = parseInt(newValStr, 10);
    if (isNaN(val) || val < 0) return;
    if (val !== currentVal) {
      updateStockMutation.mutate({ item_id: itemId, qty_in_hand: val });
    }
  };

  // Short name blur handler
  const handleShortNameBlur = (itemId: string, currentVal: string, newValStr: string) => {
    const trimmed = newValStr.trim();
    if (trimmed && trimmed !== currentVal) {
      updateSkuShortNameMutation.mutate({ item_id: itemId, short_name: trimmed });
    }
  };

  // Export to Excel handler
  const handleExportExcel = () => {
    const p = new URLSearchParams({
      hideClosed: hideClosed.toString(),
      city: selectedCity,
      state: selectedState,
    });
    window.location.href = `/api/planning/export?${p.toString()}`;
  };

  // Totals for sticky summary strip: only count SKUs where stock is known (balance !== null && balance < 0)
  const totalShortfallSkus = useMemo(
    () => (data?.skus || []).filter((s) => s.balance !== null && s.balance < 0).length,
    [data?.skus]
  );
  const unknownStockSkusCount = useMemo(
    () => (data?.skus || []).filter((s) => s.stock_in_hand === null).length,
    [data?.skus]
  );
  const totalOpenUnits = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.total_qty) || 0), 0),
    [rows]
  );

  return (
    <div className="space-y-4 pb-16">
      {/* 1. Header */}
      <PageHeader
        title="Dispatch Planning Sheet"
        subtitle="Matrix allocation grid with virtualized rows and columns. Edit schedules, stock, and line dispatches in real-time."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Planning Sheet' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <SaveStatus status={globalSaveStatus} lastSavedAt={lastSavedAt} />
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        }
      />

      {/* Stock Not Loaded Notice Banner */}
      {!isLoading && data && !data.isStockLoaded && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Stock not loaded:</strong> Stock snapshots have not been uploaded yet. Blanks are treated as unknown, not zero. Edit in-hand stock directly in the header row below.
            </span>
          </div>
        </div>
      )}

      {/* 2. Filters & Search Strip */}
      <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* City */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] font-medium"
          >
            <option value="">All Cities ({data?.cities?.length || 0})</option>
            {(data?.cities || []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* State */}
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] font-medium"
          >
            <option value="">All States ({data?.states?.length || 0})</option>
            {(data?.states || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Toggle show closed */}
          <button
            type="button"
            onClick={() => setHideClosed(!hideClosed)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              !hideClosed
                ? 'bg-[var(--accent-teal)] text-white border-[var(--accent-teal)]'
                : 'bg-[var(--surface-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            {hideClosed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{hideClosed ? 'Show Closed (Fulfilled/Expired)' : 'Hiding Closed'}</span>
          </button>

          {/* Shortfall Only Filter */}
          <button
            type="button"
            onClick={() => setOnlyShortfall(!onlyShortfall)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              onlyShortfall
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-[var(--surface-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Only Shortfall SKUs ({totalShortfallSkus})</span>
          </button>
        </div>

        {/* SKU search input */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            placeholder="Search / highlight SKU..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs focus:outline-none focus:border-[var(--accent-teal)]"
          />
        </div>
      </div>

      {/* 3. Sticky Summary Strip */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/95 backdrop-blur-md shadow-xs text-xs">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="font-semibold text-[var(--text-primary)]">
            Active Grid Scope:
          </span>
          <span className="text-[var(--text-secondary)]">
            <strong>{rows.length}</strong> POs in view
          </span>
          <span>•</span>
          <span className="text-[var(--text-secondary)]">
            <strong>{formatUnits(totalOpenUnits)}</strong> open units
          </span>
          <span>•</span>
          <span className="text-[var(--text-secondary)]">
            <strong>{filteredSkus.length}</strong> SKUs rendered
          </span>
          {data?.hiddenSkusCount ? (
            <>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-[4px] bg-slate-500/10 text-[var(--text-muted)] font-mono text-[11px] border border-[var(--border-subtle)]" title="1 SKU in SKU Master has no active open orders and is filtered out of the dispatch matrix">
                {data.hiddenSkusCount} SKU hidden (no open orders)
              </span>
            </>
          ) : null}
          {unknownStockSkusCount > 0 && (
            <>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-[4px] bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium text-[11px] border border-amber-500/20">
                Stock not loaded for {unknownStockSkusCount} SKUs
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold ${
              totalShortfallSkus > 0
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {totalShortfallSkus} Shortfall SKUs
          </span>
        </div>
      </div>

      {/* 4. Virtualized Matrix Grid Container */}
      {isLoading ? (
        <div className="p-8 text-center bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent-teal)] mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Mounting Virtual Matrix (400 POs × 47 SKUs)...
          </p>
        </div>
      ) : isError ? (
        <ErrorState
          title="Grid Initialization Failed"
          message={error instanceof Error ? error.message : 'Error'}
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No POs match criteria"
          description="Try toggling 'Show Closed' or clearing your city/state filters."
        />
      ) : (
        <div
          ref={parentRef}
          className="relative max-h-[640px] overflow-auto rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-card)] select-none"
        >
          <table className="w-full border-collapse text-xs text-left">
            {/* FROZEN HEADERS */}
            <thead className="sticky top-0 z-30 bg-[var(--surface-card)] shadow-xs">
              {/* Row 1: Fixed Column Headers + Rotated SKU Names */}
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                {/* Frozen Left Columns */}
                <th className="sticky left-0 z-40 bg-[var(--surface-raised)] p-2.5 w-32 min-w-[128px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  PO Number
                </th>
                <th className="sticky left-32 z-40 bg-[var(--surface-raised)] p-2.5 w-40 min-w-[160px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  Store / City
                </th>
                <th className="p-2.5 w-24 min-w-[96px] text-center font-semibold text-[var(--text-primary)]">
                  Expiry
                </th>
                <th className="p-2.5 w-28 min-w-[112px] text-center font-semibold text-[var(--text-primary)]">
                  State
                </th>
                <th className="p-2.5 w-32 min-w-[128px] font-semibold text-[var(--text-primary)]">
                  Planned Dispatch
                </th>
                <th className="p-2.5 w-40 min-w-[160px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  Remarks
                </th>

                {/* SKU Name Headers with Tooltip & Optional Inline Short-Name Edit */}
                {filteredSkus.map((sku) => (
                  <th
                    key={sku.item_id}
                    className="p-1.5 w-20 min-w-[80px] max-w-[80px] text-center border-r border-[var(--border-subtle)] align-bottom group relative"
                    title={`${sku.name}\nSKU ID: ${sku.item_id}\nClick to edit display short name`}
                  >
                    <div className="h-20 flex flex-col items-center justify-end pb-1 overflow-hidden">
                      <span className="transform -rotate-45 block whitespace-nowrap text-[10px] font-semibold text-[var(--text-secondary)] truncate w-20 cursor-help">
                        {sku.short_name || sku.name}
                      </span>
                    </div>
                  </th>
                ))}

                {/* Totals Headers */}
                <th className="p-2.5 w-24 min-w-[96px] text-right font-semibold text-[var(--text-primary)] border-l border-[var(--border-subtle)]">
                  Total Qty
                </th>
                <th className="p-2.5 w-28 min-w-[112px] text-right font-semibold text-[var(--text-primary)]">
                  Dispatched
                </th>
              </tr>

              {/* Row 2: Stock in Hand (Editable per SKU) */}
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <th className="sticky left-0 z-40 bg-[var(--surface-card)] p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  Stock in Hand
                </th>
                <td className="sticky left-32 z-40 bg-[var(--surface-card)] p-2 text-[10px] text-[var(--text-muted)] border-r border-[var(--border-subtle)]">
                  Editable per SKU
                </td>
                <td colSpan={4} className="border-r border-[var(--border-subtle)] bg-[var(--surface-card)]" />

                {filteredSkus.map((sku) => (
                  <td
                    key={sku.item_id}
                    className="p-1 border-r border-[var(--border-subtle)] text-center bg-[var(--surface-ground)]"
                  >
                    <input
                      type="number"
                      min="0"
                      key={`${sku.item_id}:${sku.stock_in_hand}`}
                      defaultValue={sku.stock_in_hand !== null ? sku.stock_in_hand : ''}
                      placeholder="—"
                      onBlur={(e) => handleStockBlur(sku.item_id, sku.stock_in_hand, e.target.value)}
                      className="w-full text-center text-xs font-mono font-bold bg-transparent rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-teal)] focus:bg-[var(--surface-card)] outline-none"
                    />
                  </td>
                ))}
                <td colSpan={2} className="border-l border-[var(--border-subtle)] bg-[var(--surface-card)]" />
              </tr>

              {/* Row 3: Open Orders */}
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <th className="sticky left-0 z-40 bg-[var(--surface-card)] p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  Open Orders
                </th>
                <td className="sticky left-32 z-40 bg-[var(--surface-card)] p-2 text-[10px] text-[var(--text-muted)] border-r border-[var(--border-subtle)]">
                  Sum of active lines
                </td>
                <td colSpan={4} className="border-r border-[var(--border-subtle)] bg-[var(--surface-card)]" />

                {filteredSkus.map((sku) => (
                  <td
                    key={sku.item_id}
                    className="p-2 border-r border-[var(--border-subtle)] text-center font-mono font-medium text-[var(--text-primary)]"
                  >
                    {formatUnits(sku.total_open_order)}
                  </td>
                ))}
                <td colSpan={2} className="border-l border-[var(--border-subtle)] bg-[var(--surface-card)]" />
              </tr>

              {/* Row 4: Net Balance (Red when negative, Green when positive, '–' when unknown) */}
              <tr className="border-b-2 border-[var(--border-strong)] bg-[var(--surface-raised)]">
                <th className="sticky left-0 z-40 bg-[var(--surface-raised)] p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                  Net Balance
                </th>
                <td className="sticky left-32 z-40 bg-[var(--surface-raised)] p-2 text-[10px] text-[var(--text-muted)] border-r border-[var(--border-subtle)]">
                  Stock − Open
                </td>
                <td colSpan={4} className="border-r border-[var(--border-subtle)] bg-[var(--surface-raised)]" />

                {filteredSkus.map((sku) => {
                  const isUnknown = sku.balance === null;
                  const isNegative = !isUnknown && sku.balance! < 0;
                  return (
                    <td
                      key={sku.item_id}
                      className={`p-2 border-r border-[var(--border-subtle)] text-center font-mono font-bold text-xs ${
                        isUnknown
                          ? 'text-[var(--text-muted)] bg-[var(--surface-raised)]'
                          : isNegative
                          ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
                          : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                      }`}
                    >
                      {isUnknown ? '–' : sku.balance! > 0 ? `+${sku.balance}` : sku.balance}
                    </td>
                  );
                })}
                <td colSpan={2} className="border-l border-[var(--border-subtle)] bg-[var(--surface-raised)]" />
              </tr>
            </thead>

            {/* VIRTUALIZED PO ROWS */}
            <tbody
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const { label: expiryLabel, isUrgent, isExpired } = daysLeft(row.expiry_date);

                return (
                  <tr
                    key={row.po_number}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    {/* Frozen Left: PO Number */}
                    <td
                      onClick={() => setSelectedPoNumber(row.po_number)}
                      className="sticky left-0 z-20 bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] p-2.5 w-32 min-w-[128px] font-mono font-semibold text-[var(--accent-teal)] cursor-pointer truncate border-r border-[var(--border-subtle)]"
                      title="Click to inspect PO details"
                    >
                      #{row.po_number}
                    </td>

                    {/* Frozen Left: Store & City */}
                    <td className="sticky left-32 z-20 bg-[var(--surface-card)] p-2.5 w-40 min-w-[160px] truncate border-r border-[var(--border-subtle)]">
                      <p className="font-semibold text-[var(--text-primary)] truncate" title={row.facility_raw}>
                        {row.facility_raw}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">
                        {row.city} ({row.facility_code || 'FC'})
                      </p>
                    </td>

                    {/* Expiry Pill */}
                    <td className="p-2 w-24 min-w-[96px] text-center self-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isExpired
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : isUrgent
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {expiryLabel}
                      </span>
                    </td>

                    {/* State Badge */}
                    <td className="p-2 w-28 min-w-[112px] text-center self-center">
                      <StateBadge state={row.po_state as StateType} size="sm" />
                    </td>

                    {/* Planned Dispatch Date Picker */}
                    <td className="p-1.5 w-32 min-w-[128px] self-center">
                      <input
                        type="date"
                        key={`${row.po_number}:date:${row.internal_dispatch_date || ''}`}
                        data-row={virtualRow.index}
                        data-col={0}
                        defaultValue={row.internal_dispatch_date || ''}
                        onKeyDown={(e) => handleKeyDown(e, virtualRow.index, 0)}
                        onBlur={(e) => {
                          if (e.target.value !== row.internal_dispatch_date) {
                            updateRowMutation.mutate({
                              po_number: row.po_number,
                              internal_dispatch_date: e.target.value || null,
                            });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-teal)] bg-transparent focus:bg-[var(--surface-input)] outline-none"
                      />
                    </td>

                    {/* Remarks Input */}
                    <td className="p-1.5 w-40 min-w-[160px] border-r border-[var(--border-subtle)] self-center">
                      <input
                        type="text"
                        key={`${row.po_number}:remarks:${row.remarks || ''}`}
                        data-row={virtualRow.index}
                        data-col={1}
                        defaultValue={row.remarks || ''}
                        placeholder="Add remarks..."
                        onKeyDown={(e) => handleKeyDown(e, virtualRow.index, 1)}
                        onBlur={(e) => {
                          if (e.target.value !== row.remarks) {
                            updateRowMutation.mutate({
                              po_number: row.po_number,
                              remarks: e.target.value,
                            });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-teal)] bg-transparent focus:bg-[var(--surface-input)] outline-none text-[var(--text-primary)]"
                      />
                    </td>

                    {/* SKU Quantities Matrix Cells */}
                    {filteredSkus.map((sku, colIdx) => {
                      const qty = row.sku_quantities[sku.item_id];
                      return (
                        <td
                          key={sku.item_id}
                          className="p-2 w-20 min-w-[80px] max-w-[80px] text-center border-r border-[var(--border-subtle)] font-mono self-center"
                        >
                          {qty !== undefined ? (
                            <span className="font-semibold text-[var(--text-primary)]">
                              {qty}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)] opacity-30">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Total Qty */}
                    <td className="p-2.5 w-24 min-w-[96px] text-right font-mono font-bold text-[var(--text-primary)] border-l border-[var(--border-subtle)] self-center">
                      {formatUnits(row.total_qty)}
                    </td>

                    {/* Qty Dispatched (Editable) */}
                    <td className="p-1.5 w-28 min-w-[112px] text-right self-center">
                      <input
                        type="number"
                        min="0"
                        data-row={virtualRow.index}
                        data-col={2}
                        defaultValue={row.qty_dispatched || 0}
                        onKeyDown={(e) => handleKeyDown(e, virtualRow.index, 2)}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 0 && val !== row.qty_dispatched) {
                            updateRowMutation.mutate({
                              po_number: row.po_number,
                              qty_dispatched: val,
                            });
                          }
                        }}
                        className="w-20 text-right px-2 py-1 text-xs font-mono font-semibold rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-teal)] bg-transparent focus:bg-[var(--surface-input)] outline-none text-[var(--accent-teal)]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. PO Detail Drawer */}
      <PODetailDrawer
        poNumber={selectedPoNumber}
        isOpen={Boolean(selectedPoNumber)}
        onClose={() => setSelectedPoNumber(null)}
        data={drawerData || null}
        isLoading={drawerLoading}
      />
    </div>
  );
}
