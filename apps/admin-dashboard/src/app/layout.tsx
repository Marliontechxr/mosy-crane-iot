import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = {
  title: 'MOSY — Crane Monitoring Dashboard',
  description: 'Mobile Crane Operator Safety & Productivity System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        <DemoBanner />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
