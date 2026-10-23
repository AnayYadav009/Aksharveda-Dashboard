'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Hub } from '@/lib/types';
import { formatSkuName } from '@/lib/dispatch-state';
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
  ean?: string;
  display_name?: string;
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
interface StateHistoryItem { old_state: string; new_state: string; planned_dispatch_date: string | null; changed_by: string; changed_at: string; note: string | null }

export default function PlanningPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading Planning Sheet...</div>}>
      <PlanningContent />
    </Suspense>
  );
}

function PlanningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawHub = searchParams.get('hub');
  const hub: Hub = rawHub === 'kolkata' ? 'kolkata' : 'delhi';

  useEffect(() => {
    if (!rawHub) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('hub', hub);
      router.replace(`/planning?${params.toString()}`, { scroll: false });
    }
  }, [rawHub, hub, router, searchParams]);

  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);

  // Filters
  const [hideClosed, setHideClosed] = useState(true);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [rowSearch, setRowSearch] = useState('');
  const [expiryBucket, setExpiryBucket] = useState('');
  const [compact, setCompact] = useState(false);
  const [skuOrder, setSkuOrder] = useState<string[]>([]);
  const [hiddenSkuIds, setHiddenSkuIds] = useState<string[]>([]);
  const [showHiddenSkus, setShowHiddenSkus] = useState(false);
  const [skuHeaderMode, setSkuHeaderMode] = useState<'short' | 'full'>('short');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState('');
  const [onlyShortfall, setOnlyShortfall] = useState(false);

  useEffect(() => {
    try {
      setSkuOrder(JSON.parse(localStorage.getItem('planning-sku-order') || '[]'));
      setHiddenSkuIds(JSON.parse(localStorage.getItem('planning-hidden-skus') || '[]'));
      setSkuHeaderMode(localStorage.getItem('planning-sku-header-mode') === 'full' ? 'full' : 'short');
    } catch { /* ignore invalid saved preferences */ }
  }, []);

  const saveSkuOrder = (value: string[]) => {
    const complete = [...new Set([...value, ...(data?.skus || []).map(s => s.item_id)])];
    setSkuOrder(complete); localStorage.setItem('planning-sku-order', JSON.stringify(complete));
  };
  const toggleSkuHidden = (id: string) => {
    const next = hiddenSkuIds.includes(id) ? hiddenSkuIds.filter(x => x !== id) : [...hiddenSkuIds, id];
    setHiddenSkuIds(next); localStorage.setItem('planning-hidden-skus', JSON.stringify(next));
  };

  // Global & Per-cell save status
  const [globalSaveStatus, setGlobalSaveStatus] = useState<SaveState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date>(new Date());
  const [cellSaving, setCellSaving] = useState<Record<string, 'saving' | 'failed' | 'saved'>>({});

  // Drawer state
  const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);
  const [historyPo, setHistoryPo] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<StateHistoryItem[]>([]);

  const handleHubChange = (newHub: Hub) => {
    if (newHub === hub) return;
    setSelectedRows([]);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('hub', newHub);
    router.replace(`/planning?${nextParams.toString()}`, { scroll: false });
  };

  const openHistory = async (poNumber: string) => {
    if (historyPo === poNumber) { setHistoryPo(null); return; }
    setHistoryPo(poNumber);
    const response = await fetch(`/api/planning?hub=${hub}&history=${encodeURIComponent(poNumber)}`);
    const result = await response.json();
    if (response.ok) setHistoryItems(result.history || []);
  };

  // Data Query
  const { data, isLoading, isError, error, refetch } = useQuery<PlanningApiResponse>({
    queryKey: ['planning', hub, hideClosed, selectedCity, selectedState],
    queryFn: async () => {
      const p = new URLSearchParams({
        hub,
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
    queryKey: ['po-detail', hub, selectedPoNumber],
    queryFn: async () => {
      if (!selectedPoNumber) return null as any;
      const res = await fetch(`/api/pos/${selectedPoNumber}?hub=${hub}`);
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
        body: JSON.stringify({ ...payload, hub }),
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
      queryClient.invalidateQueries({ queryKey: ['planning', hub] });
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

  const dispatchMutation = useMutation({
    mutationFn: async (payload: { po_number?: string; rows?: string[]; operation: 'date' | 'state'; date?: string | null; state?: string; note?: string }) => {
      const res = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dispatch_state', hub, ...payload }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Dispatch update failed');
      return result;
    },
    onSuccess: (result) => {
      const warning = result.results?.find((r: { warning?: string }) => r.warning)?.warning;
      if (warning) window.alert(warning);
      queryClient.invalidateQueries({ queryKey: ['planning', hub] });
    },
    onError: (err) => window.alert(err instanceof Error ? err.message : 'Dispatch update failed'),
  });

  const bulkSchedule = () => {
    if (!bulkDate || selectedRows.length === 0) return;
    dispatchMutation.mutate({ operation: 'date', date: bulkDate, note: 'Bulk planned dispatch date update', rows: selectedRows });
  };

  // Optimistic Stock Mutation
  const updateStockMutation = useMutation({
    mutationFn: async (payload: { item_id: string; qty_in_hand: number }) => {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, hub }),
      });
      if (!res.ok) throw new Error('Stock update failed');
      return res.json();
    },
    onMutate: async ({ item_id, qty_in_hand }) => {
      setGlobalSaveStatus('saving');
      setCellSaving((prev) => ({ ...prev, [`stock:${item_id}`]: 'saving' }));

      // Optimistically update query data
      queryClient.setQueryData<PlanningApiResponse>(
        ['planning', hub, hideClosed, selectedCity, selectedState],
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

  // Filtered SKUs (shortfall filter & search)
  // Shortfall is strictly defined as known stock < open order (balance < 0)
  const filteredSkus = useMemo(() => {
    if (!data?.skus) return [];
    const matches = data.skus.filter((s) => {
      if (onlyShortfall) {
        if (s.balance === null || s.balance >= 0) return false;
      }
      if (skuSearch) {
        const q = skuSearch.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.ean || '').toLowerCase().includes(q) ||
          (s.short_name && s.short_name.toLowerCase().includes(q)) ||
          s.item_id.includes(q)
        );
      }
      return true;
    });
    const ordered = [...matches].sort((a, b) => {
      const ai = skuOrder.indexOf(a.item_id), bi = skuOrder.indexOf(b.item_id);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.name.localeCompare(b.name);
    });
    return showHiddenSkus ? ordered : ordered.filter(s => !hiddenSkuIds.includes(s.item_id));
  }, [data?.skus, onlyShortfall, skuSearch, skuOrder, hiddenSkuIds, showHiddenSkus]);

  const rows = useMemo(() => (data?.rows || []).filter((row) => {
    const q = rowSearch.trim().toLowerCase();
    if (q && !row.po_number.toLowerCase().includes(q) && !row.facility_raw.toLowerCase().includes(q) && !row.city.toLowerCase().includes(q)) return false;
    if (expiryBucket === 'urgent' && row.days_to_expiry > 3) return false;
    if (expiryBucket === 'week' && (row.days_to_expiry < 4 || row.days_to_expiry > 7)) return false;
    if (expiryBucket === 'later' && row.days_to_expiry <= 7) return false;
    return true;
  }), [data?.rows, rowSearch, expiryBucket]);

  // Virtualizer for 400+ Rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => compact ? 34 : 44,
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

  // Export to Excel handler
  const handleExportExcel = () => {
    const p = new URLSearchParams({
      hub,
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
          <input aria-label="Search purchase orders or stores" value={rowSearch} onChange={e => setRowSearch(e.target.value)} placeholder="Search PO or store" className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]" />
          <select aria-label="Filter by expiry" value={expiryBucket} onChange={e => setExpiryBucket(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]"><option value="">All expiry dates</option><option value="urgent">0–3 days</option><option value="week">4–7 days</option><option value="later">Over 7 days</option></select>
          <button type="button" onClick={() => setCompact(!compact)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-hover)] text-[var(--text-secondary)]">{compact ? 'Compact' : 'Comfortable'}</button>
          <button type="button" onClick={() => { const next = skuHeaderMode === 'short' ? 'full' : 'short'; setSkuHeaderMode(next); localStorage.setItem('planning-sku-header-mode', next); }} className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-hover)] text-[var(--text-secondary)]">{skuHeaderMode === 'short' ? 'Short SKU names' : 'Full SKU names'}</button>
          {hiddenSkuIds.length > 0 && <button type="button" onClick={() => setShowHiddenSkus(!showHiddenSkus)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-hover)] text-[var(--text-secondary)]">{showHiddenSkus ? 'Hide excluded SKUs' : `Show excluded SKUs (${hiddenSkuIds.length})`}</button>}
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
        {selectedRows.length > 0 && <div className="flex items-center gap-2 basis-full border-t border-[var(--border-subtle)] pt-2">
          <span className="font-semibold text-[var(--text-primary)]">{selectedRows.length} selected</span>
          <input aria-label="Bulk planned dispatch date" type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-input)]" />
          <button type="button" disabled={!bulkDate || dispatchMutation.isPending} onClick={bulkSchedule} className="px-3 py-1 rounded bg-[var(--accent-teal)] text-white disabled:opacity-50">Schedule selected</button>
          <button type="button" onClick={() => setSelectedRows([])} className="px-2 py-1 text-[var(--text-muted)]">Clear</button>
        </div>}
      </div>

      {/* 3. Sticky Summary Strip */}
      <div className="sticky top-16 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] backdrop-blur-md shadow-xs text-xs" style={{ zIndex: "var(--z-topbar)" }}>
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
          <table className="w-max min-w-full table-fixed border-collapse text-xs text-left tabular-nums">
            <colgroup><col style={{ width: 44 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} />{filteredSkus.map(s => <col key={s.item_id} style={{ width: 110 }} />)}<col style={{ width: 96 }} /><col style={{ width: 112 }} /></colgroup>
            {/* FROZEN HEADERS */}
            <thead className="sticky top-0 bg-[var(--surface-card)] shadow-xs" style={{ zIndex: "var(--z-table-sticky)" }}>
              <tr className="h-7 bg-[var(--surface-ground)] border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"><th colSpan={7} className="sticky left-0 text-left px-3" style={{ zIndex: "var(--z-table-sticky-corner)" }}>PO planning</th><th colSpan={filteredSkus.length} className="text-left px-3">SKU quantities</th><th colSpan={2} className="text-left px-3">Totals</th></tr>
              {/* Row 1: Fixed Column Headers + Rotated SKU Names */}
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] h-[72px]">
                <th className="sticky left-0 bg-[var(--surface-raised)]" style={{ zIndex: "var(--z-table-sticky-corner)" }} aria-label="Select rows"><input type="checkbox" aria-label="Select visible rows" checked={rows.length > 0 && rows.every(r => selectedRows.includes(r.po_number))} onChange={e => setSelectedRows(e.target.checked ? rows.map(r => r.po_number) : [])} /></th>
                {/* Frozen Left Columns */}
                <th className="sticky left-11 p-2.5 w-[150px] min-w-[150px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ zIndex: "var(--z-table-sticky-corner)" }}>
                  PO Number
                </th>
                <th className="sticky left-[194px] p-2.5 w-[200px] min-w-[200px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ zIndex: "var(--z-table-sticky-corner)" }}>
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
                    className="p-1.5 w-[110px] min-w-[110px] max-w-[110px] text-center border-r border-[var(--border-subtle)] align-bottom group relative"
                    title={`${sku.name}\nSKU ID: ${sku.item_id}\nClick to edit display short name`}
                  >
                    <div className="h-[68px] flex flex-col items-start justify-center overflow-hidden text-left">
                      <span className="line-clamp-2 text-xs font-semibold text-[var(--text-primary)] w-full">{skuHeaderMode === 'full' ? (sku.display_name || sku.short_name || sku.name) : formatSkuName(sku.display_name || sku.short_name || sku.name)}</span>
                      <div className="flex items-center gap-1"><button type="button" className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-teal)] truncate" title="Copy EAN" onClick={() => void navigator.clipboard?.writeText(sku.ean || sku.item_id)}>{sku.ean || sku.item_id}</button><button type="button" title="Hide SKU" aria-label={`Hide ${sku.name}`} onClick={() => toggleSkuHidden(sku.item_id)} className="text-[10px] text-[var(--text-muted)]">×</button></div>
                      <div className="flex gap-1"><button type="button" aria-label="Move SKU left" onClick={() => { const ids = filteredSkus.map(s => s.item_id); const i = ids.indexOf(sku.item_id); if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; saveSkuOrder(ids); } }} className="text-[10px] text-[var(--text-muted)]">←</button><button type="button" aria-label="Move SKU right" onClick={() => { const ids = filteredSkus.map(s => s.item_id); const i = ids.indexOf(sku.item_id); if (i >= 0 && i < ids.length - 1) { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; saveSkuOrder(ids); } }} className="text-[10px] text-[var(--text-muted)]">→</button></div>
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
                <th colSpan={2} className="sticky left-0 p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-strong)] bg-[var(--surface-card)] text-left" style={{ zIndex: "var(--z-table-sticky-corner)" }}>Stock in Hand · Editable per SKU</th>
                <td colSpan={5} className="border-r border-[var(--border-subtle)] bg-[var(--surface-card)]" />

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
                <th colSpan={2} className="sticky left-0 p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-strong)] bg-[var(--surface-card)] text-left" style={{ zIndex: "var(--z-table-sticky-corner)" }}>Open Orders · Sum of active lines</th>
                <td colSpan={5} className="border-r border-[var(--border-subtle)] bg-[var(--surface-card)]" />

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
                <th colSpan={2} className="sticky left-0 p-2 font-bold text-[var(--text-primary)] border-r border-[var(--border-strong)] bg-[var(--surface-raised)] text-left" style={{ zIndex: "var(--z-table-sticky-corner)" }}>Net Balance · Stock − Open</th>
                <td colSpan={5} className="border-r border-[var(--border-subtle)] bg-[var(--surface-raised)]" />

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
                    className={`flex border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] transition-colors ${virtualRow.index % 2 ? 'bg-[var(--surface-ground)]' : 'bg-[var(--surface-card)]'} ${compact ? 'text-[11px]' : ''}`}
                  >
                    <td className="w-11 min-w-11 flex items-center justify-center"><input type="checkbox" aria-label={`Select PO ${row.po_number}`} checked={selectedRows.includes(row.po_number)} onChange={e => setSelectedRows(prev => e.target.checked ? [...prev, row.po_number] : prev.filter(x => x !== row.po_number))} /></td>
                    {/* Frozen Left: PO Number */}
                    <td
                      onClick={() => setSelectedPoNumber(row.po_number)}
                      className="sticky left-11 p-2.5 w-[150px] min-w-[150px] font-mono font-semibold text-[var(--accent-teal)] cursor-pointer truncate border-r border-[var(--border-strong)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)]" style={{ zIndex: "var(--z-table-sticky)" }}
                      title="Click to inspect PO details"
                    >
                      #{row.po_number}
                    </td>

                    {/* Frozen Left: Store & City */}
                    <td className="sticky left-[194px] p-2.5 w-[200px] min-w-[200px] truncate border-r border-[var(--border-strong)] bg-[var(--surface-card)]" style={{ zIndex: "var(--z-table-sticky)" }}>
                      <p className="font-semibold text-[var(--text-primary)] truncate" title={row.facility_raw}>
                        {row.facility_raw}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">
                        {row.city} ({row.facility_code || 'FC'})
                      </p>
                    </td>

                    {/* Expiry Pill */}
                    <td className="p-2 w-[110px] min-w-[110px] text-center self-center">
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
                    <td className="relative p-2 w-[130px] min-w-[130px] text-center self-center">
                      <div className="flex flex-col items-center gap-1">
                        <StateBadge state={row.po_state as StateType} size="sm" />
                        <button type="button" onClick={() => void openHistory(row.po_number)} className="text-[9px] text-[var(--text-muted)] underline">History</button>
                        {historyPo === row.po_number && <div className="absolute mt-12 z-50 w-64 max-h-48 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 text-left shadow-lg">{historyItems.length ? historyItems.map((item, i) => <div key={`${item.changed_at}:${i}`} className="border-b last:border-0 border-[var(--border-subtle)] py-1"><strong>{item.old_state} → {item.new_state}</strong><div>{item.note || 'State changed'} · {formatDate(item.changed_at)}</div><div className="text-[var(--text-muted)]">{item.changed_by} {item.planned_dispatch_date ? `· ${item.planned_dispatch_date}` : ''}</div></div>) : <span className="text-[var(--text-muted)]">No state history yet.</span>}</div>}
                        <div className="flex gap-1">
                          {row.po_state === 'SCHEDULED' && <button type="button" onClick={() => dispatchMutation.mutate({ po_number: row.po_number, operation: 'state', state: 'DISPATCHED' })} className="text-[9px] px-1.5 rounded bg-[var(--accent-teal)] text-white">Dispatched</button>}
                          {row.po_state === 'DISPATCHED' && <button type="button" onClick={() => dispatchMutation.mutate({ po_number: row.po_number, operation: 'state', state: 'DELIVERED' })} className="text-[9px] px-1.5 rounded bg-emerald-600 text-white">Delivered</button>}
                          {['UNSCHEDULED', 'SCHEDULED'].includes(row.po_state) && <button type="button" onClick={() => dispatchMutation.mutate({ po_number: row.po_number, operation: 'state', state: 'CANCELLED' })} className="text-[9px] px-1.5 rounded border border-rose-400 text-rose-600">Cancel</button>}
                        </div>
                      </div>
                    </td>

                    {/* Planned Dispatch Date Picker */}
                    <td className="p-1.5 w-[150px] min-w-[150px] self-center">
                      <input
                        type="date"
                        key={`${row.po_number}:date:${row.internal_dispatch_date || ''}`}
                        data-row={virtualRow.index}
                        data-col={0}
                        defaultValue={row.internal_dispatch_date || ''}
                        onKeyDown={(e) => handleKeyDown(e, virtualRow.index, 0)}
                        disabled={['DISPATCHED', 'DELIVERED', 'CANCELLED', 'EXPIRED'].includes(row.po_state)}
                        onBlur={(e) => {
                          if (e.target.value !== row.internal_dispatch_date) {
                            dispatchMutation.mutate({ po_number: row.po_number, operation: 'date', date: e.target.value || null });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-teal)] bg-transparent focus:bg-[var(--surface-input)] outline-none"
                      />
                    </td>

                    {/* Remarks Input */}
                    <td className="p-1.5 w-[200px] min-w-[200px] border-r border-[var(--border-subtle)] self-center">
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
                          className="p-2 w-[110px] min-w-[110px] max-w-[110px] text-center border-r border-[var(--border-subtle)] font-mono self-center"
                          title={sku.balance !== null && sku.balance < 0 ? `Stock shortfall: ${Math.abs(sku.balance)} units` : undefined}
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
