'use client';

/**
 * Operator Detail — profile, performance trend, shift history.
 * Blueprint Section 11.1d.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatTimestamp } from '@/lib/utils';
import type { OperatorListItem, ShiftSummary } from '@mosy/shared-types';

export default function OperatorDetailPage() {
  const params = useParams<{ operatorId: string }>();
  const { getAccessToken } = useAuth();
  const [operator, setOperator] = useState<OperatorListItem | null>(null);
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken();
        const [opRes, shiftRes] = await Promise.all([
          fetch(`/api/operators`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/operators/${params.operatorId}/shifts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (opRes.ok) {
          const ops: OperatorListItem[] = await opRes.json();
          setOperator(ops.find((o) => o.id === params.operatorId) ?? null);
        }
        if (shiftRes.ok) {
          setShifts(await shiftRes.json());
        }
      } catch (err) {
        console.error('Failed to load operator:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [params.operatorId, getAccessToken]);

  if (isLoading) {
    return <p className="text-slate-400">Loading operator data...</p>;
  }

  if (!operator) {
    return <p className="text-slate-400">Operator not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600">
            <span className="text-xl font-bold text-white">
              {operator.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{operator.name}</h2>
            <p className="text-sm text-slate-400">{operator.email}</p>
            <div className="mt-2 flex gap-2">
              <Badge variant={operator.status === 'active' ? 'success' : 'secondary'}>
                {operator.status}
              </Badge>
              {operator.certifications.mobile_crane && (
                <Badge variant="default">Mobile Crane Certified</Badge>
              )}
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-white">
              {operator.performance_metrics.safety_score}%
            </p>
            <p className="text-xs text-slate-400">Safety Score</p>
            <p className="mt-1 text-lg font-semibold text-slate-300">
              {operator.performance_metrics.total_lifts}
            </p>
            <p className="text-xs text-slate-400">Total Lifts</p>
          </div>
        </CardContent>
      </Card>

      {/* Shift History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift History</CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-400">No shifts recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Crane</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Lifts</TableHead>
                  <TableHead>Tonnage</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Incidents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="text-slate-300">
                      {formatTimestamp(shift.shift_start)}
                    </TableCell>
                    <TableCell className="text-slate-300">{shift.crane_id}</TableCell>
                    <TableCell className="text-slate-300">
                      {Math.round(shift.duration_minutes)} min
                    </TableCell>
                    <TableCell className="text-slate-300">{shift.lifts.count}</TableCell>
                    <TableCell className="text-slate-300">
                      {shift.lifts.total_tonnage.toFixed(1)}t
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          shift.performance.score >= 90
                            ? 'text-green-400'
                            : shift.performance.score >= 75
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }
                      >
                        {shift.performance.score}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {shift.performance.safety_incidents > 0 ? (
                        <Badge variant="destructive">{shift.performance.safety_incidents}</Badge>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
