'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui';
import { UploadLog, InAppNotification } from '@/lib/types';
import { formatINR, formatUnits, formatDate } from '@/lib/format';
import {
  Mail,
  Smartphone,
  CheckCircle2,
  Bell,
  Clock,
  Layers,
  FileText,
  AlertTriangle,
} from 'lucide-react';

export default function NotificationPreviewPage() {
  const { data: uploadsData } = useQuery<{ uploads: UploadLog[] }>({
    queryKey: ['uploads-history'],
    queryFn: async () => {
      const res = await fetch('/api/uploads?hub=delhi');
      return res.json();
    },
  });

  const latestUpload = uploadsData?.uploads?.[0];

  const uploadSummary = latestUpload ? {
    new_pos: latestUpload.pos_new,
    total_units: latestUpload.total_units,
    total_amount: latestUpload.total_amount,
    fileName: latestUpload.file_name,
  } : null;

  return (
    <div className="space-y-6 pb-16 max-w-5xl">
      <PageHeader
        title="Notification Preview Panel"
        subtitle="Live rendered preview of automated dispatch alerts formatted for Email (Resend) and WhatsApp (Meta Cloud API)."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Settings' },
          { label: 'Notification Preview' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* EMAIL PREVIEW */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              <Mail className="w-4 h-4 text-sky-500" />
              <span>Email Dispatch Template (HTML / Text)</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Resend Provider</span>
          </div>

          <div className="p-5 flex-1 space-y-4 text-xs font-sans">
            {/* Fake Email Envelope Header */}
            <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] space-y-1 font-mono text-[11px]">
              <div>
                <span className="text-[var(--text-muted)]">From:</span>{' '}
                <span className="text-[var(--text-primary)]">alerts@aksharveda.com (Aksharveda Ops)</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Subject:</span>{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  [Blinkit PO Ingested] {uploadSummary?.new_pos ?? 0} New Purchase Orders
                </span>
              </div>
            </div>

            {/* Email Body Card */}
            <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-ground)] space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--accent-teal)] text-white font-bold flex items-center justify-center text-xs">
                  A
                </div>
                <span className="font-bold text-sm text-[var(--text-primary)]">Aksharveda Operations Hub</span>
              </div>

              <p className="text-[var(--text-secondary)]">
                A new Blinkit Purchase Order batch export was successfully ingested into PostgreSQL.
              </p>

              <div className="p-3 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">New POs Ingested:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{uploadSummary?.new_pos ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Total Units Ordered:</span>
                  <span className="font-bold text-[var(--text-primary)]">{formatUnits(uploadSummary?.total_units ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Total PO Value:</span>
                  <span className="font-bold text-[var(--text-primary)]">{formatINR(uploadSummary?.total_amount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Earliest Expiry:</span>
                  <span className="font-bold text-amber-500">{uploadSummary ? uploadSummary.fileName : 'No uploads yet'}</span>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="/pos"
                  className="inline-block px-4 py-2 text-xs font-semibold rounded bg-[var(--accent-teal)] text-white shadow-xs"
                >
                  Open PO Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* WHATSAPP PREVIEW */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>WhatsApp Cloud API Message (Meta)</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Template: po_batch_ingested</span>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center items-center bg-[var(--surface-ground)]">
            {/* WhatsApp Bubble */}
            <div className="w-full max-w-sm p-4 rounded-2xl rounded-tl-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 shadow-sm space-y-2.5 text-xs text-slate-800 dark:text-emerald-100">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">
                  🔔 Blinkit PO Dispatch Alert
                </span>
                <span className="text-[10px] opacity-60 font-mono">14:02 IST</span>
              </div>

              <p className="leading-relaxed">
                *Aksharveda Operations Update*
                <br />A new PO batch export has been ingested.
              </p>

              <div className="space-y-1 font-mono text-[11px] bg-white/60 dark:bg-black/20 p-2.5 rounded-lg border border-emerald-500/20">
                <p>📦 *New POs:* +{uploadSummary?.new_pos ?? 0}</p>
                <p>📊 *Units:* {formatUnits(uploadSummary?.total_units ?? 0)}</p>
                <p>💰 *Value:* {formatINR(uploadSummary?.total_amount ?? 0)}</p>
                <p>📄 *Upload:* {uploadSummary?.fileName ?? 'No uploads yet'}</p>
              </div>

              <p className="text-[11px] opacity-75">
                Review line-item allocation on the dispatch planning grid.
              </p>

              <div className="pt-1 flex items-center justify-between text-[10px] opacity-60">
                <span>Aksharveda Ops Bot</span>
                <span>✓✓ Delivered</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
