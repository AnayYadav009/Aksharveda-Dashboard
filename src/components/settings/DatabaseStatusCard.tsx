'use client';
import { useEffect, useState } from 'react';

export function DatabaseStatusCard() {
  const [role, setRole] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const projectRef = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0] || 'Not configured'; } catch { return 'Not configured'; } })();
  useEffect(() => {
    void (async () => {
      const auth = await fetch('/api/auth/status', { cache: 'no-store' });
      const authData = await auth.json(); setRole(authData.role || null);
      if (authData.role === 'management' || process.env.NODE_ENV !== 'production') {
        const response = await fetch('/api/health/db', { cache: 'no-store' });
        const data = await response.json(); setMissing(data.missing || []);
      }
    })();
  }, []);
  if (role !== 'management') return null;
  return <section className="p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-3 shadow-xs text-xs" aria-label="Database status">
    <div><h2 className="font-semibold text-sm text-[var(--text-primary)]">Database status</h2><p className="mt-1 text-[var(--text-muted)]">Supabase project: <span className="font-mono">{projectRef}</span></p></div>
    {missing === null ? <p className="text-[var(--text-muted)]">Checking required tables…</p> : missing.length ? <><p className="text-rose-500">Database setup is incomplete. Missing:</p><ul className="list-disc pl-5 text-rose-500">{missing.map(name => <li key={name}>{name}</li>)}</ul></> : <p className="text-emerald-600">All required tables and columns are available.</p>}
  </section>;
}
