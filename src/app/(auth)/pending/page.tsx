'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabaseClient } from '@/lib/auth';
import { Clock, LogOut, RefreshCw } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [databaseNotReady, setDatabaseNotReady] = useState(false);

  const checkRole = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/auth/status', { cache: 'no-store' });
      const result = await response.json();
      setDatabaseNotReady(response.status === 503 && result.databaseNotReady === true);
      if (response.ok && result.role && result.role !== 'pending') {
        router.replace('/pos');
        router.refresh();
      }
    } catch { setDatabaseNotReady(false); }
    finally { setIsChecking(false); }
  }, [router]);

  useEffect(() => {
    void getBrowserSupabaseClient().auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
    void checkRole();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void checkRole(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [checkRole]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try { await getBrowserSupabaseClient().auth.signOut(); router.push('/login'); router.refresh(); }
    catch { router.push('/login'); }
    finally { setIsSigningOut(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-ground)] px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-7 p-8 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg text-center">
        <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400"><Clock className="w-7 h-7" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{databaseNotReady ? 'Database setup required' : 'Waiting for approval'}</h1>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{databaseNotReady ? 'The database is not set up yet. Ask an administrator to run the migrations.' : 'Your account is registered and is currently pending administrator approval. An administrator can assign your access role.'}</p>
          {email && <p className="mt-4 text-sm font-medium text-[var(--text-secondary)]">{email}</p>}
        </div>
        <div className="pt-5 border-t border-[var(--border-subtle)] flex flex-col items-center gap-3">
          <button onClick={() => void checkRole()} disabled={isChecking} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition disabled:opacity-50 cursor-pointer"><RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />{isChecking ? 'Checking…' : 'Check again'}</button>
          <button onClick={handleSignOut} disabled={isSigningOut} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-xs transition disabled:opacity-50 cursor-pointer"><LogOut className="w-4 h-4 text-[var(--text-muted)]" />{isSigningOut ? 'Signing Out…' : 'Sign Out'}</button>
        </div>
      </div>
    </div>
  );
}
