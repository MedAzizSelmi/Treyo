'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  trend?: { value: string; up: boolean };
};

export default function StatCard({ label, value, icon: Icon, color, trend }: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 hover:border-accent/20 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: color + '18' }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
              trend.up
                ? 'text-success bg-success/10'
                : 'text-danger bg-danger/10'
            }`}
          >
            {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
