'use client';

/**
 * Operator Management — data table of all operators.
 * Blueprint Section 11.1c.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OperatorListItem } from '@mosy/shared-types';
import { Search } from 'lucide-react';

export default function OperatorsPage() {
  const { getAccessToken } = useAuth();
  const router = useRouter();
  const [operators, setOperators] = useState<OperatorListItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/operators', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOperators(data);
        }
      } catch (err) {
        console.error('Failed to load operators:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [getAccessToken]);

  const filtered = operators.filter(
    (op) =>
      op.name.toLowerCase().includes(search.toLowerCase()) ||
      op.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Operators</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search operators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading operators...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Certified</TableHead>
                  <TableHead>Total Lifts</TableHead>
                  <TableHead>Safety Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400">
                      No operators found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((op) => (
                    <TableRow
                      key={op.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/operators/${op.id}`)}
                    >
                      <TableCell className="font-medium text-slate-200">{op.name}</TableCell>
                      <TableCell className="text-slate-400">{op.email}</TableCell>
                      <TableCell>
                        <Badge variant={op.certifications.mobile_crane ? 'success' : 'outline'}>
                          {op.certifications.mobile_crane ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {op.performance_metrics.total_lifts}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            op.performance_metrics.safety_score >= 90
                              ? 'text-green-400'
                              : op.performance_metrics.safety_score >= 75
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }
                        >
                          {op.performance_metrics.safety_score}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            op.status === 'active' ? 'success' : op.status === 'inactive' ? 'secondary' : 'destructive'
                          }
                        >
                          {op.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
