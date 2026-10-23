'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Column,
  Drawer,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { NotificationRecipient } from '@/lib/types';
import { formatDate } from '@/lib/format';
import {
  Plus,
  Mail,
  Phone,
  Bell,
  Check,
  X,
  UserCheck,
  UserX,
  Edit2,
  AlertCircle,
  Shield,
  Smartphone,
} from 'lucide-react';

export default function RecipientsSettingsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<NotificationRecipient | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Ops');
  const [prefEmail, setPrefEmail] = useState(true);
  const [prefWhatsapp, setPrefWhatsapp] = useState(true);
  const [prefInApp, setPrefInApp] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{
    recipients: NotificationRecipient[];
  }>({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await fetch('/api/recipients?hub=delhi');
      if (!res.ok) throw new Error('Failed to load recipients');
      return res.json();
    },
  });

  const recipients = data?.recipients || [];

  // Upsert recipient mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<NotificationRecipient>) => {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, hub: 'delhi' }),
      });
      if (!res.ok) throw new Error('Failed to save recipient');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const openAddDrawer = () => {
    resetForm();
    setEditingRecipient(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (rec: NotificationRecipient) => {
    setEditingRecipient(rec);
    setName(rec.name);
    setEmail(rec.email || '');
    setPhone(rec.phone || '');
    setRole(rec.role || 'Ops');
    setPrefEmail(rec.channel_prefs?.email ?? true);
    setPrefWhatsapp(rec.channel_prefs?.whatsapp ?? false);
    setPrefInApp(rec.channel_prefs?.in_app ?? true);
    setValidationError(null);
    setDrawerOpen(true);
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRole('Ops');
    setPrefEmail(true);
    setPrefWhatsapp(true);
    setPrefInApp(true);
    setValidationError(null);
  };

  // Validation: Email format & Indian phone format (10 digits with optional +91 or 0)
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setValidationError('Recipient name is required.');
      return false;
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setValidationError('Invalid email address format.');
        return false;
      }
    }

    if (phone.trim()) {
      // Indian phone format: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, or XXXXXXXXXX (10 digits)
      const phoneClean = phone.replace(/[\s-]/g, '');
      const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
      if (!phoneRegex.test(phoneClean)) {
        setValidationError('Invalid Indian phone number format (must be a valid 10-digit mobile number).');
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    saveMutation.mutate({
      id: editingRecipient ? editingRecipient.id : undefined,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role: role.trim(),
      channel_prefs: {
        email: prefEmail,
        whatsapp: prefWhatsapp,
        in_app: prefInApp,
      },
      is_active: editingRecipient ? editingRecipient.is_active : true,
    });
  };

  // Toggle active status (no hard deletes)
  const handleToggleActive = (rec: NotificationRecipient) => {
    saveMutation.mutate({
      id: rec.id,
      name: rec.name,
      is_active: !rec.is_active,
    });
  };

  // Toggle channel preference inline
  const handleToggleChannel = (
    rec: NotificationRecipient,
    channel: 'email' | 'whatsapp' | 'in_app'
  ) => {
    saveMutation.mutate({
      id: rec.id,
      name: rec.name,
      channel_prefs: {
        ...rec.channel_prefs,
        [channel]: !rec.channel_prefs[channel],
      },
    });
  };

  const columns: Column<NotificationRecipient>[] = [
    {
      key: 'name',
      header: 'Recipient',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-semibold text-xs text-[var(--text-primary)]">{item.name}</p>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            {item.role}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (item) => (
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {item.email || '—'}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone (WhatsApp)',
      render: (item) => (
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {item.phone || '—'}
        </span>
      ),
    },
    {
      key: 'channels',
      header: 'Channels',
      render: (item) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Toggle Email notifications"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleChannel(item, 'email');
            }}
            className={`p-1 rounded text-xs transition ${
              item.channel_prefs?.email
                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                : 'opacity-30 hover:opacity-100 text-[var(--text-muted)]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Toggle WhatsApp notifications"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleChannel(item, 'whatsapp');
            }}
            className={`p-1 rounded text-xs transition ${
              item.channel_prefs?.whatsapp
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'opacity-30 hover:opacity-100 text-[var(--text-muted)]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Toggle In-App notifications"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleChannel(item, 'in_app');
            }}
            className={`p-1 rounded text-xs transition ${
              item.channel_prefs?.in_app
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                : 'opacity-30 hover:opacity-100 text-[var(--text-muted)]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(item);
          }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
            item.is_active
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
          }`}
        >
          {item.is_active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>{item.is_active ? 'Active' : 'Deactivated'}</span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Edit',
      align: 'center',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openEditDrawer(item);
          }}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-teal)] hover:bg-[var(--surface-hover)] transition"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-16 max-w-5xl">
      <PageHeader
        title="Notification Recipients"
        subtitle="Configure team members alerted on new Blinkit PO imports, urgent near-expiry items, and dispatch state transitions."
        breadcrumbs={[
          { label: 'Aksharveda Ops', href: '/pos' },
          { label: 'Settings' },
          { label: 'Recipients' },
        ]}
        actions={
          <button
            type="button"
            onClick={openAddDrawer}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Recipient</span>
          </button>
        }
      />

      {/* Recipients Table */}
      {isError ? (
        <ErrorState
          title="Failed to Load Recipients"
          message={error instanceof Error ? error.message : 'Error'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={recipients}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          loadingRows={5}
        />
      )}

      {/* Add / Edit Recipient Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingRecipient ? 'Edit Recipient' : 'Add Notification Recipient'}
        description="Recipients receive alerts via selected channels without hard deletion."
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)] transition disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : editingRecipient ? 'Save Changes' : 'Create Recipient'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {validationError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">
              Role / Department
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] text-xs"
            >
              <option value="Demand">Demand & Growth</option>
              <option value="Ops">Operations & Dispatch</option>
              <option value="Warehouse">Warehouse Manager</option>
              <option value="Finance">Finance & Billing</option>
              <option value="Admin">Management</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@aksharveda.com"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">
              Phone Number (WhatsApp)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-teal)] text-xs"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Indian 10-digit mobile number format.
            </p>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
            <label className="block font-semibold text-[var(--text-primary)]">
              Subscribed Alert Channels
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefEmail}
                onChange={(e) => setPrefEmail(e.target.checked)}
                className="rounded accent-[var(--accent-teal)]"
              />
              <span className="text-[var(--text-secondary)]">Email notifications (Resend)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefWhatsapp}
                onChange={(e) => setPrefWhatsapp(e.target.checked)}
                className="rounded accent-[var(--accent-teal)]"
              />
              <span className="text-[var(--text-secondary)]">WhatsApp notifications (Meta Cloud API)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefInApp}
                onChange={(e) => setPrefInApp(e.target.checked)}
                className="rounded accent-[var(--accent-teal)]"
              />
              <span className="text-[var(--text-secondary)]">In-App Notification Bell & Alerts</span>
            </label>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
