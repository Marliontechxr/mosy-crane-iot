'use client';

/**
 * Reports Page — shift reports, safety compliance, productivity.
 * Blueprint Section 11.1e.
 *
 * Three tabs:
 * - Shift Reports: filterable table with CSV export and PDF download links
 * - Safety Compliance: KPI cards, alert distribution pie chart, top alert types bar chart
 * - Productivity: KPI summary cards, grouped bar chart of daily lifts per crane
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Download,
  FileText,
  ShieldCheck,
  Clock,
  ClipboardList,
  Weight,
  TrendingUp,
  BarChart3,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type {
  ShiftReportListItem,
  SafetyComplianceResponse,
  ProductivityReportResponse,
} from '@mosy/shared-types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { KPICard } from '@/components/dashboard/kpi-card';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Colors for alert distribution pie chart slices. */
const ALERT_LEVEL_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

/** Colors for per-crane bars in productivity chart. */
const CRANE_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

/** Recharts tick/label fill for dark theme. */
const CHART_TEXT_FILL = '#94a3b8';

// ---------------------------------------------------------------------------
// Helper: score badge variant
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate Badge variant for a performance score.
 * >= 90: success, >= 75: warning, < 75: destructive.
 */
function scoreBadgeVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 90) return 'success';
  if (score >= 75) return 'warning';
  return 'destructive';
}

/**
 * Formats a Unix timestamp (ms) to a short date string (e.g. "2026-02-04").
 */
function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Shift Reports Tab
// ---------------------------------------------------------------------------

/** Filter state for the shift reports tab. */
interface ShiftFilters {
  from: string;
  to: string;
  operator: string;
  crane: string;
}

/**
 * ShiftReportsTab — filterable table of shift reports with CSV export.
 */
function ShiftReportsTab() {
  const [reports, setReports] = useState<ShiftReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ShiftFilters>({
    from: '',
    to: '',
    operator: '',
    crane: '',
  });

  /** Unique operator/crane options derived from the full dataset. */
  const [allReports, setAllReports] = useState<ShiftReportListItem[]>([]);

  const operatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allReports) {
      map.set(r.operator_id, r.operator_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allReports]);

  const craneOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allReports) {
      map.set(r.crane_id, r.crane_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allReports]);

  /** Fetch shift reports from the API with current filters. */
  const fetchReports = useCallback(async (appliedFilters: ShiftFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.from) params.set('from', appliedFilters.from);
      if (appliedFilters.to) params.set('to', appliedFilters.to);
      if (appliedFilters.operator && appliedFilters.operator !== '__all__') {
        params.set('operator', appliedFilters.operator);
      }
      if (appliedFilters.crane && appliedFilters.crane !== '__all__') {
        params.set('crane', appliedFilters.crane);
      }
      const qs = params.toString();
      const res = await fetch(`/api/reports/shifts${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch shift reports (${res.status})`);
      }
      const data: ShiftReportListItem[] = await res.json();
      setReports(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load shift reports');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load all reports on mount (unfiltered) for populating select options. */
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      try {
        const res = await fetch('/api/reports/shifts');
        if (res.ok) {
          const data: ShiftReportListItem[] = await res.json();
          if (!cancelled) setAllReports(data);
        }
      } catch {
        // Non-critical — select options will just be empty
      }
    }
    void loadAll();
    return () => { cancelled = true; };
  }, []);

  /** Fetch with current filters on mount. */
  useEffect(() => {
    void fetchReports(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Handle "Apply" button click. */
  const handleApply = () => {
    void fetchReports(filters);
  };

  /** Generate and download a CSV from the current reports. */
  const handleExportCSV = () => {
    if (reports.length === 0) return;
    const header = 'Date,Operator,Crane,Duration (hrs),Lifts,Tonnage,Score,Incidents';
    const rows = reports.map((r) => {
      const date = formatDate(r.shift_start);
      const duration = (r.duration_minutes / 60).toFixed(1);
      return `${date},${r.operator_name},${r.crane_name},${duration},${r.lifts_count},${r.total_tonnage},${r.performance_score},${r.safety_incidents}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shift-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Shift Reports</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={reports.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">From</label>
            <Input
              type="date"
              className="w-40"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">To</label>
            <Input
              type="date"
              className="w-40"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Operator</label>
            <Select
              value={filters.operator}
              onValueChange={(v) => setFilters((f) => ({ ...f, operator: v }))}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Operators" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Operators</SelectItem>
                {operatorOptions.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Crane</label>
            <Select
              value={filters.crane}
              onValueChange={(v) => setFilters((f) => ({ ...f, crane: v }))}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Cranes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Cranes</SelectItem>
                {craneOptions.map((cr) => (
                  <SelectItem key={cr.id} value={cr.id}>
                    {cr.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleApply} size="sm">
            Apply
          </Button>
        </div>

        {/* Loading / Error / Table */}
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}

        {error && (
          <div className="flex h-40 items-center justify-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-slate-400">No shift reports found for the selected filters.</p>
          </div>
        )}

        {!loading && !error && reports.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Crane</TableHead>
                <TableHead className="text-right">Duration (hrs)</TableHead>
                <TableHead className="text-right">Lifts</TableHead>
                <TableHead className="text-right">Tonnage</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-center">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-slate-200">{formatDate(r.shift_start)}</TableCell>
                  <TableCell className="text-slate-200">{r.operator_name}</TableCell>
                  <TableCell className="text-slate-300">{r.crane_name}</TableCell>
                  <TableCell className="text-right text-slate-300">
                    {(r.duration_minutes / 60).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-slate-300">{r.lifts_count}</TableCell>
                  <TableCell className="text-right text-slate-300">
                    {r.total_tonnage.toFixed(1)}t
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={scoreBadgeVariant(r.performance_score)}>
                      {r.performance_score}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-slate-300">
                    {r.safety_incidents}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.pdf_url ? (
                      <a
                        href={r.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-400 hover:text-blue-300"
                        title="Download PDF"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Pending</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Safety Compliance Tab
// ---------------------------------------------------------------------------

/** Custom label renderer for pie chart slices showing percentage. */
interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}

/**
 * Renders labels on pie chart slices with level name and percentage.
 */
function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: PieLabelProps) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill={CHART_TEXT_FILL}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

/**
 * SafetyComplianceTab — KPI cards, alert distribution pie chart, top alert types bar chart.
 */
function SafetyComplianceTab() {
  const [data, setData] = useState<SafetyComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/reports/safety');
        if (!res.ok) {
          throw new Error(`Failed to fetch safety compliance (${res.status})`);
        }
        const json: SafetyComplianceResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load safety data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-red-400">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm">{error ?? 'No data available'}</span>
      </div>
    );
  }

  /** Pie chart data with named levels for label rendering. */
  const pieData = data.alert_distribution.map((d) => ({
    name: d.level.charAt(0).toUpperCase() + d.level.slice(1),
    value: d.count,
    level: d.level,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KPICard
          title="Total Shifts"
          value={data.total_shifts}
          subtitle={`${data.safe_shifts} without incidents`}
          icon={<ClipboardList className="h-5 w-5 text-blue-400" />}
        />
        <KPICard
          title="Compliance Rate"
          value={`${data.compliance_percent.toFixed(1)}%`}
          trend={data.compliance_percent >= 85 ? 'up' : 'down'}
          trendValue={data.compliance_percent >= 85 ? 'Above target' : 'Below 85% target'}
          icon={<ShieldCheck className="h-5 w-5 text-green-400" />}
        />
        <KPICard
          title="Avg Resolution Time"
          value={`${data.avg_resolution_time_minutes.toFixed(1)} min`}
          subtitle="Time to acknowledge alerts"
          icon={<Clock className="h-5 w-5 text-amber-400" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alert Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-300">
              Alert Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={renderPieLabel}
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.level}
                      fill={ALERT_LEVEL_COLORS[entry.level] ?? '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value: number) => [value, 'Alerts']}
                />
                <Legend
                  wrapperStyle={{ color: CHART_TEXT_FILL, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Alert Types Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-300">
              Top Alert Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.top_alert_types}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  type="number"
                  tick={{ fill: CHART_TEXT_FILL, fontSize: 12 }}
                  axisLine={{ stroke: '#475569' }}
                />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={150}
                  tick={{ fill: CHART_TEXT_FILL, fontSize: 11 }}
                  axisLine={{ stroke: '#475569' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value: number) => [value, 'Occurrences']}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Productivity Tab
// ---------------------------------------------------------------------------

/** Row shape for the grouped bar chart (one row per date, one key per crane). */
interface ProductivityChartRow {
  date: string;
  [craneKey: string]: string | number;
}

/**
 * ProductivityTab — KPI summary cards and grouped bar chart of daily lifts by crane.
 */
function ProductivityTab() {
  const [data, setData] = useState<ProductivityReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/reports/productivity');
        if (!res.ok) {
          throw new Error(`Failed to fetch productivity report (${res.status})`);
        }
        const json: ProductivityReportResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load productivity data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  /** Derive unique crane list and chart data from daily_lifts. */
  const { cranes, chartData, tonnageMap } = useMemo(() => {
    if (!data) return { cranes: [], chartData: [], tonnageMap: new Map<string, Map<string, number>>() };

    /** Unique cranes in order of first appearance. */
    const craneMap = new Map<string, string>();
    for (const d of data.daily_lifts) {
      if (!craneMap.has(d.crane_id)) {
        craneMap.set(d.crane_id, d.crane_name);
      }
    }
    const craneList = Array.from(craneMap.entries()).map(([id, name]) => ({ id, name }));

    /** Build per-date rows with one key per crane for lifts. */
    const dateMap = new Map<string, ProductivityChartRow>();
    /** Also track tonnage for tooltip display. */
    const tMap = new Map<string, Map<string, number>>();

    for (const d of data.daily_lifts) {
      if (!dateMap.has(d.date)) {
        dateMap.set(d.date, { date: d.date });
      }
      const row = dateMap.get(d.date)!;
      row[d.crane_name] = d.lifts;

      if (!tMap.has(d.date)) {
        tMap.set(d.date, new Map());
      }
      tMap.get(d.date)!.set(d.crane_name, d.tonnage);
    }

    return {
      cranes: craneList,
      chartData: Array.from(dateMap.values()),
      tonnageMap: tMap,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-red-400">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm">{error ?? 'No data available'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Lifts"
          value={data.summary.total_lifts.toLocaleString()}
          subtitle="Last 7 days"
          icon={<TrendingUp className="h-5 w-5 text-blue-400" />}
        />
        <KPICard
          title="Total Tonnage"
          value={`${data.summary.total_tonnage.toLocaleString()}t`}
          subtitle="Last 7 days"
          icon={<Weight className="h-5 w-5 text-green-400" />}
        />
        <KPICard
          title="Avg Lifts/Day"
          value={data.summary.avg_lifts_per_day.toFixed(1)}
          subtitle="Across all cranes"
          icon={<BarChart3 className="h-5 w-5 text-amber-400" />}
        />
        <KPICard
          title="Avg Tonnage/Day"
          value={`${data.summary.avg_tonnage_per_day.toFixed(1)}t`}
          subtitle="Across all cranes"
          icon={<Weight className="h-5 w-5 text-purple-400" />}
        />
      </div>

      {/* Grouped Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-300">
            Daily Lifts by Crane
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                tick={{ fill: CHART_TEXT_FILL, fontSize: 12 }}
                axisLine={{ stroke: '#475569' }}
              />
              <YAxis
                tick={{ fill: CHART_TEXT_FILL, fontSize: 12 }}
                axisLine={{ stroke: '#475569' }}
                label={{
                  value: 'Lifts',
                  angle: -90,
                  position: 'insideLeft',
                  fill: CHART_TEXT_FILL,
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
                formatter={(value: number, name: string, props: { payload: ProductivityChartRow }) => {
                  const date = props.payload.date;
                  const tonnage = tonnageMap.get(date)?.get(name) ?? 0;
                  return [`${value} lifts (${tonnage.toFixed(1)}t)`, name];
                }}
              />
              <Legend
                wrapperStyle={{ color: CHART_TEXT_FILL, fontSize: 12 }}
              />
              {cranes.map((crane, idx) => (
                <Bar
                  key={crane.id}
                  dataKey={crane.name}
                  fill={CRANE_COLORS[idx % CRANE_COLORS.length]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Reports Page
// ---------------------------------------------------------------------------

/**
 * ReportsPage — tabbed view with Shift Reports, Safety Compliance, and Productivity.
 */
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="shifts">
        <TabsList>
          <TabsTrigger value="shifts">Shift Reports</TabsTrigger>
          <TabsTrigger value="safety">Safety Compliance</TabsTrigger>
          <TabsTrigger value="productivity">Productivity</TabsTrigger>
        </TabsList>

        <TabsContent value="shifts">
          <ShiftReportsTab />
        </TabsContent>

        <TabsContent value="safety">
          <SafetyComplianceTab />
        </TabsContent>

        <TabsContent value="productivity">
          <ProductivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
