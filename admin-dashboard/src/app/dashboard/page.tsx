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
import { useI18n } from '@/i18n/I18nProvider';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<string>('TND');
  const { t, locale } = useI18n();

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
  if (!stats) return <p className="text-danger p-8">{t('home.loadFailed')}</p>;

  // Chart data (derived from stats)
  const userDistribution = [
    { name: t('home.students'), value: stats.totalStudents || 0, color: '#7cce06' },
    { name: t('home.trainers'), value: stats.totalTrainers || 0, color: '#3b82f6' },
  ];

  // Two separate enrollment buckets — dropped the "Total" bar because it's
  // just Active + Completed by definition, so it always rendered as the
  // tallest bar and made the chart visually misleading. The "total" number
  // is already shown in the Active Enrollments StatCard above.
  const enrollmentData = [
    { name: t('home.active'), value: stats.activeEnrollments || 0, color: '#7cce06' },
    { name: t('home.completed'), value: stats.completedEnrollments || 0, color: '#3b82f6' },
  ];

  // This Week's Activity — three categorical counts. Previously rendered as
  // an AreaChart, which implies a time series the data isn't (the smooth
  // fill between unrelated categories was meaningless). Now a clean grouped
  // bar with one colour per category so each value reads independently.
  const weeklyActivity = [
    { name: t('home.newUsers'), value: stats.newUsersThisWeek || 0, color: '#7cce06' },
    { name: t('home.newEnrollments'), value: stats.enrollmentsThisWeek || 0, color: '#3b82f6' },
    { name: t('home.newCourses'), value: stats.coursesCreatedThisWeek || 0, color: '#a855f7' },
  ];

  // Drafts and pending approval were removed — every course is created live
  // when admin assigns a template. Pie chart now just shows live vs deleted.
  const courseStatus = [
    { name: t('home.live'), value: stats.publishedCourses || 0, color: '#22c55e' },
    {
      name: t('home.deleted'),
      value: Math.max(0, (stats.totalCourses || 0) - (stats.publishedCourses || 0)),
      color: '#71717a',
    },
  ].filter(item => item.value > 0);

  return (
    <div>
      <PageHeader
        title={t('home.title')}
        subtitle={t('home.subtitle')}
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t('home.totalUsers')}
          value={stats.totalUsers || 0}
          icon={Users}
          color="#7cce06"
          trend={{ value: t('home.plusThisWeek', { count: stats.newUsersThisWeek || 0 }), up: true }}
        />
        <StatCard
          label={t('home.totalStudents')}
          value={stats.totalStudents || 0}
          icon={GraduationCap}
          color="#3b82f6"
          trend={{ value: t('home.plusThisWeek', { count: stats.newStudentsThisWeek || 0 }), up: true }}
        />
        <StatCard
          label={t('home.totalTrainers')}
          value={stats.totalTrainers || 0}
          icon={UserPlus}
          color="#f59e0b"
          trend={{ value: t('home.plusThisWeek', { count: stats.newTrainersThisWeek || 0 }), up: true }}
        />
        {/*
          Real money now that ClicToPay is wired up: the backend sums
          amount_paid over enrollments whose payment it verified with the
          gateway, so this is what was actually collected — not the old
          SUM(price × total_enrolled), which measured "what everyone would
          owe if they all paid" and read zero regardless, since
          total_enrolled is never maintained. Currency stays admin-tunable
          via /dashboard/settings.
        */}
        <StatCard
          label={t('home.revenue', { currency })}
          value={formatMoney(stats.totalRevenue, currency, locale)}
          icon={Coins}
          color="#eab308"
          trend={{
            value: t('home.thisMonth', { amount: formatMoney(stats.revenueThisMonth, currency, locale) }),
            up: true,
          }}
        />
      </div>

      {/* ── Second row stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t('home.totalEnrollments')}
          value={stats.totalEnrollments || 0}
          icon={ClipboardList}
          color="#22c55e"
          trend={{ value: t('home.plusThisWeek', { count: stats.enrollmentsThisWeek || 0 }), up: true }}
        />
        <StatCard label={t('home.totalCourses')} value={stats.totalCourses || 0} icon={BookOpen} color="#a855f7" />
        <StatCard label={t('home.activeEnrollments')} value={stats.activeEnrollments || 0} icon={Activity} color="#ef4444" />
        <StatCard label={t('home.messagesToday')} value={stats.messagesToday || 0} icon={MessageSquare} color="#06b6d4" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Users distribution pie chart */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-base font-bold text-white mb-6">{t('home.userDistribution')}</h3>
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
          <h3 className="text-base font-bold text-white mb-6">{t('home.courseStatus')}</h3>
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
          <h3 className="text-base font-bold text-white">{t('home.enrollmentsOverview')}</h3>
          <p className="text-xs text-muted">
            {t('home.totalAndWeek', { total: stats.totalEnrollments || 0, week: stats.enrollmentsThisWeek || 0 })}
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
        <h3 className="text-base font-bold text-white mb-6">{t('home.weekActivity')}</h3>
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
          <p className="text-xs text-muted mt-1">{t('home.activeToday')}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalInteractions || 0}</p>
          <p className="text-xs text-muted mt-1">{t('home.totalInteractions')}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalMessages || 0}</p>
          <p className="text-xs text-muted mt-1">{t('home.totalMessages')}</p>
        </div>
        {/* "Avg Course Price" was here — dropped because it's payment-system-
            adjacent and reads as a $ metric on a platform that has no payments
            yet. Total Groups is real data we already collect and is more
            meaningful for monitoring matching activity. */}
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.totalGroups || 0}</p>
          <p className="text-xs text-muted mt-1">{t('home.totalGroups')}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a numeric revenue value using the admin's chosen currency
 * code, grouped the way the dashboard's language writes numbers. Falls
 * back to a plain "0" when the backend hasn't computed anything yet.
 */
function formatMoney(value: unknown, currency: string, locale: string): string {
  const n = typeof value === 'number' ? value : Number(value || 0);
  if (!isFinite(n)) return `0 ${currency}`;
  const formatted = n.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}
