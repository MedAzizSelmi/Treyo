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
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { logout } from '@/lib/api';
import { useState } from 'react';
import { LANGS, useI18n } from '@/i18n/I18nProvider';

const NAV = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'users', href: '/dashboard/users', icon: Users },
  { key: 'domains', href: '/dashboard/modules', icon: FileText },
  { key: 'skills', href: '/dashboard/skills', icon: Sparkles },
  { key: 'courses', href: '/dashboard/courses', icon: BookOpen },
  { key: 'pendingCourses', href: '/dashboard/pending-courses', icon: Clock },
  { key: 'requests', href: '/dashboard/requests', icon: Mail },
  { key: 'suggestions', href: '/dashboard/suggestions', icon: Lightbulb },
  { key: 'groups', href: '/dashboard/groups', icon: GitBranch },
  { key: 'messages', href: '/dashboard/messages', icon: MessageSquare },
  { key: 'reviews', href: '/dashboard/reviews', icon: Star },
  { key: 'reports', href: '/dashboard/reports', icon: Flag },
  { key: 'notifications', href: '/dashboard/notifications', icon: Bell },
  { key: 'system', href: '/dashboard/system', icon: Activity },
  { key: 'settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { t, lang, setLang } = useI18n();

  return (
    <aside
      className={`fixed top-0 start-0 h-screen flex flex-col border-e border-border bg-card z-50 transition-all duration-300 ${
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
            <p className="text-[10px] text-muted uppercase tracking-widest">{t('nav.adminPanel')}</p>
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
              {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1 border-t border-border pt-4">
        {/* Language: English, French, Arabic (right-to-left) or Spanish. */}
        <div className={`flex gap-1 px-1 pb-2 ${collapsed ? 'flex-col' : ''}`} role="group" aria-label={t('nav.language')}>
          {LANGS.filter((l) => !collapsed || l.code === lang).map((l) => (
            <button
              key={l.code}
              onClick={() => {
                if (collapsed) {
                  const next = LANGS[(LANGS.findIndex((x) => x.code === lang) + 1) % LANGS.length];
                  setLang(next.code);
                } else {
                  setLang(l.code);
                }
              }}
              title={l.label}
              aria-pressed={lang === l.code}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                lang === l.code ? 'bg-accent-dim text-accent' : 'text-muted hover:text-foreground hover:bg-card-hover'
              }`}
            >
              {l.short}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-card-hover transition-all w-full"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
              <span>{t('nav.collapse')}</span>
            </>
          )}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-danger/10 transition-all w-full"
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>
      </div>
    </aside>
  );
}
