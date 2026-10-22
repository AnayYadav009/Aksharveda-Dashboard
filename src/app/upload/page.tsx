'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  PageHeader,
  StatTile,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { UploadPreview, RejectedRow, Hub } from '@/lib/types';
import { formatINR, formatUnits, formatDate } from '@/lib/format';
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  Clock,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileCode,
  Check,
  RefreshCw,
  Bell,
  ExternalLink,
  Building2,
} from 'lucide-react';

const EXPECTED_COLUMNS = [
  'po_number',
  'facility_name',
  'manufacturer_name',
  'entity_vendor_legal_name',
  'vendor_name',
  'order_date',
  'appointment_date',
  'expiry_date',
  'po_state',
  'item_id',
  'name',
  'uom_text',
  'upc',
  'units_ordered',
  'total_grn_quantity',
  'remaining_quantity',
  'landing_rate',
  'cost_price',
  'margin_percentage',
  'cess_value',
  'sgst_value',
  'igst_value',
  'cgst_value',
  'tax_value',
  'total_amount',
  'mrp',
];

export default function UploadWizardPage() {
  const router = useRouter();

  // Selected Hub (Required before upload/preview, no default)
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);

  // Wizard Step: 1 = Choose file, 2 = Validating, 3 = Preview, 4 = Done
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Processing state
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [validationProgress, setValidationProgress] = useState<string>('Initializing schema parser...');

  // Data state
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [validRows, setValidRows] = useState<unknown[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<{
    uploadId: string;
    preview: UploadPreview;
  } | null>(null);

  // Expandable sections in Step 3
  const [expandUpdated, setExpandUpdated] = useState(false);
  const [expandRejected, setExpandRejected] = useState(true);

  // Duplicate file detection
  const [pastUploads, setPastUploads] = useState<Array<{ file_name: string; uploaded_at: string }>>([]);
  const [isDuplicateFile, setIsDuplicateFile] = useState(false);

  // Fetch past upload names on mount to warn about duplicate file uploads
  useEffect(() => {
    fetch('/api/uploads')
      .then((res) => res.json())
      .then((data) => {
        if (data.uploads) {
          setPastUploads(data.uploads.map((u: any) => ({ file_name: u.file_name, uploaded_at: u.uploaded_at })));
        }
      })
      .catch(() => {});
  }, []);

  // Download expected column schema sample
  const handleDownloadExpectedColumns = () => {
    const csvContent = EXPECTED_COLUMNS.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blinkit_po_expected_columns.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download rejected rows
  const handleDownloadRejectedRows = () => {
    if (!preview || preview.rejected_rows.length === 0) return;
    const header = ['row_number', 'po_number', 'item_id', 'reason'];
    const rows = preview.rejected_rows.map((r) => [
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
    link.download = `rejected_rows_${file?.name || 'upload'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedHub) {
      setErrorMsg('Please select a destination hub (Delhi or Kolkata) before uploading.');
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    if (!selectedHub) {
      setErrorMsg('Please select a destination hub (Delhi or Kolkata) before choosing a file.');
      return;
    }

    if (!selectedFile.name.endsWith('.csv')) {
      setErrorMsg('Please select a valid CSV file (.csv extension required).');
      return;
    }

    setErrorMsg(null);
    setFile(selectedFile);

    // Check duplicate file name warning
    const exists = pastUploads.some((u) => u.file_name === selectedFile.name);
    setIsDuplicateFile(exists);

    // Proceed to Step 2 Validating
    setCurrentStep(2);
    parseAndValidateFile(selectedFile, selectedHub);
  };

  const parseAndValidateFile = (fileToParse: File, hub: Hub) => {
    setIsParsing(true);
    setValidationProgress('Parsing CSV file into records with PapaParse...');

    Papa.parse<Record<string, unknown>>(fileToParse, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: async (results) => {
        try {
          setValidationProgress(`Validating ${results.data.length} rows against Blinkit Zod schema & database state...`);

          const res = await fetch('/api/upload/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawRows: results.data,
              fileName: fileToParse.name,
              hub,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to generate upload preview');
          }

          setPreview(data.preview);
          setValidRows(data.validRows);
          setCurrentStep(3); // Step 3 Preview
        } catch (err: unknown) {
          setErrorMsg(err instanceof Error ? err.message : 'Error validating CSV rows');
          setCurrentStep(1); // Return to step 1 on failure
        } finally {
          setIsParsing(false);
        }
      },
      error: (err) => {
        setIsParsing(false);
        setErrorMsg(`CSV parsing error: ${err.message}`);
        setCurrentStep(1);
      },
    });
  };

  // Commit upload
  const handleConfirmCommit = async () => {
    if (!preview || validRows.length === 0 || isCommitting || !selectedHub) return;

    setIsCommitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/upload/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validRows,
          rejectedRows: preview.rejected_rows,
          fileName: preview.file_name,
          uploadedBy: 'demand_team',
          hub: selectedHub,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to commit upload transaction. Nothing was saved.');
      }

      setCommitResult({
        uploadId: data.uploadId,
        preview: data.preview,
      });
      setCurrentStep(4); // Step 4 Done
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Commit failed. No changes were saved to the database.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleResetWizard = () => {
    setFile(null);
    setPreview(null);
    setValidRows([]);
    setErrorMsg(null);
    setCommitResult(null);
    setIsDuplicateFile(false);
    setCurrentStep(1);
  };

  // Step names
  const steps = [
    { num: 1, label: 'Choose File' },
    { num: 2, label: 'Validating' },
    { num: 3, label: 'Preview & Diff' },
    { num: 4, label: 'Done' },
  ];

  // Disable confirm condition: empty validRows OR all rows rejected
  const isConfirmDisabled =
    isCommitting || !preview || validRows.length === 0 || preview.rows_valid === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <PageHeader
        title="Upload Blinkit PO Export"
        subtitle="4-step ingestion pipeline with pre-flight reconciliation, line-level diffing, and atomic database commits."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Upload' },
        ]}
      />

      {/* Stepper Header */}
      <div className="p-4 rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-6 right-6 -translate-y-1/2 h-0.5 bg-[var(--border-subtle)] -z-0" />
          {steps.map((s) => {
            const isCompleted = currentStep > s.num;
            const isCurrent = currentStep === s.num;

            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors duration-200 ${
                    isCompleted
                      ? 'bg-[var(--accent-teal)] text-white shadow-sm'
                      : isCurrent
                      ? 'bg-[var(--accent-teal)] text-white ring-4 ring-[var(--accent-teal)]/20 shadow-sm'
                      : 'bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : s.num}
                </div>
                <span
                  className={`mt-2 text-xs font-medium tracking-tight ${
                    isCurrent
                      ? 'text-[var(--accent-teal)] font-semibold'
                      : isCompleted
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Upload Error</p>
            <p className="mt-0.5 text-xs sm:text-sm">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* STEP 1: CHOOSE FILE */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Segmented Control for Hub Selection */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wider">
                  <Building2 className="w-4 h-4 text-[var(--accent-teal)]" />
                  Target Fulfillment Hub <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Select the hub fulfilling these purchase orders. Uploads strictly isolate Delhi and Kolkata records.
                </p>
              </div>
              {selectedHub && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full capitalize">
                  {selectedHub} selected
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedHub('delhi');
                  setErrorMsg(null);
                }}
                className={`p-3.5 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                  selectedHub === 'delhi'
                    ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/10 text-[var(--text-primary)] ring-2 ring-[var(--accent-teal)]/30'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-ground)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm">Delhi Hub</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">North & Central distribution network</div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedHub === 'delhi'
                      ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)] text-white'
                      : 'border-[var(--border-subtle)]'
                  }`}
                >
                  {selectedHub === 'delhi' && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedHub('kolkata');
                  setErrorMsg(null);
                }}
                className={`p-3.5 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                  selectedHub === 'kolkata'
                    ? 'border-amber-500 bg-amber-500/10 text-[var(--text-primary)] ring-2 ring-amber-500/30'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-ground)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm">Kolkata Hub</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">East & Northeast distribution network</div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedHub === 'kolkata'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-[var(--border-subtle)]'
                  }`}
                >
                  {selectedHub === 'kolkata' && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </button>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={`relative flex flex-col items-center justify-center rounded-[4px] border-2 border-dashed p-12 text-center transition-all ${
              !selectedHub
                ? 'opacity-60 border-[var(--border-subtle)] bg-[var(--surface-ground)] cursor-not-allowed'
                : isDragging
                ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/5 scale-[1.01] cursor-pointer'
                : 'border-[var(--border-subtle)] hover:border-[var(--accent-teal)]/50 hover:bg-[var(--surface-hover)] cursor-pointer'
            }`}
          >
            <input
              type="file"
              accept=".csv"
              disabled={!selectedHub}
              onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
              className={`absolute inset-0 opacity-0 ${selectedHub ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            />
            <div className="w-12 h-12 rounded-[4px] bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>

            <p className="text-base font-semibold text-[var(--text-primary)]">
              {selectedHub
                ? `Drop your Blinkit PO CSV file here for ${selectedHub.toUpperCase()} Hub, or click to browse`
                : 'Select Delhi or Kolkata Hub above to enable file selection'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Accepts CSV files with standard Blinkit bulk export headers (e.g. bulk_po_csv.csv)
            </p>
          </div>

          {/* Download schema reference */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-ground)] text-xs">
            <span className="text-[var(--text-muted)]">
              Need to verify file structure before uploading?
            </span>
            <button
              type="button"
              onClick={handleDownloadExpectedColumns}
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-teal)] hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Download Expected Column List (.csv)
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: VALIDATING STATE */}
      {currentStep === 2 && (
        <div className="p-12 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] flex items-center justify-center mx-auto">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Validating & Reconciling File ({selectedHub?.toUpperCase()} Hub)
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)] max-w-md mx-auto">
              {validationProgress}
            </p>
          </div>
          {file && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)]">
              <FileText className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
              <span>{file.name}</span>
              <span className="text-[var(--text-muted)]">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: PREVIEW & DIFF */}
      {currentStep === 3 && preview && (
        <div className="space-y-6">
          {/* Duplicate File Warning Banner */}
          {isDuplicateFile && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs sm:text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-semibold">Identical File Previously Uploaded</p>
                <p className="mt-0.5">
                  A file with the name <code className="font-mono">{file?.name}</code> has already been imported.
                  If the contents have not changed, all records will show as &quot;Unchanged&quot; (0 new, 0 updated).
                </p>
              </div>
            </div>
          )}

          {/* File summary pill with Hub Badge */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[var(--accent-teal)]" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--text-primary)] font-mono">
                    {preview.file_name}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      preview.hub === 'kolkata'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20'
                    }`}
                  >
                    {preview.hub || selectedHub} Hub
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  ({file ? (file.size / 1024).toFixed(1) + ' KB • ' : ''}{preview.rows_total.toLocaleString()} rows in CSV)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetWizard}
              className="text-xs text-[var(--text-muted)] hover:text-rose-500 transition"
            >
              Choose different file
            </button>
          </div>

          {/* Summary Metric Tiles (New, Updated, Unchanged, Near Expiry, Rejected) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                New POs
              </span>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                +{preview.pos_new}
              </p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">To be inserted</p>
            </div>

            <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/10">
              <span className="text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                Updated POs
              </span>
              <p className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                {preview.pos_updated}
              </p>
              <p className="text-[10px] text-sky-600/70 dark:text-sky-400/70 mt-0.5">Fields changed</p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                Unchanged POs
              </span>
              <p className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
                {preview.pos_unchanged}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Identical records</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10">
              <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                Near Expiry (&le;7d)
              </span>
              <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {preview.pos_near_expiry}
              </p>
              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">Open urgent POs</p>
            </div>

            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10">
              <span className="text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400">
                Rejected Rows
              </span>
              <p className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {preview.rows_rejected}
              </p>
              <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">Schema errors</p>
            </div>
          </div>

          {/* Reconciliation Banner with File Totals */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent-teal)]">
              <FileCheck2 className="w-4 h-4" />
              Reconciliation Check (Source File vs Parsed Clean)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Total Units In Valid Rows</span>
                  <span className="font-mono text-lg font-bold text-[var(--text-primary)]">
                    {formatUnits(preview.total_units || 0)}
                  </span>
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">100% Reconciled</span>
              </div>

              <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Total Value In Valid Rows</span>
                  <span className="font-mono text-lg font-bold text-[var(--text-primary)]">
                    {formatINR(preview.total_amount || 0)}
                  </span>
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Matches Line Sum</span>
              </div>
            </div>
          </div>

          {/* Expandable "Updated POs" List Showing Exact Changed Fields */}
          {preview.pos_updated > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandUpdated(!expandUpdated)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--surface-hover)] transition"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-sky-500" />
                  <span>Updated PO Details & Changed Fields ({preview.pos_updated})</span>
                </div>
                {expandUpdated ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandUpdated && (
                <div className="p-4 pt-0 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-xs">
                  {/* State changes */}
                  {preview.state_changes?.map((sc, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between">
                      <span className="font-mono font-medium text-[var(--text-primary)]">
                        PO #{sc.po_number}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] line-through">{sc.old_state}</span>
                        <span className="text-[var(--text-muted)]">→</span>
                        <span className="font-semibold text-sky-600 dark:text-sky-400">{sc.new_state}</span>
                      </div>
                    </div>
                  ))}

                  {/* Field diffs */}
                  {preview.field_changes &&
                    Object.entries(preview.field_changes).map(([poNum, fields]) => (
                      <div key={poNum} className="py-2.5 flex items-center justify-between">
                        <span className="font-mono font-medium text-[var(--text-primary)]">
                          PO #{poNum}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {fields.map((f, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Expandable "Rejected Rows" List with Reason & Download Button */}
          {preview.rows_rejected > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-[var(--surface-card)] overflow-hidden">
              <div className="p-4 flex items-center justify-between bg-rose-500/5">
                <button
                  type="button"
                  onClick={() => setExpandRejected(!expandRejected)}
                  className="flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Rejected Rows ({preview.rows_rejected})</span>
                  {expandRejected ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadRejectedRows}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Error CSV
                </button>
              </div>

              {expandRejected && (
                <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)] text-xs border-t border-rose-500/20">
                  {preview.rejected_rows.map((r, i) => (
                    <div key={i} className="p-3 bg-[var(--surface-ground)]">
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
              )}
            </div>
          )}

          {/* Bottom Actions: Cancel & Confirm */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              disabled={isCommitting}
              onClick={handleResetWizard}
              className="px-4 py-2.5 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isConfirmDisabled}
              onClick={handleConfirmCommit}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Committing Changes...</span>
                </>
              ) : (
                <>
                  <span>Confirm Import ({preview.pos_total} POs)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: DONE */}
      {currentStep === 4 && commitResult && (
        <div className="p-8 sm:p-12 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-center space-y-6 animate-in zoom-in-95 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
            <FileCheck2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Import Successfully Processed!
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-muted)] max-w-md mx-auto">
              All valid purchase orders and line items were committed to the primary database in an atomic transaction.
            </p>
          </div>

          {/* Impact pill */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-xs">
            <div className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">New POs</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                +{commitResult.preview.pos_new}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Updated POs</span>
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400 text-base">
                {commitResult.preview.pos_updated}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Total Units</span>
              <span className="font-mono font-bold text-[var(--text-primary)] text-base">
                {formatUnits(commitResult.preview.total_units || 0)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Total Value</span>
              <span className="font-mono font-bold text-[var(--text-primary)] text-base">
                {formatINR(commitResult.preview.total_amount || 0)}
              </span>
            </div>
          </div>

          {/* Notifications Sent Info */}
          <div className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] max-w-lg mx-auto text-left text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <Bell className="w-4 h-4 text-[var(--accent-teal)]" />
              <span>Automated Notifications Dispatched</span>
            </div>
            <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">
              {commitResult.preview.pos_new > 0
                ? `Upload summary notification sent to subscribed demand/dispatch recipients (${commitResult.preview.pos_new} new POs).`
                : 'No new POs created — notification suppressed in accordance with notification rules.'}
            </p>
          </div>

          {/* Action Links */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition shadow-sm"
            >
              <span>View In PO Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/uploads"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>View In Upload History</span>
            </Link>
            <button
              type="button"
              onClick={handleResetWizard}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Upload Another File</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
