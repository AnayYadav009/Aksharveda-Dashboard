'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Column,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { UploadLog } from '@/lib/types';
import { UploadDetailDrawer } from '@/components/upload/UploadDetailDrawer';
import { formatINR, formatUnits, formatDate } from '@/lib/format';
import {
  History,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Eye,
} from 'lucide-react';

export default function UploadsHistoryPage() {
  const [selectedUpload, setSelectedUpload] = useState<UploadLog | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{ uploads: UploadLog[] }>({
    queryKey: ['uploads-history'],
    queryFn: async () => {
      const res = await fetch('/api/uploads');
      if (!res.ok) throw new Error('Failed to fetch upload logs');
      return res.json();
    },
  });

  const uploads = data?.uploads || [];

  const columns: Column<UploadLog>[] = [
    {
      key: 'uploaded_at',
      header: 'Uploaded Date',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-medium text-[var(--text-primary)] block">
            {formatDate(item.uploaded_at)}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {new Date(item.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ),
    },
    {
      key: 'file_name',
      header: 'File Name',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-primary)]">
          <FileText className="w-3.5 h-3.5 text-[var(--accent-teal)] shrink-0" />
          <span className="truncate max-w-[200px]" title={item.file_name}>
            {item.file_name}
          </span>
        </div>
      ),
    },
    {
      key: 'hub',
      header: 'Hub',
      sortable: true,
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            item.hub === 'kolkata'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              : 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20'
          }`}
        >
          {item.hub || 'delhi'}
        </span>
      ),
    },
    {
      key: 'uploaded_by',
      header: 'Uploaded By',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-[var(--text-secondary)]">
          {item.uploaded_by}
        </span>
      ),
    },
    {
      key: 'total_units',
      header: 'Units',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
          {item.total_units ? formatUnits(item.total_units) : '—'}
        </span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Value (₹)',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
          {item.total_amount ? formatINR(item.total_amount) : '—'}
        </span>
      ),
    },
    {
      key: 'pos_new',
      header: 'New POs',
      align: 'center',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
          +{item.pos_new}
        </span>
      ),
    },
    {
      key: 'pos_updated',
      header: 'Updated',
      align: 'center',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs font-medium text-sky-600 dark:text-sky-400">
          {item.pos_updated}
        </span>
      ),
    },
    {
      key: 'pos_unchanged',
      header: 'Unchanged',
      align: 'center',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {item.pos_unchanged}
        </span>
      ),
    },
    {
      key: 'rows_rejected',
      header: 'Rejected',
      align: 'center',
      sortable: true,
      render: (item) => (
        <span
          className={`font-mono text-xs font-semibold ${
            item.rows_rejected > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-muted)]'
          }`}
        >
          {item.rows_rejected}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Details',
      align: 'center',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedUpload(item);
          }}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-teal)] hover:bg-[var(--surface-hover)] transition cursor-pointer"
          title="View audit details"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload History & Audit Trail"
        subtitle="Complete log of all Blinkit PO CSV imports, row level reconciliations, and error manifests."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Upload History' },
        ]}
        actions={
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload New CSV</span>
          </Link>
        }
      />

      {isError ? (
        <ErrorState
          title="Failed to Load Upload History"
          message={error instanceof Error ? error.message : 'An error occurred'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={uploads}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          loadingRows={5}
          onRowClick={(item) => setSelectedUpload(item)}
          emptyState={
            <EmptyState
              title="No Upload History Recorded"
              description="No Blinkit PO bulk files have been imported yet. Use the upload wizard to begin."
              action={
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload First CSV
                </Link>
              }
            />
          }
        />
      )}

      {/* Upload Detail Drawer */}
      <UploadDetailDrawer
        upload={selectedUpload}
        isOpen={Boolean(selectedUpload)}
        onClose={() => setSelectedUpload(null)}
      />
    </div>
  );
}
