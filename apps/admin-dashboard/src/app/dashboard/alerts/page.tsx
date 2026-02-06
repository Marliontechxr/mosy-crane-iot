'use client';

/**
 * Alerts — full alert history table with filtering and acknowledgement.
 * Blueprint Section 11.1f.
 */
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useAlertStore } from '@/stores/alert-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatTimestamp } from '@/lib/utils';
import { CheckCircle } from 'lucide-react';
import type { AlertLevel } from '@mosy/shared-types';

export default function AlertsPage() {
  const { user, getAccessToken, hasRole } = useAuth();
  const { alerts, filters, isLoading, fetchAlerts, setFilters, acknowledgeAlert } = useAlertStore();

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken();
        await fetchAlerts(token);
      } catch (err) {
        console.error('Failed to load alerts:', err);
      }
    };
    load();
  }, [getAccessToken, fetchAlerts]);

  const handleFilterLevel = (value: string) => {
    const level = value === 'all' ? undefined : (value as AlertLevel);
    setFilters({ ...filters, level });
    getAccessToken().then((token) => fetchAlerts(token, { ...filters, level }));
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!user) return;
    const token = await getAccessToken();
    await acknowledgeAlert(alertId, token, user.id);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Alert History</CardTitle>
          <div className="flex gap-2">
            <Select onValueChange={handleFilterLevel} defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading alerts...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Crane</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400">
                      No alerts found
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Badge
                          variant={
                            alert.level === 'critical'
                              ? 'destructive'
                              : alert.level === 'warning'
                                ? 'warning'
                                : 'secondary'
                          }
                        >
                          {alert.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-200">
                        {alert.title}
                      </TableCell>
                      <TableCell className="text-slate-400">{alert.crane_id}</TableCell>
                      <TableCell className="text-slate-400">
                        {formatTimestamp(alert.timestamp)}
                      </TableCell>
                      <TableCell>
                        {alert.acknowledged ? (
                          <Badge variant="success">Acknowledged</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!alert.acknowledged && hasRole('Operator') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Ack
                          </Button>
                        )}
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
