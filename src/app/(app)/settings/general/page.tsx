'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader, SaveStatus, ConfirmDialog } from '@/components/ui';
import { Sliders, Check, Clock, AlertTriangle, Save } from 'lucide-react';
import { DatabaseStatusCard } from '@/components/settings/DatabaseStatusCard';

export default function GeneralSettingsPage() {
  const [nearExpiryDays, setNearExpiryDays] = useState(7);
  const [defaultLastXDays, setDefaultLastXDays] = useState(30);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const savedExpiry = localStorage.getItem('aksharveda_setting_near_expiry');
    const savedDays = localStorage.getItem('aksharveda_setting_default_days');
    if (savedExpiry) setNearExpiryDays(parseInt(savedExpiry, 10));
    if (savedDays) setDefaultLastXDays(parseInt(savedDays, 10));
  }, []);

  const handleSave = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      localStorage.setItem('aksharveda_setting_near_expiry', nearExpiryDays.toString());
      localStorage.setItem('aksharveda_setting_default_days', defaultLastXDays.toString());
      setSaveStatus('saved');
      setLastSaved(new Date());
      setConfirmOpen(false);
    }, 400);
  };

  return (
    <div className="space-y-6 pb-16 max-w-4xl">
      <PageHeader
        title="General Operational Settings"
        subtitle="Configure default timeframes, SLA urgency thresholds, and dashboard preferences."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Settings' },
          { label: 'General' },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <SaveStatus status={saveStatus} lastSavedAt={lastSaved} />
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition shadow-sm cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        }
      />

      <div className="p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-6 shadow-xs text-xs">
        {/* Near Expiry Threshold */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <label className="font-semibold text-sm text-[var(--text-primary)]">
              Near-Expiry SLA Threshold (Days)
            </label>
          </div>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Purchase orders expiring within this number of calendar days will be tagged as high priority across the PO Dashboard and Planning Sheet.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <input
              type="number"
              min="1"
              max="30"
              value={nearExpiryDays}
              onChange={(e) => setNearExpiryDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-24 px-3 py-2 text-xs font-mono font-bold rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-muted)] font-medium">days (Default: 7)</span>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-6 space-y-2">
          {/* Default Last X Days */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-500" />
            <label className="font-semibold text-sm text-[var(--text-primary)]">
              Default &quot;Last X Days&quot; Window
            </label>
          </div>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Initial time window applied on the Purchase Orders dashboard when viewing by recent days.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <select
              value={defaultLastXDays}
              onChange={(e) => setDefaultLastXDays(parseInt(e.target.value, 10))}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-pointer"
            >
              <option value={7}>Last 7 Days</option>
              <option value={15}>Last 15 Days</option>
              <option value={30}>Last 30 Days (Default)</option>
              <option value={45}>Last 45 Days</option>
              <option value={60}>Last 60 Days</option>
            </select>
          </div>
        </div>
      </div>

      <DatabaseStatusCard />

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSave}
        title="Confirm Settings Update"
        description="Are you sure you want to update the operational thresholds? These settings will apply immediately to your active session."
        confirmLabel="Update Settings"
        variant="info"
      />
    </div>
  );
}
