'use client';

import React, { useState } from 'react';
import Papa from 'papaparse';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Column,
  ConfirmDialog,
  SaveStatus,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { formatUnits, formatDate } from '@/lib/format';
import {
  UploadCloud,
  Boxes,
  FileCheck2,
  Clock,
  ArrowRight,
  Download,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';

interface StockItem {
  item_id: string;
  name: string;
  short_name?: string | null;
  upc: string;
  uom_text: string;
  qty_in_hand: number;
  updated_at: string;
  updated_by: string;
}

interface StockPreviewDiff {
  item_id: string;
  name: string;
  old_qty: number;
  new_qty: number;
  diff: number;
}

export default function StockPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [previewDiffs, setPreviewDiffs] = useState<StockPreviewDiff[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Query existing stock
  const { data, isLoading, isError, error, refetch } = useQuery<{ stock: StockItem[] }>({
    queryKey: ['stock-data'],
    queryFn: async () => {
      const res = await fetch('/api/stock?hub=delhi');
      if (!res.ok) throw new Error('Failed to load stock inventory');
      return res.json();
    },
  });

  const stockList = data?.stock || [];
  const latestUpdatedStock = stockList
    .map((s) => s.updated_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  // Stock CSV upload commit mutation
  const uploadStockMutation = useMutation({
    mutationFn: async (updates: Array<{ item_id: string; qty_in_hand: number }>) => {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, hub: 'delhi' }),
      });
      if (!res.ok) throw new Error('Failed to update stock');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-data'] });
      queryClient.invalidateQueries({ queryKey: ['planning'] });
      setPreviewDiffs(null);
      setFile(null);
      setConfirmOpen(false);
    },
  });

  // Handle CSV file selection & pre-flight diff
  const handleFileSelected = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMsg('Please select a valid CSV file.');
      return;
    }

    setErrorMsg(null);
    setFile(selectedFile);
    setIsParsing(true);

    Papa.parse<Record<string, unknown>>(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: true,
      complete: (results) => {
        try {
          const diffs: StockPreviewDiff[] = [];
          const stockMap = new Map(stockList.map((s) => [s.item_id, s]));

          results.data.forEach((row: any) => {
            const itemId = String(row.item_id || row['Item ID'] || row.id || '').trim();
            if (!itemId) return;

            const newQty = Number(row.qty_in_hand ?? row.qty ?? row.quantity ?? 0);
            if (isNaN(newQty) || newQty < 0) return;

            const existing = stockMap.get(itemId);
            const oldQty = existing?.qty_in_hand || 0;

            diffs.push({
              item_id: itemId,
              name: existing?.name || `SKU #${itemId}`,
              old_qty: oldQty,
              new_qty: newQty,
              diff: newQty - oldQty,
            });
          });

          if (diffs.length === 0) {
            setErrorMsg('No valid stock rows found. Required columns: item_id, qty (or qty_in_hand).');
            setPreviewDiffs(null);
          } else {
            setPreviewDiffs(diffs);
          }
        } catch (err: unknown) {
          setErrorMsg(err instanceof Error ? err.message : 'Error analyzing stock file');
        } finally {
          setIsParsing(false);
        }
      },
      error: (err) => {
        setIsParsing(false);
        setErrorMsg(`CSV parsing error: ${err.message}`);
      },
    });
  };

  const handleDownloadSampleCsv = () => {
    const header = 'item_id,qty_in_hand\n';
    const rows = stockList.slice(0, 5).map((s) => `${s.item_id},${s.qty_in_hand}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_stock_upload.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: Column<StockItem>[] = [
    {
      key: 'item_id',
      header: 'Item ID',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-semibold text-[var(--accent-teal)]">
          {item.item_id}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'SKU Name',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-semibold text-xs text-[var(--text-primary)]">{item.name}</p>
          {item.short_name && (
            <p className="text-[10px] text-[var(--text-muted)] font-mono">{item.short_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'uom_text',
      header: 'UOM',
      render: (item) => <span className="text-xs text-[var(--text-secondary)]">{item.uom_text || '—'}</span>,
    },
    {
      key: 'qty_in_hand',
      header: 'Stock in Hand',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
          {formatUnits(item.qty_in_hand)}
        </span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Last Updated',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-[var(--text-muted)]">
          {item.updated_at ? formatDate(item.updated_at) : 'Never'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Warehouse Inventory & Stock Upload"
        subtitle="Manage physical stock in hand across all Aksharveda SKUs. Stock changes immediately reflect in Planning net balances."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Stock Inventory' },
        ]}
        actions={
          latestUpdatedStock ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
              <span>
                Stock last updated at:{' '}
                <strong className="text-[var(--text-primary)]">
                  {new Date(latestUpdatedStock).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </strong>
              </span>
            </div>
          ) : undefined
        }
      />

      {/* Upload Dropzone & Diff Section */}
      <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            <UploadCloud className="w-4 h-4 text-[var(--accent-teal)]" />
            <span>Upload Stock Snapshot CSV</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadSampleCsv}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-teal)] hover:underline cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Sample CSV (item_id, qty)
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dropzone */}
        {!previewDiffs && (
          <div className="relative border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent-teal)]/50 rounded-xl p-6 text-center cursor-pointer transition bg-[var(--surface-ground)]">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {isParsing ? (
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-teal)]" />
                <span>Parsing stock CSV and building diff...</span>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Drag and drop your warehouse stock CSV, or <span className="font-semibold text-[var(--accent-teal)]">browse file</span>
              </p>
            )}
          </div>
        )}

        {/* Pre-Flight Preview Diff */}
        {previewDiffs && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] text-xs">
              <div>
                <span className="font-semibold text-[var(--text-primary)]">File: {file?.name}</span>
                <span className="text-[var(--text-muted)] ml-2">({previewDiffs.length} SKU updates detected)</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDiffs(null)}
                className="text-xs text-[var(--text-muted)] hover:text-rose-500"
              >
                Cancel
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-xs">
              {previewDiffs.map((d) => (
                <div key={d.item_id} className="p-2.5 flex items-center justify-between bg-[var(--surface-card)]">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)]">{d.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono ml-2">ID: {d.item_id}</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono">
                    <span className="text-[var(--text-muted)]">Old: {formatUnits(d.old_qty)}</span>
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className="font-bold text-[var(--text-primary)]">New: {formatUnits(d.new_qty)}</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                        d.diff > 0
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : d.diff < 0
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {d.diff > 0 ? `+${d.diff}` : d.diff}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPreviewDiffs(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] shadow-sm"
              >
                Confirm Stock Import ({previewDiffs.length} SKUs)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stock Inventory Table */}
      {isError ? (
        <ErrorState
          title="Failed to Load Stock Inventory"
          message={error instanceof Error ? error.message : 'Error'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={stockList}
          keyExtractor={(item) => item.item_id}
          isLoading={isLoading}
          loadingRows={8}
          stickyHeader
        />
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (previewDiffs) {
            uploadStockMutation.mutate(
              previewDiffs.map((d) => ({ item_id: d.item_id, qty_in_hand: d.new_qty }))
            );
          }
        }}
        isLoading={uploadStockMutation.isPending}
        title="Confirm Physical Stock Update"
        description={`Are you sure you want to update inventory counts for ${previewDiffs?.length} SKUs? This will immediately recalculate dispatch planning balances.`}
        confirmLabel="Apply Stock Update"
        variant="info"
      />
    </div>
  );
}
