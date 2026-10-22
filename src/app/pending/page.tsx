'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabaseClient } from '@/lib/auth';
import { Clock, LogOut } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const supabase = getBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-ground)] px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg text-center">
        <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-4 animate-pulse">
          <Clock className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Waiting for approval
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Your account has been registered and is currently pending administrator approval.
            You will be granted access once an administrator assigns your role (Demand, Warehouse, or Management).
          </p>
        </div>

        <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-col items-center gap-3">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-xs transition disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[var(--text-muted)]" />
            <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
