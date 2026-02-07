/**
 * Operator Registration — form for creating a new operator record.
 * Fields: personal info, certifications, photo enrollment placeholder.
 * Blueprint Section 11.1c.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { isDemoMode, getDemoSites } from '@/lib/demo-data';
import type { SiteListItem } from '@mosy/shared-types';
import { Camera, ArrowLeft } from 'lucide-react';

/** Form state for operator registration. */
interface OperatorFormData {
  name: string;
  email: string;
  phone: string;
  employee_id: string;
  department: string;
  site_id: string;
  mobile_crane: boolean;
  tower_crane: boolean;
  overhead_crane: boolean;
  cert_expires: string;
}

/** Initial empty form state. */
const INITIAL_FORM: OperatorFormData = {
  name: '',
  email: '',
  phone: '',
  employee_id: '',
  department: '',
  site_id: '',
  mobile_crane: false,
  tower_crane: false,
  overhead_crane: false,
  cert_expires: '',
};

export default function NewOperatorPage() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [form, setForm] = useState<OperatorFormData>(INITIAL_FORM);
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      setSites(getDemoSites());
      return;
    }
    // Production: fetch sites from API.
    const loadSites = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/sites', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as SiteListItem[];
          setSites(data);
        }
      } catch (err) {
        console.error('Failed to load sites:', err);
      }
    };
    loadSites();
  }, [getAccessToken]);

  /** Update a text/number form field. */
  const updateField = useCallback(
    (field: keyof OperatorFormData, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setError(null);
    },
    []
  );

  /** Submit the operator registration form. */
  const handleSubmit = async () => {
    // Client-side validation
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Valid email is required');
      return;
    }
    if (!form.phone.trim()) {
      setError('Phone number is required');
      return;
    }
    if (!form.employee_id.trim()) {
      setError('Employee ID is required');
      return;
    }
    if (!form.department.trim()) {
      setError('Department is required');
      return;
    }
    if (!form.site_id) {
      setError('Site assignment is required');
      return;
    }

    const hasCert = form.mobile_crane || form.tower_crane || form.overhead_crane;
    if (hasCert && !form.cert_expires) {
      setError('Certification expiry date is required when certifications are selected');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        employee_id: form.employee_id.trim(),
        department: form.department.trim(),
        site_id: form.site_id,
        certifications: {
          mobile_crane: form.mobile_crane,
          tower_crane: form.tower_crane,
          overhead_crane: form.overhead_crane,
          expires: form.cert_expires ? new Date(form.cert_expires).getTime() : 0,
        },
      };

      const res = await fetch('/api/operators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.message ?? 'Failed to create operator');
      }

      router.push('/dashboard/operators');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/dashboard/operators')}
          aria-label="Back to operators"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-white">Register New Operator</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="e.g. Rajesh Kumar"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="e.g. rajesh.kumar@balanetra.com"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g. +91-9876543210"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee_id">Employee ID</Label>
              <Input
                id="employee_id"
                placeholder="e.g. EMP-006"
                value={form.employee_id}
                onChange={(e) => updateField('employee_id', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                placeholder="e.g. Operations"
                value={form.department}
                onChange={(e) => updateField('department', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Assigned Site</Label>
              <Select
                value={form.site_id}
                onValueChange={(value) => updateField('site_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
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
          </CardContent>
        </Card>

        {/* Certifications & Photo */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Certifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.mobile_crane}
                    onChange={(e) => updateField('mobile_crane', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  Mobile Crane
                </label>

                <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.tower_crane}
                    onChange={(e) => updateField('tower_crane', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  Tower Crane
                </label>

                <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.overhead_crane}
                    onChange={(e) => updateField('overhead_crane', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  Overhead Crane
                </label>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="cert_expires">Certification Expiry Date</Label>
                <Input
                  id="cert_expires"
                  type="date"
                  value={form.cert_expires}
                  onChange={(e) => updateField('cert_expires', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Face Enrollment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50">
                <Camera className="mb-2 h-8 w-8 text-slate-500" />
                <p className="text-sm text-slate-400">Face enrollment coming soon</p>
                <p className="mt-1 text-xs text-slate-500">
                  Photo capture will be enabled after registration
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-600/50 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/operators')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Registering...' : 'Register Operator'}
        </Button>
      </div>
    </div>
  );
}
