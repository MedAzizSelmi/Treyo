import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// BACKEND URL — single source of truth, used everywhere
export const API_BASE_URL = 'http://192.168.0.188:8085';
const API_URL = `${API_BASE_URL}/api`;

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to every axios request
api.interceptors.request.use(
    async (config) => {
        const token = await SecureStore.getItemAsync('jwt_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

/**
 * Use this instead of api.post() whenever you need to send FormData
 * (file uploads, multipart). Axios 1.x breaks multipart boundaries in
 * React Native — native fetch handles it correctly.
 */
export async function fetchUpload(path: string, formData: FormData): Promise<any> {
    const token = await SecureStore.getItemAsync('jwt_token');
    const res = await fetch(`${API_URL}${path}`, {
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

// ══════════════════════════════════════════════
// Auth Services
// ══════════════════════════════════════════════
export const authService = {
    login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            await SecureStore.setItemAsync('jwt_token', response.data.token);
            const userData = {
                userId: response.data.userId,
                email: response.data.email,
                name: response.data.name,
                role: response.data.role,
                onboardingComplete: response.data.onboardingComplete,
            };
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }
        return response.data;
    },

    register: async (data: { name: string; email: string; password: string; userType: string }) => {
        const endpoint = data.userType === 'STUDENT' ? '/auth/register/student' : '/auth/register/trainer';
        const response = await api.post(endpoint, { name: data.name, email: data.email, password: data.password });
        if (response.data.token) {
            await SecureStore.setItemAsync('jwt_token', response.data.token);
            const userData = {
                userId: response.data.userId,
                email: response.data.email,
                name: response.data.name,
                role: response.data.role,
                userType: data.userType,
                onboardingComplete: response.data.onboardingComplete || false,
            };
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }
        return response.data;
    },

    logout: async () => {
        await SecureStore.deleteItemAsync('jwt_token');
        await SecureStore.deleteItemAsync('user_data');
    },

    getCurrentUser: async () => {
        const userData = await SecureStore.getItemAsync('user_data');
        return userData ? JSON.parse(userData) : null;
    },

    isLoggedIn: async () => {
        const token = await SecureStore.getItemAsync('jwt_token');
        return !!token;
    },
};

// ══════════════════════════════════════════════
// Course Services
// ══════════════════════════════════════════════
export const courseService = {
    /** AI-powered recommendations for the logged-in student.
     *  Backend returns { studentId, recommendations: [...], totalRecommended, generatedAt },
     *  so we unwrap the nested array and normalize a few field aliases the UI uses. */
    getRecommendations: async (studentId: string, count = 10) => {
        const response = await api.get(`/recommendations/student/${studentId}`, { params: { count } });
        const data = response.data;
        let list: any[] = [];
        if (Array.isArray(data)) list = data;
        else if (data && Array.isArray(data.recommendations)) list = data.recommendations;
        return list.map((c: any) => ({
            ...c,
            // UI uses `averageRating` while backend DTO ships `rating`
            averageRating: c.averageRating ?? (c.rating != null ? Number(c.rating) : null),
        }));
    },

    /** All published courses */
    getAllCourses: async () => {
        const response = await api.get('/courses');
        return response.data;
    },

    /** Single course by ID */
    getCourseById: async (courseId: string) => {
        const response = await api.get(`/courses/${courseId}`);
        return response.data;
    },

    /** Courses created by a trainer */
    getTrainerCourses: async (trainerId: string) => {
        const response = await api.get(`/courses/trainer/${trainerId}`);
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Enrollment Services
// ══════════════════════════════════════════════
export const enrollmentService = {
    /** Get all enrollments for a student */
    getStudentEnrollments: async (studentId: string) => {
        const response = await api.get(`/enrollments/student/${studentId}`);
        return response.data;
    },

    /** Get active enrollments only */
    getActiveEnrollments: async (studentId: string) => {
        const response = await api.get(`/enrollments/student/${studentId}/active`);
        return response.data;
    },

    /** Student confirms enrollment (express interest) */
    confirmEnrollment: async (studentId: string, courseId: string, groupId?: string) => {
        const response = await api.post('/enrollments/confirm', null, {
            params: { studentId, courseId, ...(groupId ? { groupId } : {}) },
        });
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Interaction Services
// ══════════════════════════════════════════════
export const interactionService = {
    /** Mark student as interested in a course */
    expressInterest: async (studentId: string, courseId: string) => {
        const response = await api.post('/interactions/interested', null, { params: { studentId, courseId } });
        return response.data;
    },

    /** Track course view */
    trackView: async (studentId: string, courseId: string) => {
        const response = await api.post('/interactions/view', null, { params: { studentId, courseId } });
        return response.data;
    },

    /** Get interested count for a course */
    getInterestedCount: async (courseId: string) => {
        const response = await api.get(`/interactions/course/${courseId}/interested-count`);
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Message Services
// ══════════════════════════════════════════════
export const messageService = {
    /** Get all conversations for a user */
    getConversations: async (userId: string) => {
        const response = await api.get(`/messages/conversations/${userId}`);
        return response.data;
    },

    /** Get messages in a conversation */
    getConversation: async (userId1: string, userId2: string, limit = 50) => {
        const response = await api.get('/messages/conversation', { params: { userId1, userId2, limit } });
        return response.data;
    },

    /** Send a message */
    sendMessage: async (senderId: string, receiverId: string, content: string) => {
        const response = await api.post('/messages/send', { senderId, receiverId, content, messageType: 'text' });
        return response.data;
    },

    /** Get unread count */
    getUnreadCount: async (userId: string) => {
        const response = await api.get(`/messages/unread/${userId}`);
        return response.data;
    },

    /** Mark conversation as read */
    markConversationRead: async (conversationId: string, userId: string) => {
        await api.put('/messages/conversation/read', null, { params: { conversationId, userId } });
    },
};

// ══════════════════════════════════════════════
// Notification Services
// ══════════════════════════════════════════════
export const notificationService = {
    /** Get all notifications for user */
    getNotifications: async (userId: string) => {
        const response = await api.get(`/notifications/user/${userId}`);
        return response.data;
    },

    /** Get unread notifications */
    getUnreadNotifications: async (userId: string) => {
        const response = await api.get(`/notifications/user/${userId}/unread`);
        return response.data;
    },

    /** Get unread count */
    getUnreadCount: async (userId: string) => {
        const response = await api.get(`/notifications/user/${userId}/unread/count`);
        return response.data;
    },

    /** Mark notification as read */
    markAsRead: async (notificationId: string) => {
        await api.put(`/notifications/${notificationId}/read`);
    },
};

// ══════════════════════════════════════════════
// Trainer Services
// ══════════════════════════════════════════════
export const trainerService = {
    /** Get all active trainers */
    getAllTrainers: async () => {
        const response = await api.get('/trainers');
        return response.data;
    },

    /** Create a course */
    createCourse: async (trainerId: string, courseData: any) => {
        const response = await api.post('/courses', courseData, { params: { trainerId } });
        return response.data;
    },

    /** Publish a course */
    publishCourse: async (courseId: string, trainerId: string) => {
        const response = await api.post(`/courses/${courseId}/publish`, null, { params: { trainerId } });
        return response.data;
    },
};

export default api;
