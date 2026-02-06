'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useAlertStore } from '@/stores/alert-store';
import { connectSignalR } from '@/lib/signalr';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  FileText,
  Settings,
  LogOut,
  Bell,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard' as const, label: 'Fleet Overview', icon: LayoutDashboard },
  { href: '/dashboard/operators' as const, label: 'Operators', icon: Users },
  { href: '/dashboard/alerts' as const, label: 'Alerts', icon: AlertTriangle },
  { href: '/dashboard/reports' as const, label: 'Reports', icon: FileText },
  { href: '/dashboard/settings' as const, label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, getAccessToken } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/signin');
    }
  }, [isAuthenticated, router]);

  // Sync auth user to store and connect SignalR
  useEffect(() => {
    if (user) {
      setUser(user);
      connectSignalR(getAccessToken).catch(console.error);
    }
  }, [user, setUser, getAccessToken]);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-700 bg-slate-900/95">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">M</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">MOSY</h1>
            <p className="text-xs text-slate-500">Crane Monitoring</p>
          </div>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.label === 'Alerts' && unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1">
                    {unreadCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* User section */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700">
              <span className="text-xs font-medium text-slate-300">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.role}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-700 bg-slate-900/95 px-6 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">
            {NAV_ITEMS.find((item) => 
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            )?.label ?? 'Crane Detail'}
          </h2>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Button>
          </div>
        </header>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
