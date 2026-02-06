'use client';

/**
 * Reports — shift reports, safety compliance, productivity.
 * Blueprint Section 11.1e.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shift Reports</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Shift report list with PDF download links — connects to Azure Blob Storage
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Safety Compliance</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Alert type distribution pie chart and resolution time metrics
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productivity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Productivity</CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                Lifts per crane per day bar chart — connects to Cosmos DB lifts container
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
