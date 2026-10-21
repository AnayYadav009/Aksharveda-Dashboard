'use client';

import React from 'react';
import { Drawer } from '@/components/ui';
import { UploadLog, RejectedRow } from '@/lib/types';
import { formatINR, formatUnits, formatDate } from '@/lib/format';
import {
  FileText,
  User,
  Calendar,
  AlertTriangle,
  Boxes,
  IndianRupee,
  Download,
  CheckCircle2,
  Layers,
} from 'lucide-react';

interface UploadDetailDrawerProps {
  upload: UploadLog | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UploadDetailDrawer({
  upload,
  isOpen,
  onClose,
}: UploadDetailDrawerProps) {
  if (!upload) return null;

  const errorReport = upload.error_report || [];

  const handleDownloadErrors = () => {
    if (errorReport.length === 0) return;
    const header = ['row_number', 'po_number', 'item_id', 'reason'];
    const rows = errorReport.map((r) => [
      r.row_number,
      `"${r.po_number || ''}"`,
      `"${r.item_id || ''}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [header.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `errors_${upload.file_name || 'upload'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      title={
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--accent-teal)]" />
          <span className="font-semibold text-[var(--text-primary)]">
            Upload Audit Details
          </span>
        </div>
      }
      description={
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {upload.file_name} • Upload ID: {upload.id.slice(0, 8)}...
        </span>
      }
      footer={
        <div className="w-full flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">Audit Log ID: {upload.id}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition cursor-pointer"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Meta Header */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--surface-ground)] border border-[var(--border-subtle)] text-xs">
          <div>
            <span className="text-[var(--text-muted)] block text-[11px] uppercase tracking-wider">
              Uploaded At
            </span>
            <span className="font-medium text-[var(--text-primary)] mt-0.5 block">
              {new Date(upload.uploaded_at).toLocaleString([], {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>

          <div>
            <span className="text-[var(--text-muted)] block text-[11px] uppercase tracking-wider">
              Uploaded By
            </span>
            <span className="font-medium text-[var(--text-primary)] mt-0.5 block">
              {upload.uploaded_by}
            </span>
          </div>

          <div>
            <span className="text-[var(--text-muted)] block text-[11px] uppercase tracking-wider">
              Total Valid Units
            </span>
            <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block">
              {formatUnits(upload.total_units || 0)}
            </span>
          </div>

          <div>
            <span className="text-[var(--text-muted)] block text-[11px] uppercase tracking-wider">
              Total Valid Value
            </span>
            <span className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 block">
              {formatINR(upload.total_amount || 0)}
            </span>
          </div>
        </div>

        {/* PO Breakdown Tiles */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            PO Ingestion Impact
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                New POs
              </span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                +{upload.pos_new}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <span className="text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                Updated POs
              </span>
              <p className="text-xl font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                {upload.pos_updated}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                Unchanged POs
              </span>
              <p className="text-xl font-bold font-mono text-[var(--text-primary)] mt-1">
                {upload.pos_unchanged}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400">
                Rejected Rows
              </span>
              <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {upload.rows_rejected}
              </p>
            </div>
          </div>
        </div>

        {/* Rejected Rows / Errors Section */}
        {upload.rows_rejected > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Rejected Row Errors ({errorReport.length})
              </h4>
              {errorReport.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  Download Error CSV
                </button>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)] text-xs">
                {errorReport.map((r, i) => (
                  <div key={i} className="p-2.5 bg-[var(--surface-ground)]">
                    <div className="flex items-center justify-between font-mono font-medium text-[var(--text-primary)]">
                      <span>Row #{r.row_number}</span>
                      {r.po_number && <span className="text-[var(--accent-teal)]">PO: {r.po_number}</span>}
                    </div>
                    <p className="text-rose-600 dark:text-rose-400 text-xs mt-1">
                      {r.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
