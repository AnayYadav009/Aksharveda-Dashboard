'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  UploadCloud,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Boxes,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/pos', icon: LayoutDashboard },
  { name: 'Planning', href: '/planning', icon: CalendarDays },
  { name: 'Inventory Stock', href: '/stock', icon: Boxes },
  { name: 'Upload', href: '/upload', icon: UploadCloud },
  { name: 'History', href: '/uploads', icon: History },
  { name: 'Settings', href: '/settings/recipients', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 flex flex-col bg-[#0a0e17] text-slate-300 border-r border-slate-800 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
        <Link
          href="/pos"
          className="flex items-center gap-2.5 overflow-hidden group"
          title="Aksharveda Ops"
        >
          <div className="w-7 h-7 rounded-[4px] bg-[var(--accent-teal)] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 group-hover:scale-105 transition-transform">
            A
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-tight text-white">
                AKSHARVEDA
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                Operations Hub
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Nav List */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/pos' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-[4px] text-xs font-medium transition-all group relative ${
                isActive
                  ? 'bg-slate-800 text-teal-400 font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {/* Active left indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-teal-400 rounded-r-[1px]" />
              )}

              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive
                    ? 'text-teal-400'
                    : 'text-slate-400 group-hover:text-white'
                }`}
              />

              {!collapsed && <span className="truncate">{item.name}</span>}

              {/* Tooltip on collapsed hover */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2 py-1 text-[11px] font-medium text-white bg-slate-900 border border-slate-700 rounded-[4px] shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 whitespace-nowrap">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Design System Link */}
      <div className="p-2 border-t border-slate-800">
        <Link
          href="/design"
          title={collapsed ? 'Design System' : undefined}
          className={`flex items-center gap-3 px-3 py-2 rounded-[4px] text-xs font-medium transition-colors ${
            pathname === '/design'
              ? 'bg-slate-800 text-teal-400 font-semibold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0 text-teal-400" />
          {!collapsed && <span>Design System</span>}
        </Link>
      </div>

      {/* Collapse Toggle Footer */}
      <div className="p-2 border-t border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="w-full flex items-center justify-center p-2 rounded-[4px] text-slate-400 hover:text-white hover:bg-slate-900 transition cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium">
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse sidebar</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
