'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PageHeader,
  StatTile,
  StateBadge,
  DataTable,
  Column,
  FilterBar,
  EmptyState,
  ErrorState,
  Skeleton,
  SaveStatus,
  Drawer,
  ConfirmDialog,
} from '@/components/ui';
import {
  formatINR,
  formatUnits,
  formatDate,
  daysLeft,
} from '@/lib/format';
import {
  Package,
  Boxes,
  IndianRupee,
  AlertTriangle,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

interface SamplePoRow {
  poNumber: string;
  vendor: string;
  city: string;
  units: number;
  amount: number;
  orderDate: string;
  expiryDate: string;
  status: 'UNSCHEDULED' | 'SCHEDULED' | 'PARTIALLY_SCHEDULED' | 'FULFILLED' | 'EXPIRED';
}

const SAMPLE_DATA: SamplePoRow[] = [
  {
    poNumber: 'PO-DEL-2026-0891',
    vendor: 'Blinkit Commerce',
    city: 'Delhi NCR',
    units: 1420,
    amount: 382400,
    orderDate: '2026-10-14T09:30:00Z',
    expiryDate: '2026-10-21T00:00:00Z',
    status: 'SCHEDULED',
  },
  {
    poNumber: 'PO-BLR-2026-1044',
    vendor: 'Blinkit Commerce',
    city: 'Bengaluru',
    units: 850,
    amount: 229500,
    orderDate: '2026-10-17T11:15:00Z',
    expiryDate: '2026-10-24T00:00:00Z',
    status: 'PARTIALLY_SCHEDULED',
  },
  {
    poNumber: 'PO-MUM-2026-0412',
    vendor: 'Blinkit Commerce',
    city: 'Mumbai',
    units: 2400,
    amount: 648000,
    orderDate: '2026-10-18T14:00:00Z',
    expiryDate: '2026-10-25T00:00:00Z',
    status: 'UNSCHEDULED',
  },
  {
    poNumber: 'PO-HYD-2026-0211',
    vendor: 'Blinkit Commerce',
    city: 'Hyderabad',
    units: 600,
    amount: 162000,
    orderDate: '2026-10-10T08:00:00Z',
    expiryDate: '2026-10-15T00:00:00Z',
    status: 'FULFILLED',
  },
  {
    poNumber: 'PO-KOL-2026-0094',
    vendor: 'Blinkit Commerce',
    city: 'Kolkata',
    units: 420,
    amount: 113400,
    orderDate: '2026-10-05T10:00:00Z',
    expiryDate: '2026-10-12T00:00:00Z',
    status: 'EXPIRED',
  },
];

export default function DesignSystemPage() {
  // Drawer & Dialog interactive states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogVariant, setDialogVariant] = useState<'danger' | 'warning' | 'info'>('danger');

  // FilterBar interactive state
  const [searchVal, setSearchVal] = useState('');
  const [statusVal, setStatusVal] = useState('');
  const [cityVal, setCityVal] = useState('');

  // Sample columns for DataTable
  const columns: Column<SamplePoRow>[] = [
    {
      key: 'poNumber',
      header: 'PO Number',
      render: (item) => (
        <span className="font-mono font-medium text-[var(--accent-teal)]">
          {item.poNumber}
        </span>
      ),
    },
    {
      key: 'city',
      header: 'City',
      render: (item) => (
        <span className="text-[var(--text-secondary)]">{item.city}</span>
      ),
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (item) => (
        <span className="font-mono text-right block">
          {formatUnits(item.units)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Total Value',
      align: 'right',
      render: (item) => (
        <span className="font-mono font-medium text-[var(--text-primary)] text-right block">
          {formatINR(item.amount)}
        </span>
      ),
    },
    {
      key: 'orderDate',
      header: 'Order Date (IST)',
      render: (item) => (
        <span className="text-xs text-[var(--text-muted)]">
          {formatDate(item.orderDate)}
        </span>
      ),
    },
    {
      key: 'expiryDate',
      header: 'SLA Days Left',
      render: (item) => {
        const { label, isUrgent, isExpired } = daysLeft(item.expiryDate);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              isExpired
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold'
                : isUrgent
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {label}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'State',
      render: (item) => <StateBadge state={item.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-12 pb-16">
      {/* 1. Page Header */}
      <PageHeader
        title="Design System & UI Component Showcase"
        subtitle="Comprehensive gallery of Aksharveda Ops design tokens, primitives, shared components, formatting utilities, and responsive layouts."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Design System' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-input)] transition cursor-pointer flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Preview Drawer
            </button>
            <button
              onClick={() => {
                setDialogVariant('danger');
                setIsDialogOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Open Confirm Dialog
            </button>
          </div>
        }
      />

      {/* 2. Color Palette & Tokens */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            1. Color Tokens & Surface Hierarchy
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Active tokens defined as reactive CSS variables for light & dark themes.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Surface Card</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">--surface-card</p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-[var(--surface-ground)] border border-[var(--border-subtle)] mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Surface Ground</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">--surface-ground</p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-[var(--accent-teal)] mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Accent Teal</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">#0d9488</p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-amber-500 mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Warning Amber</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">#f59e0b</p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-rose-600 mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Danger Red</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">#e11d48</p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <div className="h-10 rounded bg-emerald-600 mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">Success Green</p>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">#10b981</p>
          </div>
        </div>
      </section>

      {/* 3. Stat Tiles */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            2. Stat Tiles (StatTile)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            High-density operational metric tiles with trends, icons, and subtle interactive elevation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            title="Total Purchase Orders"
            value="389"
            icon={Package}
            trend={{ value: "+12.5%", isPositive: true, label: "vs last cycle" }}
            subtitle="Across all Blinkit Darkstores"
          />
          <StatTile
            title="Units Ordered"
            value={formatUnits(224224)}
            icon={Boxes}
            subtitle="Reconciled to physical CSV"
          />
          <StatTile
            title="Total PO Value"
            value={formatINR(60314416)}
            icon={IndianRupee}
            trend={{ value: "+8.2%", isPositive: true, label: "MoM" }}
            subtitle="Indian grouping (Lakhs & Crores)"
          />
          <StatTile
            title="Urgent SLAs (<7 Days)"
            value="42"
            icon={AlertTriangle}
            variant="warning"
            trend={{ value: "-3.4%", isPositive: false, label: "due this week" }}
            subtitle="Requires immediate slotting"
          />
        </div>
      </section>

      {/* 4. State Badges */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            3. State Badges (StateBadge)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Standardized operational lifecycle states: Unscheduled, Scheduled, Partially Scheduled, Fulfilled, Expired.
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Default Size (Medium)
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <StateBadge state="UNSCHEDULED" />
              <StateBadge state="SCHEDULED" />
              <StateBadge state="PARTIALLY_SCHEDULED" />
              <StateBadge state="FULFILLED" />
              <StateBadge state="EXPIRED" />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Compact Size (Small - Table Optimized)
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <StateBadge state="UNSCHEDULED" size="sm" />
              <StateBadge state="SCHEDULED" size="sm" />
              <StateBadge state="PARTIALLY_SCHEDULED" size="sm" />
              <StateBadge state="FULFILLED" size="sm" />
              <StateBadge state="EXPIRED" size="sm" />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Save Status Indicator */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            4. Autosave Status (SaveStatus)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Feedback badges for real-time dispatch planning modifications.
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-5 flex flex-wrap items-center gap-4">
          <SaveStatus status="saving" />
          <SaveStatus status="saved" lastSavedAt={new Date()} />
          <SaveStatus status="failed" errorMessage="Network timeout - retry" />
        </div>
      </section>

      {/* 6. FilterBar & DataTable */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            5. Filter Bar & Data Table Wrapper
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            High-performance sortable table wrapper with flexible keyExtractor.
          </p>
        </div>

        <FilterBar
          searchValue={searchVal}
          onSearchChange={setSearchVal}
          statusOptions={[
            { label: 'Unscheduled', value: 'UNSCHEDULED' },
            { label: 'Scheduled', value: 'SCHEDULED' },
            { label: 'Partially Scheduled', value: 'PARTIALLY_SCHEDULED' },
            { label: 'Fulfilled', value: 'FULFILLED' },
            { label: 'Expired', value: 'EXPIRED' },
          ]}
          selectedStatus={statusVal}
          onStatusChange={setStatusVal}
          cityOptions={[
            { label: 'Delhi NCR', value: 'DELHI' },
            { label: 'Bengaluru', value: 'BENGALURU' },
            { label: 'Mumbai', value: 'MUMBAI' },
          ]}
          selectedCity={cityVal}
          onCityChange={setCityVal}
          onReset={() => {
            setSearchVal('');
            setStatusVal('');
            setCityVal('');
          }}
        />

        <DataTable
          columns={columns}
          data={SAMPLE_DATA}
          keyExtractor={(row) => row.poNumber}
        />
      </section>

      {/* 7. Skeleton Loaders */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            6. Loading Skeletons
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Smooth pulse skeletons for data fetching and async operations.
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-3 gap-4 pt-2">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        </div>
      </section>

      {/* 8. Empty & Error States */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            7. Empty & Error Boundary States
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Clear, actionable states for zero-data and network/API failures.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl">
            <EmptyState
              title="No Purchase Orders Ingested"
              description="Upload your latest Blinkit PO export CSV to view and schedule line items."
              action={
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition"
                >
                  Upload CSV Now
                </Link>
              }
            />
          </div>

          <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl">
            <ErrorState
              title="Database Sync Failed"
              message="Unable to connect to Supabase PostgreSQL cluster. Verified fallback mode active."
              onRetry={() => alert('Retrying connection...')}
            />
          </div>
        </div>
      </section>

      {/* 9. Formatting Helpers Reference */}
      <section className="space-y-4">
        <div className="border-b border-[var(--border-subtle)] pb-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            8. Formatting Helpers (src/lib/format.ts)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Indian numbering format, unit counters, IST dates, and SLA calculators.
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block mb-1">formatINR(60314416)</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {formatINR(60314416)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block mb-1">formatUnits(224224)</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {formatUnits(224224)} units
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block mb-1">formatDate(&apos;2026-10-17T...&apos;)</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {formatDate('2026-10-17T06:00:00Z')}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)] block mb-1">daysLeft(&apos;2026-10-22&apos;)</span>
              <span className="font-mono font-semibold text-amber-500">
                {daysLeft('2026-10-22').label}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Drawer Component Preview */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="PO Details Drawer Preview"
        description="Detailed SKU breakdowns and batch scheduling slots."
        footer={
          <>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Close
            </button>
            <button
              onClick={() => {
                setIsDrawerOpen(false);
                setIsDialogOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition"
            >
              Schedule All Lines
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)]">PO Reference</span>
            <p className="font-mono font-semibold text-[var(--text-primary)]">
              PO-DEL-2026-0891
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)]">Destination Hub</span>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Delhi Central Darkstore (DC-04)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--surface-ground)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)]">Total Line Items</span>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              12 SKUs • 1,420 units ordered
            </p>
          </div>
        </div>
      </Drawer>

      {/* Confirm Dialog Preview */}
      <ConfirmDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={() => {
          alert('Action Confirmed');
          setIsDialogOpen(false);
        }}
        title="Confirm Dispatch Plan Allocation"
        description="Are you sure you want to lock the planned dispatch slots for this PO? Once confirmed, warehouse packing lists will be automatically generated."
        confirmLabel="Confirm Dispatch"
        cancelLabel="Review Again"
        variant={dialogVariant}
      />
    </div>
  );
}
