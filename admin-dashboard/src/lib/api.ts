import axios from 'axios';

// Backend root (no /api suffix) — exported so screens that need to
// resolve relative file URLs like "/files/profile-pictures/abc.jpg"
// can prefix them properly.
export const API_BASE_URL = 'http://localhost:8085';
const API_URL = `${API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──
export async function loginAdmin(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  const data = res.data;
  if (data.role !== 'ADMIN') {
    throw new Error('Access denied. Admin credentials required.');
  }
  localStorage.setItem('admin_token', data.token);
  localStorage.setItem('admin_user', JSON.stringify(data));
  return data;
}

export function getAdminUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('admin_user');
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  window.location.href = '/login';
}

export function isAuthenticated() {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('admin_token');
}

// ── Dashboard ──
export const getDashboardStats = () => api.get('/admin/dashboard/stats');

// ── Users ──
export const getAllUsers = () => api.get('/admin/users');
export const getAllStudents = () => api.get('/admin/users/students');
export const getAllTrainers = () => api.get('/admin/users/trainers');
export const getPendingTrainers = () => api.get('/admin/users/trainers/pending');
export const toggleUserStatus = (userId: string, userType: string) =>
  api.put(`/admin/users/${userId}/toggle-status`, null, { params: { userType } });
export const approveTrainer = (trainerId: string) =>
  api.put(`/admin/users/trainers/${trainerId}/approve`);
/** Reject a trainer's onboarding application. Optional `note` is
 *  emailed verbatim to the trainer so they know why. */
export const rejectTrainer = (trainerId: string, note?: string) =>
  api.put(`/admin/users/trainers/${trainerId}/reject`, note ? { note } : {});

// ── Courses ──
export const getAllCourses = () => api.get('/admin/courses');
export const getPendingCourses = () => api.get('/admin/courses/pending');
export const approveCourse = (courseId: string) =>
  api.put(`/admin/courses/${courseId}/approve`);
export const rejectCourse = (courseId: string) =>
  api.put(`/admin/courses/${courseId}/reject`);
export const deleteCourse = (courseId: string) =>
  api.delete(`/admin/courses/${courseId}`);
export const updateCourseMinStudents = (courseId: string, minStudents: number) =>
  api.put(`/admin/courses/${courseId}/min-students`, null, {
    params: { minStudents },
  });
export const updateTrainerDailyRevenue = (courseId: string, amount: number | null) =>
  api.put(`/admin/courses/${courseId}/trainer-daily-revenue`, { amount });

// ── Course Templates ──
// Retired in v2: admin no longer creates courses or assigns them to
// trainers. Trainers create their own courses under admin-managed
// modules and submit them for review (see modules + pending-courses
// pages). The backend template endpoints still exist but are dormant.

// ── Course interest / group formation workflow ──
export const getRequestedCourses = () => api.get('/admin/requests');
export const cleanupStaleRequests = () => api.post('/admin/requests/cleanup');
export const getAllGroups = () => api.get('/admin/groups');
export const getCourseInterest = (courseId: string) =>
  api.get(`/admin/courses/${courseId}/interest`);
export const notifyInterestedStudents = (courseId: string) =>
  api.post(`/admin/courses/${courseId}/notify-interested`);
export const formCourseGroup = (courseId: string) =>
  api.post(`/admin/courses/${courseId}/form-group`);

// ── Promote to Admin ──
export const promoteToAdmin = (userId: string, userType: string) =>
  api.post(`/admin/users/${userId}/promote-to-admin`, null, { params: { userType } });

// ── Notifications ──
export const getNotifications = (userId: string) =>
  api.get(`/notifications/user/${userId}`);
export const getUnreadCount = (userId: string) =>
  api.get(`/notifications/user/${userId}/unread/count`);

// ── System Health ──
// The dashboard polls these every few seconds to render live cards and
// rolling sparklines. They go through the JWT-protected Spring proxy so
// the ML service isn't exposed to the public internet.
export const getMlHealth = () => api.get('/admin/system/ml-health');
export const getBackendHealth = () => api.get('/admin/system/backend-health');

// ── Modules (v2 course category system) ──
export const listAdminModules = () => api.get('/admin/modules');
export const createModule = (payload: {
  name: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  sortOrder?: number;
}) => api.post('/admin/modules', payload);
export const updateModule = (moduleId: string, payload: any) =>
  api.put(`/admin/modules/${moduleId}`, payload);
export const archiveModule = (moduleId: string) =>
  api.delete(`/admin/modules/${moduleId}`);

// ── Trainer-submitted courses awaiting admin review ──
export const listPendingTrainerCourses = () => api.get('/admin/courses/pending-trainer');
export const approveTrainerCourse = (
  courseId: string,
  price: number,
  currency: string,
) => api.put(`/admin/courses/${courseId}/approve-trainer`, { price, currency });
export const rejectTrainerCourse = (courseId: string, note?: string) =>
  api.put(`/admin/courses/${courseId}/reject-trainer`, note ? { note } : {});

// ── Account (the signed-in admin's own credentials) ──
// Hits the shared /account/change-password endpoint; the backend picks
// the right table from the JWT's role, so this always targets the admin
// record even when the same email also exists as a student/trainer.
export const changeAdminPassword = (currentPassword: string, newPassword: string) =>
  api.post('/account/change-password', { currentPassword, newPassword });

// ── Trainer reports (student-raised, admin-moderated) ──
export const listTrainerReports = (status?: string) =>
  api.get('/admin/reports', { params: status && status !== 'ALL' ? { status } : {} });
export const getOpenReportCount = () =>
  api.get<{ openCount: number }>('/admin/reports/open-count');
export const updateReportStatus = (
  reportId: string,
  status: 'OPEN' | 'REVIEWED' | 'DISMISSED',
  adminNote?: string,
) => api.put(`/admin/reports/${reportId}/status`, { status, adminNote });

// ── System settings (admin-tunable globals) ──
// Currently just the revenue display currency. Read is public so
// screens that display prices anywhere can pick up the code without
// admin auth.
export const getRevenueCurrency = () =>
  api.get<{ currency: string }>('/settings/revenue-currency');
export const setRevenueCurrency = (currency: string) =>
  api.put<{ currency: string }>('/admin/settings/revenue-currency', { currency });

// ── Reviews moderation ──
// Reviews are submitted by students at the end of a course. The
// underlying ratings always count toward the course / trainer
// averages — hiding a row just removes it from public display.
export const getAllReviews = () => api.get('/reviews/admin/all');
export const setReviewVisibility = (reviewId: string, hidden: boolean) =>
  api.put(`/reviews/admin/${reviewId}/visibility`, { hidden });

// ── Messages (group chat) ──
// Admins are full members of every group chat — they see them all and
// can post into any of them. These three calls back the Messages page.
export const getAdminConversations = (adminUserId: string) =>
  api.get(`/messages/conversations/${adminUserId}`);
export const getGroupMessages = (groupId: string, viewerId: string) =>
  api.get(`/messages/group/${groupId}`, { params: { viewerId } });
export const sendGroupMessage = (
  groupId: string,
  senderId: string,
  content: string,
  opts?: { attachmentUrl?: string; messageType?: 'text' | 'image' | 'file' },
) =>
  api.post(`/messages/group/${groupId}`, {
    senderId,
    content,
    messageType: opts?.messageType || 'text',
    ...(opts?.attachmentUrl ? { attachmentUrl: opts.attachmentUrl } : {}),
  });

/**
 * Upload an image picked from <input type="file"> to the backend's
 * message-attachment endpoint. Returns the URL the chat should reference
 * in `attachmentUrl`. messageId is just a unique key the storage uses to
 * filename the upload — doesn't need to match the actual Message.id.
 *
 * Axios is bypassed because it muddles multipart boundaries in some setups;
 * the JWT is read off localStorage directly and attached to the fetch call.
 */
export async function uploadMessageAttachment(file: File): Promise<{ fileUrl: string }> {
  const messageId = `MSG_${Date.now().toString(36).toUpperCase()}`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('messageId', messageId);

  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
  const res = await fetch(`${API_BASE_URL}/api/files/upload/message-attachment`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface SendNotificationPayload {
  recipientType: 'ALL' | 'STUDENTS' | 'TRAINERS' | 'SPECIFIC';
  targetUserId?: string;
  targetUserType?: string;
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
}
export const sendAdminNotification = (payload: SendNotificationPayload) =>
  api.post('/admin/notifications/send', payload);

export default api;
