'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export type SaveState = 'saved' | 'saving' | 'failed' | 'idle';

export interface SaveStatusProps {
  status: SaveState;
  lastSavedAt?: Date | string | null;
  errorMessage?: string;
  className?: string;
}

export function SaveStatus({
  status,
  lastSavedAt,
  errorMessage = 'Failed to save',
  className = '',
}: SaveStatusProps) {
  if (status === 'idle') return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all duration-200 ${
        status === 'saving'
          ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
          : status === 'saved'
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
      } ${className}`}
    >
      {status === 'saving' && (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
          <span>Saving...</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>
            Saved
            {lastSavedAt && (
              <span suppressHydrationWarning className="opacity-75 font-normal ml-1">
                {typeof lastSavedAt === 'string'
                  ? lastSavedAt
                  : lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </span>
        </>
      )}

      {status === 'failed' && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </>
      )}
    </div>
  );
}
