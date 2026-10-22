'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { InAppNotification } from '@/lib/types';
import { formatDate } from '@/lib/format';
import {
  Bell,
  Check,
  Package,
  AlertTriangle,
  ArrowRight,
  Info,
  Clock,
  ExternalLink,
} from 'lucide-react';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Query notifications with periodic refetching
  const { data } = useQuery<{ in_app_notifications: InAppNotification[] }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/recipients?hub=delhi');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000, // Check for new notifications every 60s
  });

  const notifications = data?.in_app_notifications || [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mark all notifications read mutation
  const markReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_notifications_read', hub: 'delhi' }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData<{ in_app_notifications: InAppNotification[] }>(
        ['notifications'],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            in_app_notifications: old.in_app_notifications.map((n) => ({
              ...n,
              is_read: true,
            })),
          };
        }
      );
    },
  });

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'success':
        return <Check className="w-4 h-4 text-emerald-500" />;
      default:
        return <Package className="w-4 h-4 text-[var(--accent-teal)]" />;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition cursor-pointer"
        aria-label="Notifications"
        title="View Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--surface-card)] animate-in zoom-in-75">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150" style={{ zIndex: "var(--z-modal)" }}>
          <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-raised)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] text-[10px] font-bold font-mono">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markReadMutation.mutate()}
                className="text-xs font-semibold text-[var(--accent-teal)] hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                No notifications received yet.
              </div>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-xs transition-colors hover:bg-[var(--surface-hover)] ${
                    !n.is_read ? 'bg-[var(--accent-teal)]/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1.5 rounded-md bg-[var(--surface-ground)] border border-[var(--border-subtle)] shrink-0">
                      {getNotifIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[var(--text-primary)] truncate">
                          {n.title}
                        </p>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">
                          {formatDate(n.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                        {n.message}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Link
                          href="/pos"
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-teal)] hover:underline"
                        >
                          <span>Open Dashboard</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] text-center">
            <Link
              href="/settings/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            >
              Preview Email & WhatsApp Dispatch Templates →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
