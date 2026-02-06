'use client';

import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignInPage() {
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600">
            <span className="text-2xl font-bold text-white">M</span>
          </div>
          <CardTitle className="text-2xl">MOSY Dashboard</CardTitle>
          <CardDescription>
            Mobile Crane Operator Safety &amp; Productivity System
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={() => login()} size="lg" className="w-full">
            Sign in with Microsoft
          </Button>
          <p className="text-center text-xs text-slate-500">
            Powered by Microsoft Entra External ID
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
