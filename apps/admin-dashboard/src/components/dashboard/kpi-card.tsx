/**
 * KPICard — displays a metric with label and optional trend indicator.
 */
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function KPICard({ title, value, subtitle, icon, trend, trendValue, className }: KPICardProps) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">{title}</p>
            <p className="mt-1 text-3xl font-bold text-white">{value}</p>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
            {trend && trendValue && (
              <p
                className={cn(
                  'mt-1 text-xs font-medium',
                  trend === 'up' && 'text-green-400',
                  trend === 'down' && 'text-red-400',
                  trend === 'neutral' && 'text-slate-400'
                )}
              >
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
              </p>
            )}
          </div>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700/50">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
