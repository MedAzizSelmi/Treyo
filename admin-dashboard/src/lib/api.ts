import axios from 'axios';

const API_URL = 'http://localhost:8085/api';

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
export const rejectTrainer = (trainerId: string) =>
  api.put(`/admin/users/trainers/${trainerId}/reject`);

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

// ── Promote to Admin ──
export const promoteToAdmin = (userId: string, userType: string) =>
  api.post(`/admin/users/${userId}/promote-to-admin`, null, { params: { userType } });

// ── Notifications ──
export const getNotifications = (userId: string) =>
  api.get(`/notifications/user/${userId}`);
export const getUnreadCount = (userId: string) =>
  api.get(`/notifications/user/${userId}/unread/count`);

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
