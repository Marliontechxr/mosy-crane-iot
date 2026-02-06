'use client';

/**
 * Settings — crane management, calibration, user management, system health.
 * Blueprint Section 11.1g.
 */
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  const { hasRole } = useAuth();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="cranes">
        <TabsList>
          <TabsTrigger value="cranes">Cranes</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          {hasRole('SuperAdmin') && <TabsTrigger value="users">Users</TabsTrigger>}
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="cranes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crane Management</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Add, edit, and remove cranes — assign to sites
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calibration">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calibration Profiles</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Upload and manage calibration profiles per crane
              </p>
            </CardContent>
          </Card>
        </TabsContent>

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
