'use client';

/**
 * SitesTab — Site management component for the Settings page.
 * Fetches, displays, creates, and edits construction sites.
 * Blueprint Section 16: Control-Plane API.
 */
import { useEffect, useState, useCallback } from 'react';
import type { SiteListItem, CreateSiteRequest } from '@mosy/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import { Plus, Pencil, MapPin } from 'lucide-react';

/** Form state for creating or editing a site. */
interface SiteFormState {
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
}

/** Empty form state. */
const EMPTY_FORM: SiteFormState = {
  name: '',
  address: '',
  city: '',
  state: '',
  latitude: '',
  longitude: '',
};

/** Sites management tab for the Settings page. */
export function SitesTab() {
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Fetch all sites from the API. */
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/sites');
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error?.message ?? `Failed to fetch sites (${res.status})`
        );
      }
      const data: SiteListItem[] = await res.json();
      setSites(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error loading sites');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Fetch on mount. */
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  /** Open the dialog for adding a new site. */
  function handleAddClick() {
    setEditingSiteId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  /** Open the dialog pre-filled for editing a site. */
  function handleEditClick(site: SiteListItem) {
    setEditingSiteId(site.id);
    setForm({
      name: site.name,
      address: site.address,
      city: site.city,
      state: site.state,
      latitude: String(site.latitude),
      longitude: String(site.longitude),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  /** Update a single form field. */
  function updateField(field: keyof SiteFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /** Validate and submit the form. */
  async function handleSubmit() {
    setFormError(null);

    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
      setFormError('All text fields are required.');
      return;
    }

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setFormError('Longitude must be a number between -180 and 180.');
      return;
    }

    const payload: CreateSiteRequest = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      latitude: lat,
      longitude: lng,
    };

    setIsSaving(true);
    try {
      const url = editingSiteId ? `/api/sites/${editingSiteId}` : '/api/sites';
      const method = editingSiteId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error?.message ?? `Failed to save site (${res.status})`
        );
      }

      setDialogOpen(false);
      await fetchSites();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save site');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-slate-400">Loading sites...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex h-64 flex-col items-center justify-center gap-4">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchSites}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Site Management</CardTitle>
          <Button size="sm" onClick={handleAddClick}>
            <Plus className="mr-2 h-4 w-4" />
            Add Site
          </Button>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-slate-400">No sites configured yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-center">Cranes</TableHead>
                  <TableHead>Managers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium text-slate-200">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {site.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{site.city}</TableCell>
                    <TableCell className="text-slate-300">{site.state}</TableCell>
                    <TableCell className="text-center text-slate-300">
                      {site.crane_count}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {site.manager_names.join(', ') || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={site.status === 'active' ? 'success' : 'secondary'}>
                        {site.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(site)}
                        aria-label={`Edit ${site.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSiteId ? 'Edit Site' : 'Add Site'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="site-name">Name</Label>
              <Input
                id="site-name"
                placeholder="Construction site name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="site-address">Address</Label>
              <Input
                id="site-address"
                placeholder="Street address"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="site-city">City</Label>
                <Input
                  id="site-city"
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="site-state">State</Label>
                <Input
                  id="site-state"
                  placeholder="State"
                  value={form.state}
                  onChange={(e) => updateField('state', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="site-lat">Latitude</Label>
                <Input
                  id="site-lat"
                  type="number"
                  step="0.0001"
                  placeholder="13.0827"
                  value={form.latitude}
                  onChange={(e) => updateField('latitude', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="site-lng">Longitude</Label>
                <Input
                  id="site-lng"
                  type="number"
                  step="0.0001"
                  placeholder="80.2707"
                  value={form.longitude}
                  onChange={(e) => updateField('longitude', e.target.value)}
                />
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingSiteId ? 'Update Site' : 'Create Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
