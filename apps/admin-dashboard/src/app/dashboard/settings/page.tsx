/**
 * Settings — crane management, calibration wizard, user management, system health.
 * Blueprint Section 11.1g.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { isDemoMode, getDemoCraneList, getDemoCalibration, getDemoSites } from '@/lib/demo-data';
import type {
  CraneListItem,
  CalibrationProfileResponse,
  SiteListItem,
} from '@mosy/shared-types';
import { SitesTab } from '@/components/settings/sites-tab';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

/** Crane form data for create/edit dialog. */
interface CraneFormData {
  name: string;
  crane_type: 'mobile' | 'tower' | 'overhead' | '';
  model: string;
  serial_number: string;
  max_load_tonnes: string;
  boom_length_m: string;
  site_id: string;
}

/** Single gauge row in the calibration editor. */
interface GaugeRow {
  key: string;
  name: string;
  type: 'digital' | 'analog';
  roi_x: string;
  roi_y: string;
  roi_w: string;
  roi_h: string;
  scale_min: string;
  scale_max: string;
  unit: string;
}

/** Safety limits in the calibration editor. */
interface SafetyLimitsForm {
  max_load_tonnes: string;
  max_boom_angle_degrees: string;
  max_wind_kmh: string;
}

/** Initial empty crane form. */
const EMPTY_CRANE_FORM: CraneFormData = {
  name: '',
  crane_type: '',
  model: '',
  serial_number: '',
  max_load_tonnes: '',
  boom_length_m: '',
  site_id: '',
};

// =============================================================================
// Component
// =============================================================================

export default function SettingsPage() {
  const { hasRole, getAccessToken } = useAuth();

  // ------ Crane Management State ------
  const [cranes, setCranes] = useState<CraneListItem[]>([]);
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [cranesLoading, setCranesLoading] = useState(true);
  const [craneDialogOpen, setCraneDialogOpen] = useState(false);
  const [editingCraneId, setEditingCraneId] = useState<string | null>(null);
  const [craneForm, setCraneForm] = useState<CraneFormData>(EMPTY_CRANE_FORM);
  const [craneSubmitting, setCraneSubmitting] = useState(false);
  const [craneError, setCraneError] = useState<string | null>(null);

  // ------ Calibration State ------
  const [calCraneId, setCalCraneId] = useState<string>('');
  const [calLoading, setCalLoading] = useState(false);
  const [gauges, setGauges] = useState<GaugeRow[]>([]);
  const [safetyLimits, setSafetyLimits] = useState<SafetyLimitsForm>({
    max_load_tonnes: '',
    max_boom_angle_degrees: '',
    max_wind_kmh: '',
  });
  const [calSubmitting, setCalSubmitting] = useState(false);
  const [calFeedback, setCalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ------ Load cranes + sites on mount ------
  useEffect(() => {
    const loadData = async () => {
      try {
        if (isDemoMode()) {
          setCranes(getDemoCraneList());
          setSites(getDemoSites());
        } else {
          const token = await getAccessToken();
          const headers = { Authorization: `Bearer ${token}` };
          const [cranesRes, sitesRes] = await Promise.all([
            fetch('/api/cranes', { headers }),
            fetch('/api/sites', { headers }),
          ]);
          if (cranesRes.ok) {
            setCranes((await cranesRes.json()) as CraneListItem[]);
          }
          if (sitesRes.ok) {
            setSites((await sitesRes.json()) as SiteListItem[]);
          }
        }
      } catch (err) {
        console.error('Failed to load settings data:', err);
      } finally {
        setCranesLoading(false);
      }
    };
    loadData();
  }, [getAccessToken]);

  // ==========================================================================
  // Crane Management Handlers
  // ==========================================================================

  /** Open dialog in "add" mode. */
  const handleAddCrane = useCallback(() => {
    setEditingCraneId(null);
    setCraneForm(EMPTY_CRANE_FORM);
    setCraneError(null);
    setCraneDialogOpen(true);
  }, []);

  /** Open dialog in "edit" mode, pre-filling form from existing crane. */
  const handleEditCrane = useCallback((crane: CraneListItem) => {
    setEditingCraneId(crane.id);
    const matchingSite = sites.find((s) => s.name === crane.site_name);
    setCraneForm({
      name: crane.name,
      crane_type: crane.crane_type,
      model: crane.model,
      serial_number: crane.serial_number,
      max_load_tonnes: String(crane.max_load_tonnes),
      boom_length_m: String(crane.boom_length_m),
      site_id: matchingSite?.id ?? '',
    });
    setCraneError(null);
    setCraneDialogOpen(true);
  }, [sites]);

  /** Submit create or update for a crane. */
  const handleCraneSubmit = useCallback(async () => {
    if (!craneForm.name.trim()) {
      setCraneError('Crane name is required');
      return;
    }
    if (!craneForm.crane_type) {
      setCraneError('Crane type is required');
      return;
    }
    const maxLoad = parseFloat(craneForm.max_load_tonnes);
    if (isNaN(maxLoad) || maxLoad <= 0) {
      setCraneError('Max load must be a positive number');
      return;
    }
    const boomLen = parseFloat(craneForm.boom_length_m);
    if (craneForm.boom_length_m && (isNaN(boomLen) || boomLen <= 0)) {
      setCraneError('Boom length must be a positive number');
      return;
    }

    setCraneSubmitting(true);
    setCraneError(null);

    try {
      const token = await getAccessToken();
      const payload = {
        name: craneForm.name.trim(),
        crane_type: craneForm.crane_type,
        model: craneForm.model.trim(),
        serial_number: craneForm.serial_number.trim(),
        max_load_tonnes: maxLoad,
        boom_length_m: boomLen || 0,
        site_id: craneForm.site_id,
      };

      const isEdit = editingCraneId !== null;
      const url = isEdit ? `/api/cranes/${editingCraneId}` : '/api/cranes';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody?.error?.message ?? 'Failed to save crane');
      }

      // Refresh crane list
      if (isDemoMode()) {
        setCranes(getDemoCraneList());
      } else {
        const refreshRes = await fetch('/api/cranes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          setCranes((await refreshRes.json()) as CraneListItem[]);
        }
      }

      setCraneDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setCraneError(message);
    } finally {
      setCraneSubmitting(false);
    }
  }, [craneForm, editingCraneId, getAccessToken]);

  /** Decommission (set status=retired) a crane. */
  const handleDecommission = useCallback(async (craneId: string) => {
    try {
      const token = await getAccessToken();
      await fetch(`/api/cranes/${craneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'retired' }),
      });

      // Refresh crane list
      if (isDemoMode()) {
        setCranes(getDemoCraneList());
      } else {
        const res = await fetch('/api/cranes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setCranes((await res.json()) as CraneListItem[]);
        }
      }
    } catch (err) {
      console.error('Failed to decommission crane:', err);
    }
  }, [getAccessToken]);

  // ==========================================================================
  // Calibration Handlers
  // ==========================================================================

  /** Load calibration data when a crane is selected. */
  const handleCalibrationCraneSelect = useCallback(async (craneId: string) => {
    setCalCraneId(craneId);
    setCalFeedback(null);
    setCalLoading(true);

    try {
      let profile: CalibrationProfileResponse;
      if (isDemoMode()) {
        profile = getDemoCalibration(craneId);
      } else {
        const token = await getAccessToken();
        const res = await fetch(`/api/cranes/${craneId}/calibration`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load calibration');
        profile = (await res.json()) as CalibrationProfileResponse;
      }

      // Convert CalibrationProfileResponse gauges into editable rows
      const rows: GaugeRow[] = Object.entries(profile.gauges).map(
        ([key, gauge]) => ({
          key,
          name: key,
          type: gauge.type,
          roi_x: String(Math.round(gauge.roi.x * 100)),
          roi_y: String(Math.round(gauge.roi.y * 100)),
          roi_w: String(Math.round(gauge.roi.width * 100)),
          roi_h: String(Math.round(gauge.roi.height * 100)),
          scale_min: String(gauge.scale_min),
          scale_max: String(gauge.scale_max),
          unit: gauge.unit,
        })
      );
      setGauges(rows);

      setSafetyLimits({
        max_load_tonnes: String(profile.safety_limits.max_load_tonnes),
        max_boom_angle_degrees: String(profile.safety_limits.max_boom_angle_degrees),
        max_wind_kmh: String(profile.safety_limits.max_wind_kmh),
      });
    } catch (err) {
      console.error('Failed to load calibration:', err);
      setCalFeedback({ type: 'error', message: 'Failed to load calibration profile' });
    } finally {
      setCalLoading(false);
    }
  }, [getAccessToken]);

  /** Update a single gauge row field. */
  const updateGauge = useCallback(
    (index: number, field: keyof GaugeRow, value: string) => {
      setGauges((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
      setCalFeedback(null);
    },
    []
  );

  /** Add a new empty gauge row. */
  const addGaugeRow = useCallback(() => {
    const newKey = `gauge_${Date.now()}`;
    setGauges((prev) => [
      ...prev,
      {
        key: newKey,
        name: '',
        type: 'digital' as const,
        roi_x: '0',
        roi_y: '0',
        roi_w: '20',
        roi_h: '15',
        scale_min: '0',
        scale_max: '100',
        unit: '',
      },
    ]);
  }, []);

  /** Remove a gauge row by index. */
  const removeGaugeRow = useCallback((index: number) => {
    setGauges((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Save calibration profile. */
  const handleCalibrationSave = useCallback(async () => {
    if (!calCraneId) return;

    // Validate gauges
    for (const g of gauges) {
      if (!g.name.trim()) {
        setCalFeedback({ type: 'error', message: 'All gauges must have a name' });
        return;
      }
      const roiValues = [g.roi_x, g.roi_y, g.roi_w, g.roi_h].map(Number);
      if (roiValues.some((v) => isNaN(v) || v < 0 || v > 100)) {
        setCalFeedback({ type: 'error', message: `Gauge "${g.name}": ROI values must be 0-100` });
        return;
      }
      const sMin = parseFloat(g.scale_min);
      const sMax = parseFloat(g.scale_max);
      if (isNaN(sMin) || isNaN(sMax) || sMin >= sMax) {
        setCalFeedback({ type: 'error', message: `Gauge "${g.name}": scale_min must be less than scale_max` });
        return;
      }
    }

    // Validate safety limits
    const loadT = parseFloat(safetyLimits.max_load_tonnes);
    const boomA = parseFloat(safetyLimits.max_boom_angle_degrees);
    const windK = parseFloat(safetyLimits.max_wind_kmh);
    if (isNaN(loadT) || loadT <= 0) {
      setCalFeedback({ type: 'error', message: 'Max load must be a positive number' });
      return;
    }
    if (isNaN(boomA) || boomA <= 0 || boomA > 90) {
      setCalFeedback({ type: 'error', message: 'Max boom angle must be 1-90' });
      return;
    }
    if (isNaN(windK) || windK <= 0) {
      setCalFeedback({ type: 'error', message: 'Max wind speed must be a positive number' });
      return;
    }

    setCalSubmitting(true);
    setCalFeedback(null);

    try {
      const gaugesPayload: Record<string, {
        type: 'digital' | 'analog';
        roi: { x: number; y: number; width: number; height: number };
        scale_min: number;
        scale_max: number;
        unit: string;
      }> = {};

      for (const g of gauges) {
        gaugesPayload[g.name.trim()] = {
          type: g.type,
          roi: {
            x: parseFloat(g.roi_x),
            y: parseFloat(g.roi_y),
            width: parseFloat(g.roi_w),
            height: parseFloat(g.roi_h),
          },
          scale_min: parseFloat(g.scale_min),
          scale_max: parseFloat(g.scale_max),
          unit: g.unit.trim(),
        };
      }

      const payload = {
        gauges: gaugesPayload,
        safety_limits: {
          max_load_tonnes: loadT,
          max_boom_angle_degrees: boomA,
          max_wind_kmh: windK,
        },
      };

      const token = await getAccessToken();
      const res = await fetch(`/api/cranes/${calCraneId}/calibration`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody?.error?.message ?? 'Failed to save calibration');
      }

      setCalFeedback({ type: 'success', message: 'Calibration profile saved successfully' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setCalFeedback({ type: 'error', message });
    } finally {
      setCalSubmitting(false);
    }
  }, [calCraneId, gauges, safetyLimits, getAccessToken]);

  // ==========================================================================
  // Render
  // ==========================================================================

  /** Map crane status to Badge variant. */
  const statusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'maintenance':
        return 'warning' as const;
      case 'retired':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="cranes">
        <TabsList>
          <TabsTrigger value="cranes">Cranes</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          {hasRole('SuperAdmin') && <TabsTrigger value="users">Users</TabsTrigger>}
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* CRANES TAB                                                        */}
        {/* ================================================================ */}
        <TabsContent value="cranes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Crane Management</CardTitle>
              <Button size="sm" onClick={handleAddCrane}>
                <Plus className="mr-1 h-4 w-4" />
                Add Crane
              </Button>
            </CardHeader>
            <CardContent>
              {cranesLoading ? (
                <p className="text-sm text-slate-400">Loading cranes...</p>
              ) : cranes.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No cranes registered. Click &quot;Add Crane&quot; to get started.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Max Load</TableHead>
                      <TableHead>Boom (m)</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cranes.map((crane) => (
                      <TableRow key={crane.id}>
                        <TableCell className="font-medium text-slate-200">{crane.name}</TableCell>
                        <TableCell className="text-slate-300 capitalize">{crane.crane_type}</TableCell>
                        <TableCell className="text-slate-400">{crane.model}</TableCell>
                        <TableCell className="text-slate-300">{crane.max_load_tonnes}t</TableCell>
                        <TableCell className="text-slate-300">{crane.boom_length_m}</TableCell>
                        <TableCell className="text-slate-400">{crane.site_name}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(crane.status)}>
                            {crane.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditCrane(crane)}
                              aria-label={`Edit ${crane.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {crane.status !== 'retired' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDecommission(crane.id)}
                                aria-label={`Decommission ${crane.name}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Crane Add/Edit Dialog */}
          <Dialog open={craneDialogOpen} onOpenChange={setCraneDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCraneId ? 'Edit Crane' : 'Add New Crane'}
                </DialogTitle>
                <DialogDescription>
                  {editingCraneId
                    ? 'Update the crane properties below.'
                    : 'Fill in the details to register a new crane.'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="crane-name">Crane Name</Label>
                  <Input
                    id="crane-name"
                    placeholder="e.g. Liebherr LTM 1300"
                    value={craneForm.name}
                    onChange={(e) =>
                      setCraneForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Crane Type</Label>
                    <Select
                      value={craneForm.crane_type}
                      onValueChange={(v) =>
                        setCraneForm((f) => ({
                          ...f,
                          crane_type: v as 'mobile' | 'tower' | 'overhead',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="tower">Tower</SelectItem>
                        <SelectItem value="overhead">Overhead</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="crane-model">Model</Label>
                    <Input
                      id="crane-model"
                      placeholder="e.g. LTM 1300-6.3"
                      value={craneForm.model}
                      onChange={(e) =>
                        setCraneForm((f) => ({ ...f, model: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crane-serial">Serial Number</Label>
                  <Input
                    id="crane-serial"
                    placeholder="e.g. LTM-2024-00147"
                    value={craneForm.serial_number}
                    onChange={(e) =>
                      setCraneForm((f) => ({ ...f, serial_number: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="crane-load">Max Load (tonnes)</Label>
                    <Input
                      id="crane-load"
                      type="number"
                      min="1"
                      step="0.1"
                      placeholder="e.g. 50"
                      value={craneForm.max_load_tonnes}
                      onChange={(e) =>
                        setCraneForm((f) => ({ ...f, max_load_tonnes: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crane-boom">Boom Length (m)</Label>
                    <Input
                      id="crane-boom"
                      type="number"
                      min="1"
                      step="0.1"
                      placeholder="e.g. 60"
                      value={craneForm.boom_length_m}
                      onChange={(e) =>
                        setCraneForm((f) => ({ ...f, boom_length_m: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Assigned Site</Label>
                  <Select
                    value={craneForm.site_id}
                    onValueChange={(v) =>
                      setCraneForm((f) => ({ ...f, site_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name} — {site.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {craneError && (
                <div className="rounded-md border border-red-600/50 bg-red-900/20 px-3 py-2">
                  <p className="text-sm text-red-400">{craneError}</p>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCraneDialogOpen(false)}
                  disabled={craneSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleCraneSubmit} disabled={craneSubmitting}>
                  {craneSubmitting
                    ? 'Saving...'
                    : editingCraneId
                      ? 'Update Crane'
                      : 'Add Crane'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ================================================================ */}
        {/* CALIBRATION TAB                                                   */}
        {/* ================================================================ */}
        <TabsContent value="calibration">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calibration Profiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Select crane */}
              <div className="space-y-2">
                <Label>Step 1: Select Crane</Label>
                <Select value={calCraneId} onValueChange={handleCalibrationCraneSelect}>
                  <SelectTrigger className="w-80">
                    <SelectValue placeholder="Choose a crane to calibrate" />
                  </SelectTrigger>
                  <SelectContent>
                    {cranes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {calLoading && (
                <p className="text-sm text-slate-400">Loading calibration data...</p>
              )}

              {/* Step 2: Gauge configuration table */}
              {calCraneId && !calLoading && gauges.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">Step 2: Dashboard Gauges</Label>
                      <Button size="sm" variant="outline" onClick={addGaugeRow}>
                        <Plus className="mr-1 h-3 w-3" />
                        Add Gauge
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[120px]">Gauge Name</TableHead>
                            <TableHead className="min-w-[100px]">Type</TableHead>
                            <TableHead>ROI X</TableHead>
                            <TableHead>ROI Y</TableHead>
                            <TableHead>ROI W</TableHead>
                            <TableHead>ROI H</TableHead>
                            <TableHead>Scale Min</TableHead>
                            <TableHead>Scale Max</TableHead>
                            <TableHead className="min-w-[80px]">Unit</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gauges.map((gauge, index) => (
                            <TableRow key={gauge.key}>
                              <TableCell>
                                <Input
                                  value={gauge.name}
                                  onChange={(e) => updateGauge(index, 'name', e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={gauge.type}
                                  onValueChange={(v) => updateGauge(index, 'type', v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="digital">Digital</SelectItem>
                                    <SelectItem value="analog">Analog</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={gauge.roi_x}
                                  onChange={(e) => updateGauge(index, 'roi_x', e.target.value)}
                                  className="h-8 w-16 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={gauge.roi_y}
                                  onChange={(e) => updateGauge(index, 'roi_y', e.target.value)}
                                  className="h-8 w-16 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={gauge.roi_w}
                                  onChange={(e) => updateGauge(index, 'roi_w', e.target.value)}
                                  className="h-8 w-16 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={gauge.roi_h}
                                  onChange={(e) => updateGauge(index, 'roi_h', e.target.value)}
                                  className="h-8 w-16 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={gauge.scale_min}
                                  onChange={(e) => updateGauge(index, 'scale_min', e.target.value)}
                                  className="h-8 w-20 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={gauge.scale_max}
                                  onChange={(e) => updateGauge(index, 'scale_max', e.target.value)}
                                  className="h-8 w-20 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={gauge.unit}
                                  onChange={(e) => updateGauge(index, 'unit', e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeGaugeRow(index)}
                                  aria-label={`Remove gauge ${gauge.name}`}
                                  className="h-8 w-8"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Step 3: Safety Limits */}
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Step 3: Safety Limits</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cal-max-load" className="text-xs">
                          Max Load (tonnes)
                        </Label>
                        <Input
                          id="cal-max-load"
                          type="number"
                          min="1"
                          step="0.1"
                          value={safetyLimits.max_load_tonnes}
                          onChange={(e) =>
                            setSafetyLimits((s) => ({ ...s, max_load_tonnes: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cal-max-angle" className="text-xs">
                          Max Boom Angle (deg)
                        </Label>
                        <Input
                          id="cal-max-angle"
                          type="number"
                          min="1"
                          max="90"
                          step="1"
                          value={safetyLimits.max_boom_angle_degrees}
                          onChange={(e) =>
                            setSafetyLimits((s) => ({
                              ...s,
                              max_boom_angle_degrees: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cal-max-wind" className="text-xs">
                          Max Wind (km/h)
                        </Label>
                        <Input
                          id="cal-max-wind"
                          type="number"
                          min="1"
                          step="1"
                          value={safetyLimits.max_wind_kmh}
                          onChange={(e) =>
                            setSafetyLimits((s) => ({ ...s, max_wind_kmh: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Feedback */}
                  {calFeedback && (
                    <div
                      className={`rounded-md border px-4 py-3 ${
                        calFeedback.type === 'success'
                          ? 'border-green-600/50 bg-green-900/20'
                          : 'border-red-600/50 bg-red-900/20'
                      }`}
                    >
                      <p
                        className={`text-sm ${
                          calFeedback.type === 'success' ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {calFeedback.message}
                      </p>
                    </div>
                  )}

                  {/* Save button */}
                  <div className="flex justify-end">
                    <Button onClick={handleCalibrationSave} disabled={calSubmitting}>
                      <Wrench className="mr-2 h-4 w-4" />
                      {calSubmitting ? 'Saving...' : 'Save Calibration'}
                    </Button>
                  </div>
                </>
              )}

              {/* Empty state when crane selected but no gauges and not loading */}
              {calCraneId && !calLoading && gauges.length === 0 && (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-sm text-slate-400">
                    No calibration data found for this crane. Add gauges to begin.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* USERS TAB (SuperAdmin only — placeholder kept)                    */}
        {/* ================================================================ */}
        {hasRole('SuperAdmin') && (
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Management</CardTitle>
              </CardHeader>
              <CardContent className="flex h-64 items-center justify-center">
                <p className="text-sm text-slate-400">
                  Invite operators, assign roles — SuperAdmin only
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ================================================================ */}
        {/* SITES TAB                                                         */}
        {/* ================================================================ */}
        <TabsContent value="sites">
          <SitesTab />
        </TabsContent>

        {/* ================================================================ */}
        {/* HEALTH TAB (placeholder kept)                                     */}
        {/* ================================================================ */}
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Health</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Device twin status for all Jetsons, last sync times, firmware versions
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
