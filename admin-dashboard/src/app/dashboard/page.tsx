'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  UserPlus,
  Activity,
  MessageSquare,
  BarChart3,
  Coins,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getDashboardStats, getRevenueCurrency } from '@/lib/api';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<string>('TND');

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, currencyRes] = await Promise.all([
          getDashboardStats(),
          getRevenueCurrency(),
        ]);
        setStats(statsRes.data);
        setCurrency(currencyRes.data.currency || 'TND');
      } catch (err) {
        console.error('Failed to load stats', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <p className="text-danger p-8">Failed to load dashboard data.</p>;

  // Chart data (derived from stats)
  const userDistribution = [
    { name: 'Students', value: stats.totalStudents || 0, color: '#7cce06' },
    { name: 'Trainers', value: stats.totalTrainers || 0, color: '#3b82f6' },
  ];

  // Two separate enrollment buckets — dropped the "Total" bar because it's
  // just Active + Completed by definition, so it always rendered as the
  // tallest bar and made the chart visually misleading. The "total" number
  // is already shown in the Active Enrollments StatCard above.
  const enrollmentData = [
    { name: 'Active', value: stats.activeEnrollments || 0, color: '#7cce06' },
    { name: 'Completed', value: stats.completedEnrollments || 0, color: '#3b82f6' },
  ];

  // This Week's Activity — three categorical counts. Previously rendered as
  // an AreaChart, which implies a time series the data isn't (the smooth
  // fill between unrelated categories was meaningless). Now a clean grouped
  // bar with one colour per category so each value reads independently.
  const weeklyActivity = [
    { name: 'New Users', value: stats.newUsersThisWeek || 0, color: '#7cce06' },
    { name: 'New Enrollments', value: stats.enrollmentsThisWeek || 0, color: '#3b82f6' },
    { name: 'New Courses', value: stats.coursesCreatedThisWeek || 0, color: '#a855f7' },
  ];

  // Drafts and pending approval were removed — every course is created live
  // when admin assigns a template. Pie chart now just shows live vs deleted.
  const courseStatus = [
    { name: 'Live', value: stats.publishedCourses || 0, color: '#22c55e' },
    {
      name: 'Deleted',
      value: Math.max(0, (stats.totalCourses || 0) - (stats.publishedCourses || 0)),
      color: '#71717a',
    },
  ].filter(item => item.value > 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back — here's an overview of Treyo platform`}
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={stats.totalUsers || 0}
          icon={Users}
          color="#7cce06"
          trend={{ value: `+${stats.newUsersThisWeek || 0} this week`, up: true }}
        />
        <StatCard
          label="Total Students"
          value={stats.totalStudents || 0}
          icon={GraduationCap}
          color="#3b82f6"
          trend={{ value: `+${stats.newStudentsThisWeek || 0} this week`, up: true }}
        />
        <StatCard
          label="Total Trainers"
          value={stats.totalTrainers || 0}
          icon={UserPlus}
          color="#f59e0b"
          trend={{ value: `+${stats.newTrainersThisWeek || 0} this week`, up: true }}
        />
        {/*
          Revenue card was previously removed because backend computes
          SUM(price × total_enrolled) — "potential revenue if every
          enrolled student had paid", not real money. Kept the metric
          but labelled it explicitly + made the currency admin-tunable
          via /dashboard/settings so it can be re-denominated without
          a code change once payments are wired up.
        */}
        <StatCard
          label={`Revenue (${currency})`}
          value={formatMoney(stats.totalRevenue, currency)}
          icon={Coins}
          color="#eab308"
          trend={{
            value: `${formatMoney(stats.revenueThisMonth, currency)} this month`,
            up: true,
          }}
        />
      </div>

      {/* ── Second row stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Enrollments"
          value={stats.totalEnrollments || 0}
          icon={ClipboardList}
          color="#22c55e"
          trend={{ value: `+${stats.enrollmentsThisWeek || 0} this week`, up: true }}
        />
        <StatCard label="Total Courses" value={stats.totalCourses || 0} icon={BookOpen} color="#a855f7" />
        <StatCard label="Active Enrollments" value={stats.activeEnrollments || 0} icon={Activity} color="#ef4444" />
        <StatCard label="Messages Today" value={stats.messagesToday || 0} icon={MessageSquare} color="#06b6d4" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Users distribution pie chart */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-6">User Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={userDistribution}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
              >
                {userDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1a1a23',
                  border: '1px solid #2a2a3a',
                  borderRadius: 12,
                  color: '#e4e4e7',
                  fontSize: 13,
                }}
              />
              <Legend
                formatter={(value) => <span style={{ color: '#e4e4e7', fontSize: 13 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Course Status pie chart */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-6">Course Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={courseStatus}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
              >
                {courseStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1a1a23',
                  border: '1px solid #2a2a3a',
                  borderRadius: 12,
                  color: '#e4e4e7',
                  fontSize: 13,
                }}
              />
              <Legend
                formatter={(value) => <span style={{ color: '#e4e4e7', fontSize: 13 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Enrollments Overview — Active vs Completed only (no redundant Total bar). */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-white">Enrollments Overview</h3>
          <p className="text-xs text-muted">
            {stats.totalEnrollments || 0} total · {stats.enrollmentsThisWeek || 0} this week
          </p>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={enrollmentData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(124,206,6,0.05)' }}
              contentStyle={{
                background: '#1a1a23',
                border: '1px solid #2a2a3a',
                borderRadius: 12,
                color: '#e4e4e7',
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {enrollmentData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* This Week's Activity — a real bar chart, one bar per category.
          The old AreaChart drew a smooth fill across three unrelated counts
          which implied a time series the data isn't. */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-base font-bold text-white mb-6">This Week&apos;s Activity</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(124,206,6,0.05)' }}
              contentStyle={{
                background: '#1a1a23',
                border: '1px solid #2a2a3a',
                borderRadius: 12,
                color: '#e4e4e7',
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {weeklyActivity.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Quick stats footer ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.activeUsersToday || 0}</p>
          <p className="text-xs text-muted mt-1">Active Today</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalInteractions || 0}</p>
          <p className="text-xs text-muted mt-1">Total Interactions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalMessages || 0}</p>
          <p className="text-xs text-muted mt-1">Total Messages</p>
        </div>
        {/* "Avg Course Price" was here — dropped because it's payment-system-
            adjacent and reads as a $ metric on a platform that has no payments
            yet. Total Groups is real data we already collect and is more
            meaningful for monitoring matching activity. */}
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalGroups || 0}</p>
          <p className="text-xs text-muted mt-1">Total Groups</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a numeric revenue value using the admin's chosen currency
 * code. Falls back to a plain "0" when the backend hasn't computed
 * anything yet. Uses en-US grouping — locale-aware formatting would
 * need a separate locale setting we don't have.
 */
function formatMoney(value: unknown, currency: string): string {
  const n = typeof value === 'number' ? value : Number(value || 0);
  if (!isFinite(n)) return `0 ${currency}`;
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}
