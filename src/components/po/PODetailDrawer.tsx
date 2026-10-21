'use client';

import React from 'react';
import { StateBadge, StateType, Drawer } from '@/components/ui';
import { formatINR, formatUnits, formatDate, daysLeft } from '@/lib/format';
import {
  Copy,
  Check,
  Building,
  Calendar,
  AlertTriangle,
  History,
  Layers,
  Clock,
  MapPin,
  ExternalLink,
} from 'lucide-react';

export interface PODetailLine {
  item_id: string;
  sku_name: string;
  short_name: string | null;
  units_ordered: number;
  total_grn_quantity: number;
  remaining_quantity: number;
  landing_rate: number;
  total_amount: number;
  mrp: number;
  upc?: string;
}

export interface POHeaderData {
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

export interface POPlanData {
  remarks: string | null;
  central_appointment_date: string | null;
  internal_dispatch_date: string | null;
  actual_dispatch_date: string | null;
}

export interface POStateHistoryItem {
  id: string;
  old_state: string;
  new_state: string;
  changed_at: string;
}

export interface PODetailResponse {
  header: POHeaderData;
  lines: PODetailLine[];
  plan: POPlanData | null;
  stateHistory?: POStateHistoryItem[];
  state_history?: POStateHistoryItem[];
}

interface PODetailDrawerProps {
  poNumber: string | null;
  isOpen: boolean;
  onClose: () => void;
  data: PODetailResponse | null;
  isLoading: boolean;
  error?: string | null;
}

export function PODetailDrawer({
  poNumber,
  isOpen,
  onClose,
  data,
  isLoading,
  error,
}: PODetailDrawerProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyPo = () => {
    if (poNumber) {
      navigator.clipboard.writeText(poNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const header = data?.header;
  const lines = data?.lines || [];
  const plan = data?.plan;
  const history = data?.stateHistory || data?.state_history || [];

  // Reconciled totals from lines
  const linesTotalUnits = lines.reduce((acc, l) => acc + Number(l.units_ordered || 0), 0);
  const linesTotalAmount = lines.reduce((acc, l) => acc + Number(l.total_amount || 0), 0);

  const expiryInfo = header ? daysLeft(header.expiry_date) : null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="xl"
      title={
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-lg font-bold text-[var(--text-primary)]">
            PO #{poNumber}
          </span>
          <button
            type="button"
            onClick={handleCopyPo}
            title="Copy PO number"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          {header && (
            <StateBadge
              state={header.po_state as StateType}
              size="sm"
              className="ml-1"
            />
          )}
        </div>
      }
      description={
        header ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] mt-0.5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {header.city} ({header.facility_code || 'FC'})
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Ordered: {formatDate(header.order_date)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Expires: {formatDate(header.expiry_date)}
              {expiryInfo && (
                <span
                  className={`ml-1 font-semibold ${
                    expiryInfo.isExpired
                      ? 'text-rose-500'
                      : expiryInfo.isUrgent
                      ? 'text-amber-500'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  ({expiryInfo.label})
                </span>
              )}
            </span>
          </div>
        ) : undefined
      }
      footer={
        <div className="w-full flex items-center justify-between text-xs">
          <div className="text-[var(--text-muted)]">
            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono">Esc</kbd> to close
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition"
          >
            Close
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-4 py-6">
          <div className="h-20 bg-[var(--surface-hover)] rounded-xl animate-pulse" />
          <div className="h-40 bg-[var(--surface-hover)] rounded-xl animate-pulse" />
          <div className="h-32 bg-[var(--surface-hover)] rounded-xl animate-pulse" />
        </div>
      ) : error ? (
        <div className="p-6 text-center text-sm text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
          <p>{error}</p>
        </div>
      ) : !data || !header ? (
        <div className="p-6 text-center text-sm text-[var(--text-muted)]">
          No details found for this PO.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Warehouse and Meta Highlights */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[var(--surface-ground)] border border-[var(--border-subtle)] text-xs">
            <div>
              <p className="text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Facility / Darkstore</p>
              <p className="font-semibold text-[var(--text-primary)] mt-0.5 truncate" title={header.facility_raw}>
                {header.facility_raw}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-[11px] uppercase tracking-wider">City & Facility Code</p>
              <p className="font-semibold text-[var(--text-primary)] mt-0.5">
                {header.city} • <span className="font-mono">{header.facility_code || 'N/A'}</span>
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Order Date</p>
              <p className="font-medium text-[var(--text-primary)] mt-0.5">
                {formatDate(header.order_date)}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-[11px] uppercase tracking-wider">SLA Expiry</p>
              <p className="font-medium text-[var(--text-primary)] mt-0.5">
                {formatDate(header.expiry_date)}
              </p>
            </div>
          </div>

          {/* Planning Sheet Details (if present) */}
          {plan && (
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-ground)] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
                Dispatch Schedule Plan
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--text-muted)]">Central Slot:</span>{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {plan.central_appointment_date || 'Unscheduled'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Internal Planned:</span>{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {plan.internal_dispatch_date || 'Pending'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Actual Dispatch:</span>{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {plan.actual_dispatch_date || 'Not dispatched'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Remarks:</span>{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {plan.remarks || 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Line Items Table with Matching Totals */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Line Items ({lines.length})
              </h3>
              <span className="text-xs text-[var(--text-muted)]">
                Sum: {formatUnits(linesTotalUnits)} units • {formatINR(linesTotalAmount)}
              </span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5 text-right">Ordered</th>
                      <th className="p-2.5 text-right">GRN</th>
                      <th className="p-2.5 text-right">Landing Rate</th>
                      <th className="p-2.5 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                    {lines.map((line) => (
                      <tr key={line.item_id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="p-2.5">
                          <p className="font-semibold text-[var(--text-primary)] truncate max-w-[200px]" title={line.sku_name}>
                            {line.sku_name}
                          </p>
                          <p className="text-[10px] font-mono text-[var(--text-muted)]">
                            ID: {line.item_id} {line.upc ? `• UPC: ${line.upc}` : ''}
                          </p>
                        </td>
                        <td className="p-2.5 text-right font-mono font-medium text-[var(--text-primary)]">
                          {formatUnits(line.units_ordered)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-[var(--text-muted)]">
                          {formatUnits(line.total_grn_quantity || 0)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-[var(--text-muted)]">
                          {formatINR(line.landing_rate)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-[var(--text-primary)]">
                          {formatINR(line.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Footer row */}
                  <tfoot className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]">
                    <tr>
                      <td className="p-2.5 text-xs font-bold">Total ({lines.length} items)</td>
                      <td className="p-2.5 text-right font-mono font-bold">{formatUnits(linesTotalUnits)}</td>
                      <td className="p-2.5 text-right font-mono text-[var(--text-muted)]">
                        {formatUnits(lines.reduce((a, c) => a + Number(c.total_grn_quantity || 0), 0))}
                      </td>
                      <td className="p-2.5 text-right">—</td>
                      <td className="p-2.5 text-right font-mono font-bold text-[var(--accent-teal)]">
                        {formatINR(linesTotalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* State History Audit Trail Timeline */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              State History Timeline
            </h3>

            {history.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
                No state transitions recorded. Current state: {header.po_state}.
              </p>
            ) : (
              <div className="space-y-2 relative pl-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-subtle)]">
                {history.map((h, i) => (
                  <div key={h.id || i} className="relative flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)] text-xs">
                    <span className="absolute -left-[14px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--accent-teal)] ring-4 ring-[var(--surface-card)]" />
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)] line-through">{h.old_state}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <StateBadge state={h.new_state as StateType} size="sm" />
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {formatDate(h.changed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
