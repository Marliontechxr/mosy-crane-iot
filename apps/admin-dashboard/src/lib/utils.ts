import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function formatRelativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTonnes(value: number): string {
  return `${value.toFixed(1)}t`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function getAlertColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-red-500';
    case 'warning': return 'text-amber-500';
    case 'info': return 'text-blue-500';
    default: return 'text-slate-400';
  }
}

export function getCraneStatusColor(status: string, loadPercent: number): string {
  if (status === 'offline') return 'bg-gray-500';
  if (loadPercent >= 90) return 'bg-red-500';
  if (loadPercent >= 75) return 'bg-amber-500';
  return 'bg-green-500';
}
