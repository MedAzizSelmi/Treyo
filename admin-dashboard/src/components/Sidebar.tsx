'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Mail,
  FileText,
  Activity,
  MessageSquare,
  Star,
  Clock,
  Settings,
  Flag,
} from 'lucide-react';
import { logout } from '@/lib/api';
import { useState } from 'react';

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Users', href: '/dashboard/users', icon: Users },
  { label: 'Modules', href: '/dashboard/modules', icon: FileText },
  { label: 'Courses', href: '/dashboard/courses', icon: BookOpen },
  { label: 'Pending Courses', href: '/dashboard/pending-courses', icon: Clock },
  { label: 'Requests', href: '/dashboard/requests', icon: Mail },
  { label: 'Groups', href: '/dashboard/groups', icon: GitBranch },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Reviews', href: '/dashboard/reviews', icon: Star },
  { label: 'Reports', href: '/dashboard/reports', icon: Flag },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'System Health', href: '/dashboard/system', icon: Activity },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`fixed top-0 left-0 h-screen flex flex-col border-r border-border bg-card z-50 transition-all duration-300 ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-border">
          <Image
            src="/logo.png"
            alt="Treyo"
            width={48}
            height={48}
            className="w-11 h-11 object-contain"
            priority
          />
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-white tracking-tight">Treyo</h1>
            <p className="text-[10px] text-muted uppercase tracking-widest">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-accent-dim text-accent'
                  : 'text-muted hover:text-foreground hover:bg-card-hover'
              }`}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 ${
                  active ? 'text-accent' : 'text-muted group-hover:text-foreground'
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1 border-t border-border pt-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-card-hover transition-all w-full"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-danger/10 transition-all w-full"
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
