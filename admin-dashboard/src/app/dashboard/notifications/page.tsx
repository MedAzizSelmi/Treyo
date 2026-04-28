/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import PageHeader from '@/components/PageHeader';
import { getAllStudents, getAllTrainers, sendAdminNotification, SendNotificationPayload } from '@/lib/api';
import {
  Bell,
  Send,
  Users,
  BookOpen,
  CheckCircle,
  Info,
  User,
  Search,
  ChevronDown,
  X,
  Loader2,
} from 'lucide-react';

type RecipientType = 'ALL' | 'STUDENTS' | 'TRAINERS' | 'SPECIFIC';
type Priority = 'normal' | 'high' | 'urgent';

interface UserOption {
  id: string;
  name: string;
  email: string;
  type: 'STUDENT' | 'TRAINER';
}

export default function NotificationsPage() {
  const [recipientType, setRecipientType] = useState<RecipientType>('ALL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Specific user
  const [userSearch, setUserSearch] = useState('');
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadUsers = useCallback(async () => {
    if (allUsers.length > 0) return; // already loaded
    setUsersLoading(true);
    try {
      const [s, t] = await Promise.all([getAllStudents(), getAllTrainers()]);
      const students: UserOption[] = (s.data || []).map((u: any) => ({
        id: u.studentId,
        name: u.name,
        email: u.email,
        type: 'STUDENT' as const,
      }));
      const trainers: UserOption[] = (t.data || []).map((u: any) => ({
        id: u.trainerId,
        name: u.name,
        email: u.email,
        type: 'TRAINER' as const,
      }));
      setAllUsers([...students, ...trainers]);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, [allUsers.length]);

  useEffect(() => {
    if (recipientType === 'SPECIFIC') loadUsers();
  }, [recipientType, loadUsers]);

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    if (recipientType === 'SPECIFIC' && !selectedUser) {
      setError('Please select a target user.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const payload: SendNotificationPayload = {
        recipientType,
        title: title.trim(),
        message: message.trim(),
        priority,
        ...(recipientType === 'SPECIFIC' && selectedUser
          ? { targetUserId: selectedUser.id, targetUserType: selectedUser.type }
          : {}),
      };
      await sendAdminNotification(payload);
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setTitle('');
        setMessage('');
        setSelectedUser(null);
        setUserSearch('');
      }, 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send notification. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const recipientOptions = [
    { key: 'ALL' as RecipientType, label: 'All Users', icon: Users, desc: 'Everyone' },
    { key: 'STUDENTS' as RecipientType, label: 'Students', icon: BookOpen, desc: 'All students' },
    { key: 'TRAINERS' as RecipientType, label: 'Trainers', icon: Users, desc: 'All trainers' },
    { key: 'SPECIFIC' as RecipientType, label: 'Specific User', icon: User, desc: 'One person' },
  ];

  const priorityOptions = [
    { key: 'normal' as Priority, label: 'Normal', color: 'text-info', bg: 'bg-info/15 border-info/30' },
    { key: 'high' as Priority, label: 'High', color: 'text-warning', bg: 'bg-warning/15 border-warning/30' },
    { key: 'urgent' as Priority, label: 'Urgent', color: 'text-danger', bg: 'bg-danger/15 border-danger/30' },
  ];

  const templates = [
    {
      name: 'Course Approved',
      title: 'Your course has been approved!',
      body: 'Congratulations! Your course has been reviewed and approved. Students can now enroll.',
    },
    {
      name: 'Group Ready',
      title: 'Your group is ready to start!',
      body: 'Great news! The minimum number of students has been reached. Your group is ready to begin.',
    },
    {
      name: 'Enrollment Confirmed',
      title: 'Enrollment confirmed',
      body: 'Your enrollment has been confirmed. You will be assigned to a group shortly.',
    },
    {
      name: 'Platform Update',
      title: 'New platform features available',
      body: 'We have exciting new features on the platform. Log in to check them out!',
    },
  ];

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Send targeted notifications to users or groups" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: compose form ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2">
              <Send className="w-5 h-5 text-accent" />
              Compose Notification
            </h3>

            <div className="space-y-5">
              {/* Recipient type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Recipient</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {recipientOptions.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => {
                        setRecipientType(r.key);
                        setSelectedUser(null);
                        setUserSearch('');
                      }}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-medium transition border ${
                        recipientType === r.key
                          ? 'bg-accent/15 text-accent border-accent/30'
                          : 'text-muted border-border hover:text-foreground hover:border-border/60'
                      }`}
                    >
                      <r.icon className="w-4 h-4" />
                      <span>{r.label}</span>
                      <span className={`text-[10px] ${recipientType === r.key ? 'text-accent/70' : 'text-muted/60'}`}>
                        {r.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific user picker */}
              {recipientType === 'SPECIFIC' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Select User <span className="text-danger">*</span>
                  </label>
                  <div className="relative" ref={dropdownRef}>
                    {/* Selected user display / search trigger */}
                    <button
                      onClick={() => setDropdownOpen((v) => !v)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-background border border-border rounded-xl text-sm transition hover:border-accent/40 focus:outline-none focus:border-accent/50"
                    >
                      {selectedUser ? (
                        <>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            selectedUser.type === 'STUDENT' ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info'
                          }`}>
                            {selectedUser.name[0].toUpperCase()}
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-medium text-white">{selectedUser.name}</p>
                            <p className="text-xs text-muted">{selectedUser.email}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                            selectedUser.type === 'STUDENT' ? 'bg-accent/10 text-accent' : 'bg-info/10 text-info'
                          }`}>
                            {selectedUser.type}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4 text-muted" />
                          <span className="text-muted flex-1 text-left">Choose a user…</span>
                          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </>
                      )}
                    </button>

                    {/* Dropdown */}
                    {dropdownOpen && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                        {/* Search input */}
                        <div className="p-2 border-b border-border">
                          <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg">
                            <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                            <input
                              type="text"
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              placeholder="Search by name or email…"
                              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                              autoFocus
                            />
                            {userSearch && (
                              <button onClick={() => setUserSearch('')} className="text-muted hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* User list */}
                        <div className="max-h-56 overflow-y-auto">
                          {usersLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 text-accent animate-spin" />
                            </div>
                          ) : filteredUsers.length === 0 ? (
                            <p className="text-center text-sm text-muted py-6">No users found</p>
                          ) : (
                            filteredUsers.map((u, idx) => (
                              <button
                                key={`${u.type}-${u.id ?? idx}`}
                                onClick={() => {
                                  setSelectedUser(u);
                                  setDropdownOpen(false);
                                  setUserSearch('');
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition text-left ${
                                  selectedUser?.id === u.id ? 'bg-accent/10' : ''
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                  u.type === 'STUDENT' ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info'
                                }`}>
                                  {u.name[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{u.name}</p>
                                  <p className="text-xs text-muted truncate">{u.email}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0 ${
                                  u.type === 'STUDENT' ? 'bg-accent/10 text-accent' : 'bg-info/10 text-info'
                                }`}>
                                  {u.type}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
                <div className="flex gap-2">
                  {priorityOptions.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setPriority(p.key)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
                        priority === p.key ? `${p.bg} ${p.color}` : 'text-muted border-border hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your notification message…"
                  rows={4}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-sm">
                  <X className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Send / Success */}
              {sent ? (
                <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-success text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Notification sent successfully!
                </div>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!title.trim() || !message.trim() || sending || (recipientType === 'SPECIFIC' && !selectedUser)}
                  className="flex items-center gap-2 px-6 py-3 bg-accent text-black font-bold rounded-xl hover:bg-accent/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="w-4 h-4" /> Send Notification</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: templates + workflow ── */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-warning" />
              Quick Templates
            </h3>
            <div className="space-y-3">
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setTitle(t.title); setMessage(t.body); }}
                  className="w-full text-left bg-background border border-border rounded-xl p-4 hover:border-accent/30 hover:bg-card-hover transition group"
                >
                  <p className="text-sm font-medium text-white group-hover:text-accent transition">{t.name}</p>
                  <p className="text-xs text-muted mt-1 line-clamp-2">{t.body}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-info" />
              Notification Workflow
            </h3>
            <div className="space-y-4">
              <WorkflowStep number={1} title="Student enrolls" desc="Student requests to join a course" />
              <WorkflowStep number={2} title="Admin confirms" desc="Admin reviews and confirms enrollment" />
              <WorkflowStep number={3} title="Min students reached" desc="When minimum is reached, group is formed" />
              <WorkflowStep number={4} title="Group chat created" desc="Group messaging enabled for all members" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-muted mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
