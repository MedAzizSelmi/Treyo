/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  HardDrive,
  Layers,
  RefreshCw,
  Server,
  Timer,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getMlHealth, getBackendHealth } from '@/lib/api';
import PageHeader from '@/components/PageHeader';

/*
 * System Health page.
 *
 * Polls /admin/system/ml-health and /admin/system/backend-health every
 * POLL_MS milliseconds and keeps the last MAX_HISTORY samples in a
 * ring buffer for the sparkline charts. Failure modes are explicit —
 * if the ML service is unreachable the dashboard surfaces a warning
 * banner rather than going blank.
 */

const POLL_MS = 5000; // 5s — same cadence Grafana would use for live
const MAX_HISTORY = 60; // ~5 min @ 5s = 60 points

type Sample = {
  t: number; // unix ms
  mlCpu: number | null;
  mlMem: number | null;
  jvmHeap: number | null;
  cacheHitRate: number | null;
};

export default function SystemHealthPage() {
  const [ml, setMl] = useState<any>(null);
  const [be, setBe] = useState<any>(null);
  const [mlErr, setMlErr] = useState<string | null>(null);
  const [beErr, setBeErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Sample[]>([]);
  // Keep the latest history in a ref so the poll loop reads the current
  // value without re-arming the interval on every state update.
  const historyRef = useRef<Sample[]>([]);
  historyRef.current = history;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      // Run both calls in parallel — backend metrics are local & fast,
      // ML proxy may take up to ~3s in a degraded state.
      const [mlRes, beRes] = await Promise.allSettled([getMlHealth(), getBackendHealth()]);

      if (cancelled) return;

      let nextMl: any = null;
      let nextBe: any = null;

      if (mlRes.status === 'fulfilled') {
        nextMl = mlRes.value.data;
        setMl(nextMl);
        setMlErr(null);
      } else {
        setMlErr(mlRes.reason?.message || 'ML metrics unreachable');
      }

      if (beRes.status === 'fulfilled') {
        nextBe = beRes.value.data;
        setBe(nextBe);
        setBeErr(null);
      } else {
        setBeErr(beRes.reason?.message || 'Backend metrics unreachable');
      }

      // Append a sample to the ring buffer. Missing fields → null so the
      // chart renders gaps instead of zeros.
      const sample: Sample = {
        t: Date.now(),
        mlCpu: nextMl?.process?.cpu_percent ?? null,
        mlMem: nextMl?.process?.memory_percent ?? null,
        jvmHeap: nextBe?.jvm?.heap_percent ?? null,
        cacheHitRate:
          typeof nextMl?.rec_cache?.hit_rate === 'number'
            ? Math.round(nextMl.rec_cache.hit_rate * 100)
            : null,
      };
      const next = [...historyRef.current, sample].slice(-MAX_HISTORY);
      setHistory(next);
      setLoading(false);
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Live operational metrics for the ML service and Spring Boot backend"
      />

      {(mlErr || beErr) && (
        <div className="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-danger mb-1">
              One or more services could not be reached
            </p>
            {mlErr && <p className="text-muted">ML service: {mlErr}</p>}
            {beErr && <p className="text-muted">Backend: {beErr}</p>}
          </div>
        </div>
      )}

      {loading && history.length === 0 ? (
        <p className="text-muted">Loading metrics…</p>
      ) : (
        <>
          {/* ── ML Service ────────────────────────────────────────── */}
          <SectionHeader
            icon={Zap}
            title="ML Recommendation Service"
            statusOk={ml?.status === 'ok'}
            statusLabel={ml?.status ?? 'unknown'}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <MetricCard
              icon={Layers}
              label="Model version"
              value={ml?.model_version ?? '—'}
              hint={
                ml?.refresh_interval_min
                  ? `refresh every ${ml.refresh_interval_min}m`
                  : undefined
              }
              color="#7cce06"
            />
            <MetricCard
              icon={Cpu}
              label="Process CPU"
              value={fmtPercent(ml?.process?.cpu_percent)}
              hint={
                ml?.process?.system_cpu_percent != null
                  ? `host ${fmtPercent(ml.process.system_cpu_percent)}`
                  : 'psutil unavailable'
              }
              color="#3b82f6"
            />
            <MetricCard
              icon={HardDrive}
              label="Process memory"
              value={fmtPercent(ml?.process?.memory_percent)}
              hint={
                ml?.process?.memory_rss_mb != null
                  ? `${ml.process.memory_rss_mb} MB RSS`
                  : undefined
              }
              color="#a855f7"
            />
            <MetricCard
              icon={Timer}
              label="Uptime"
              value={fmtDuration(ml?.uptime_seconds)}
              hint={
                ml?.scheduler_running ? 'scheduler running' : 'scheduler off'
              }
              color="#f59e0b"
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              icon={Database}
              label="Students"
              value={ml?.data?.students ?? '—'}
              color="#7cce06"
            />
            <MetricCard
              icon={Database}
              label="Courses"
              value={ml?.data?.courses ?? '—'}
              color="#3b82f6"
            />
            <MetricCard
              icon={Database}
              label="Interactions"
              value={ml?.data?.interactions ?? '—'}
              color="#a855f7"
            />
            <MetricCard
              icon={Activity}
              label="Cache hit rate"
              value={
                typeof ml?.rec_cache?.hit_rate === 'number'
                  ? `${Math.round(ml.rec_cache.hit_rate * 100)}%`
                  : '—'
              }
              hint={
                ml?.rec_cache
                  ? `${ml.rec_cache.entries} entries / ${ml.rec_cache.hits + ml.rec_cache.misses} reqs`
                  : undefined
              }
              color="#22c55e"
            />
          </div>

          {/* ── Spring Boot Backend ───────────────────────────────── */}
          <SectionHeader
            icon={Server}
            title="Backend (Spring Boot)"
            statusOk={be?.status === 'ok'}
            statusLabel={be?.status ?? 'unknown'}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              icon={HardDrive}
              label="JVM heap"
              value={fmtPercent(be?.jvm?.heap_percent)}
              hint={
                be?.jvm?.heap_used_mb != null && be?.jvm?.heap_max_mb != null
                  ? `${be.jvm.heap_used_mb} / ${be.jvm.heap_max_mb} MB`
                  : be?.jvm?.heap_used_mb != null
                    ? `${be.jvm.heap_used_mb} MB used`
                    : undefined
              }
              color="#3b82f6"
            />
            <MetricCard
              icon={RefreshCw}
              label="JVM threads"
              value={be?.jvm?.thread_count ?? '—'}
              hint={`${be?.jvm?.processors ?? '?'} cores`}
              color="#a855f7"
            />
            <MetricCard
              icon={Cpu}
              label="System load (1m)"
              value={be?.jvm?.system_load_1m ?? '—'}
              hint={be?.jvm?.system_load_1m == null ? 'unsupported on this OS' : undefined}
              color="#f59e0b"
            />
            <MetricCard
              icon={Timer}
              label="Uptime"
              value={fmtDuration(be?.jvm?.uptime_seconds)}
              hint={`Java ${be?.jvm?.jvm_version ?? '?'}`}
              color="#22c55e"
            />
          </div>

          {/* ── Sparklines ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Sparkline
              title="ML CPU (%)"
              data={history}
              dataKey="mlCpu"
              color="#3b82f6"
            />
            <Sparkline
              title="ML memory (%)"
              data={history}
              dataKey="mlMem"
              color="#a855f7"
            />
            <Sparkline
              title="JVM heap (%)"
              data={history}
              dataKey="jvmHeap"
              color="#22c55e"
            />
            <Sparkline
              title="Cache hit rate (%)"
              data={history}
              dataKey="cacheHitRate"
              color="#7cce06"
            />
          </div>

          <p className="text-xs text-muted mt-6">
            Auto-refreshes every {POLL_MS / 1000}s. Showing last{' '}
            {history.length} samples ({Math.round((history.length * POLL_MS) / 60000)}{' '}
            minutes max).
          </p>
        </>
      )}
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  statusOk,
  statusLabel,
}: {
  icon: any;
  title: string;
  statusOk: boolean;
  statusLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/12 flex items-center justify-center">
          <Icon className="w-4 h-4 text-accent" />
        </div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
      </div>
      <div
        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
          statusOk
            ? 'bg-success/10 text-success'
            : 'bg-danger/10 text-danger'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            statusOk ? 'bg-success' : 'bg-danger'
          }`}
        />
        {statusLabel}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  hint?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: color + '18' }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-xs text-muted">{label}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Sparkline({
  title,
  data,
  dataKey,
  color,
}: {
  title: string;
  data: Sample[];
  dataKey: keyof Sample;
  color: string;
}) {
  // Only render once we have at least 2 points — recharts can't draw a
  // line through a single sample and would just show an empty canvas.
  if (data.length < 2) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-sm font-semibold text-white mb-2">{title}</p>
        <div className="h-28 flex items-center justify-center text-muted text-xs">
          collecting samples…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-sm font-semibold text-white mb-2">{title}</p>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 2" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              tick={{ fill: '#71717a', fontSize: 10 }}
              minTickGap={40}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'auto']}
              width={28}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(t) => new Date(t).toLocaleTimeString()}
              // Value is typed ValueType | undefined by Recharts; annotating
              // it as `number` here failed `next build`'s type-check.
              formatter={(v) => [v == null ? '—' : `${v}`, title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey as string}
              stroke={color}
              fill={`url(#g-${String(dataKey)})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Formatters ──────────────────────────────────────────────────────

function fmtPercent(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v}%`;
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) return `${h}h ${m}m`;
  const d = Math.floor(seconds / 86400);
  return `${d}d ${h % 24}h`;
}
