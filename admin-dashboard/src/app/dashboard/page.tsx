'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  UserPlus,
  Activity,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getDashboardStats } from '@/lib/api';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getDashboardStats();
        setStats(res.data);
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

  const enrollmentData = [
    { name: 'Active', value: stats.activeEnrollments || 0 },
    { name: 'Completed', value: stats.completedEnrollments || 0 },
    { name: 'Total', value: stats.totalEnrollments || 0 },
  ];

  const weeklyActivity = [
    { day: 'New Users', value: stats.newUsersThisWeek || 0 },
    { day: 'New Enrollments', value: stats.enrollmentsThisWeek || 0 },
    { day: 'New Courses', value: stats.coursesCreatedThisWeek || 0 },
  ];

  const courseStatus = [
    { name: 'Published', value: stats.publishedCourses || 0, color: '#22c55e' },
    { name: 'Pending', value: stats.pendingCourses || 0, color: '#f59e0b' },
    { name: 'Draft', value: (stats.totalCourses || 0) - (stats.publishedCourses || 0) - (stats.pendingCourses || 0), color: '#71717a' },
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
        <StatCard
          label="Total Revenue"
          value={`$${((stats.totalRevenue || 0) / 1000).toFixed(1)}k`}
          icon={DollarSign}
          color="#22c55e"
          trend={{ value: `$${((stats.revenueThisMonth || 0) / 1000).toFixed(1)}k this month`, up: true }}
        />
      </div>

      {/* ── Second row stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Courses" value={stats.totalCourses || 0} icon={BookOpen} color="#a855f7" />
        <StatCard label="Active Enrollments" value={stats.activeEnrollments || 0} icon={Activity} color="#ef4444" />
        <StatCard label="Messages Today" value={stats.messagesToday || 0} icon={MessageSquare} color="#06b6d4" />
        <StatCard label="Active Groups" value={stats.activeGroups || 0} icon={BarChart3} color="#f97316" />
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

      {/* Enrollments bar chart */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-8">
        <h3 className="text-base font-bold text-white mb-6">Enrollments Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={enrollmentData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
            <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: '#1a1a23',
                border: '1px solid #2a2a3a',
                borderRadius: 12,
                color: '#e4e4e7',
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" fill="#7cce06" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly activity */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-base font-bold text-white mb-6">This Week&apos;s Activity</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={weeklyActivity}>
            <defs>
              <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7cce06" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#7cce06" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
            <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: '#1a1a23',
                border: '1px solid #2a2a3a',
                borderRadius: 12,
                color: '#e4e4e7',
                fontSize: 13,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#7cce06"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorVal)"
            />
          </AreaChart>
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
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">${(stats.averageCoursePrice || 0).toFixed(0)}</p>
          <p className="text-xs text-muted mt-1">Avg Course Price</p>
        </div>
      </div>
    </div>
  );
}
