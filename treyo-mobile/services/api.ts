import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// ─────────────────────────────────────────────────────────────────
// Backend URL — auto-picked based on how Expo was launched.
//
//   LAN mode    (npm run lan)    →  http://<your-wifi-ip>:8085
//   USB mode    (npm run usb)    →  http://localhost:8085   (via adb reverse)
//   Tunnel mode (npm run tunnel) →  fall back to manual override below
//
// The detection works by reading the host that Metro told Expo Go to use.
// If that's `localhost`/`127.0.0.1`, we're in USB mode.
// ─────────────────────────────────────────────────────────────────
const BACKEND_PORT = 8085;
const MANUAL_OVERRIDE = 'http://192.168.0.188:8085';

function resolveApiBase(): string {
    // hostUri looks like "192.168.100.68:8081" or "localhost:8081"
    const hostUri =
        (Constants.expoConfig as any)?.hostUri ||
        (Constants as any).manifest2?.extra?.expoGo?.developer?.tool ||
        (Constants as any).manifest?.debuggerHost ||
        '';
    const host = String(hostUri).split(':')[0];

    if (!host) return MANUAL_OVERRIDE;
    if (host === 'localhost' || host === '127.0.0.1') {
        return `http://localhost:${BACKEND_PORT}`;
    }
    return `http://${host}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBase();
const API_URL = `${API_BASE_URL}/api`;
console.log('[api] base URL =', API_BASE_URL);

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

// ── Auth expiry handling ──
// If the backend tells us the JWT is invalid/expired, wipe the stored
// session so the next app open lands on the welcome screen instead of
// silently retrying with a dead token. Endpoints listed in
// AUTH_FAILURE_SAFE_PATHS skip this — those legitimately 401 (e.g. login
// with wrong password) and we don't want to nuke an unrelated session.
const AUTH_FAILURE_SAFE_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        const url = String(error?.config?.url || '');
        const isSafe = AUTH_FAILURE_SAFE_PATHS.some(p => url.includes(p));
        if (status === 401 && !isSafe) {
            try {
                await SecureStore.deleteItemAsync('jwt_token');
                await SecureStore.deleteItemAsync('user_data');
            } catch (_) {}
        }
        return Promise.reject(error);
    }
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
        // Drop the push token first so the next account on this device
        // doesn't keep getting the previous user's notifications. Lazy
        // import avoids a circular dep with services/push.ts.
        try {
            const { unregisterCurrentDevice } = await import('./push');
            await unregisterCurrentDevice();
        } catch (_) {}
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

    /** Change password for the currently logged-in user. Backend verifies the current password. */
    changePassword: async (currentPassword: string, newPassword: string) => {
        const response = await api.post('/account/change-password', { currentPassword, newPassword });
        return response.data;
    },

    /** Trigger a password-reset email. Backend responds 200 even for
     *  unknown emails so the endpoint can't be used to enumerate
     *  accounts — the UI should show the same "if an account exists,
     *  check your inbox" message regardless. */
    forgotPassword: async (email: string) => {
        const response = await api.post('/auth/forgot-password', { email });
        return response.data;
    },

    /** Complete a password reset using the token from the email. */
    resetPassword: async (token: string, newPassword: string) => {
        const response = await api.post('/auth/reset-password', { token, newPassword });
        return response.data;
    },

    /** Verify an email using the token from the verification email. */
    verifyEmail: async (token: string) => {
        const response = await api.post('/auth/verify-email', { token });
        return response.data;
    },

    /** Resend the verification email. Same silent-on-unknown behaviour
     *  as forgotPassword — UI must not differentiate. */
    resendVerification: async (email: string) => {
        const response = await api.post('/auth/resend-verification', { email });
        return response.data;
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

    /** Update student professional profile (skills, education, experience, links) */
    updateStudentProfile: async (data: {
        professionalExperience?: string;
        keySkills?: string[];
        educationLevel?: string;
        trainingDomain?: string;
        linkedinUrl?: string | null;
        portfolioUrl?: string | null;
        cvUrl?: string | null;
    }) => {
        const response = await api.put('/students/me/profile', data);
        return response.data;
    },

    /** Get all enrollments for a course (trainer view) */
    getCourseEnrollments: async (courseId: string) => {
        const response = await api.get(`/enrollments/course/${courseId}`);
        return response.data;
    },

    /** Student confirms enrollment.
     *
     *  For paid courses, this MUST be called with `paymentRef` set to a
     *  Konnect payment reference that has reached the "completed" state
     *  (returned by paymentService.createEnrollmentPayment + the user
     *  finishing the Konnect-hosted payment page). The backend re-fetches
     *  the payment from Konnect's API and verifies status before writing
     *  the enrollment row — the server never trusts a confirm call that
     *  claims to be paid without a verified reference.
     *
     *  For free courses (price = 0) the paymentRef can be omitted. */
    confirmEnrollment: async (
        studentId: string,
        courseId: string,
        groupId?: string,
        paymentRef?: string,
    ) => {
        const response = await api.post('/enrollments/confirm', null, {
            params: {
                studentId,
                courseId,
                ...(groupId ? { groupId } : {}),
                ...(paymentRef ? { paymentRef } : {}),
            },
        });
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Payment Services (Konnect)
// ══════════════════════════════════════════════
export const paymentService = {
    /**
     * Create a Konnect payment for an enrollment. Returns the hosted
     * payment URL the app should open (via expo-web-browser) so the user
     * can complete payment on Konnect's page, plus the paymentRef we'll
     * pass back to confirmEnrollment afterwards to verify success.
     *
     * Response shape:
     *  - `payUrl`:     Konnect-hosted payment page URL (null for free courses)
     *  - `paymentRef`: opaque ID; pass to confirmEnrollment after success
     *  - `amount`:     amount in millimes (1 TND = 1000)
     *  - `currency`:   always "TND" — Konnect doesn't accept anything else
     *  - `free`:       true → skip the redirect, go straight to confirm
     */
    createEnrollmentPayment: async (
        studentId: string,
        courseId: string,
        groupId?: string,
    ): Promise<{
        payUrl: string | null;
        paymentRef: string | null;
        amount: number;
        currency: string;
        free: boolean;
    }> => {
        const response = await api.post('/payments/enrollment-payment', null, {
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

    /** Toggle a course in the student's favourites. Returns the new state
     *  as a boolean so the caller can update the heart icon immediately
     *  without a follow-up status check. Safe to call repeatedly. */
    toggleSaveCourse: async (studentId: string, courseId: string): Promise<boolean> => {
        const response = await api.post('/interactions/saved', null, { params: { studentId, courseId } });
        return Boolean(response.data?.saved);
    },

    /** Lightweight check used by course-detail on mount to render the
     *  heart icon in its correct (filled / outlined) initial state. */
    isCourseSaved: async (studentId: string, courseId: string): Promise<boolean> => {
        const response = await api.get('/interactions/saved/status', { params: { studentId, courseId } });
        return Boolean(response.data?.saved);
    },

    /** Returns the student's favourite courses as full course objects so
     *  the /favorites screen can render cards directly. Server-side join,
     *  no N+1 fetching on the client. */
    getSavedCourses: async (studentId: string) => {
        const response = await api.get(`/interactions/saved/student/${studentId}`);
        return Array.isArray(response.data) ? response.data : [];
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

    /** Cancel a previously expressed interest */
    cancelInterest: async (studentId: string, courseId: string) => {
        await api.delete('/interactions/interested', { params: { studentId, courseId } });
    },

    /** Returns { interested: bool, enrolled: bool } for a student/course pair */
    getStatus: async (studentId: string, courseId: string): Promise<{ interested: boolean; enrolled: boolean }> => {
        const response = await api.get('/interactions/status', { params: { studentId, courseId } });
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

    // ── Group chat ──
    // Groups appear in getConversations alongside DMs (look for
    // isGroup === true). The two helpers below back the dedicated group
    // chat screen.

    /** List every message in a group chat (oldest → newest).
     *  `viewerId` is required server-side for the membership check. */
    getGroupMessages: async (groupId: string, viewerId: string) => {
        const response = await api.get(`/messages/group/${groupId}`, { params: { viewerId } });
        return response.data;
    },

    /** Post a message into a group chat. Membership is enforced on the
     *  backend; non-members get a 4xx response.
     *
     *  For image messages: pass `attachmentUrl` (already uploaded via
     *  `fetchUpload('/files/upload/message-attachment', …)`) and either
     *  leave `content` empty or use it as a caption. The backend treats
     *  either text OR an attachment as sufficient content. */
    sendGroupMessage: async (
        groupId: string,
        senderId: string,
        content: string,
        opts?: { attachmentUrl?: string; messageType?: 'text' | 'image' | 'file' },
    ) => {
        const response = await api.post(`/messages/group/${groupId}`, {
            senderId,
            content,
            messageType: opts?.messageType || 'text',
            ...(opts?.attachmentUrl ? { attachmentUrl: opts.attachmentUrl } : {}),
        });
        return response.data;
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
// Group / Session Services
// ══════════════════════════════════════════════
export const groupService = {
    /** Get all groups for a course */
    getCourseGroups: async (courseId: string) => {
        const response = await api.get(`/groups/course/${courseId}`);
        return response.data;
    },

    /** Upcoming sessions for a trainer — forming/ready/active groups starting now or later */
    getUpcomingSessions: async (trainerId: string) => {
        const response = await api.get(`/groups/trainer/${trainerId}/upcoming`);
        return response.data;
    },

    /** Single group + its course info (title, durationHours, saved
     *  schedule). Backs the trainer's session-scheduling screen. */
    getGroup: async (groupId: string) => {
        const response = await api.get(`/groups/${groupId}`);
        return response.data;
    },

    /** Persist the trainer's session schedule for a group.
     *  Each session carries its own duration (hours), so a schedule can
     *  mix e.g. a 2h session and a 1h session.
     *  payload: { sessions: [{date, time, hours}] } */
    saveGroupSchedule: async (
        groupId: string,
        payload: { sessions: { date: string; time: string; hours: number }[] },
    ) => {
        const response = await api.put(`/groups/${groupId}/schedule`, payload);
        return response.data;
    },

    /** Session-completion progress for a single group. Returns:
     *    { sessionsCompleted, totalSessions, percentage,
     *      groupStatus, isCompleted } */
    getProgress: async (groupId: string) => {
        const response = await api.get(`/groups/${groupId}/progress`);
        return response.data as {
            sessionsCompleted: number;
            totalSessions: number;
            percentage: number;
            groupStatus: string;
            isCompleted: boolean;
        };
    },

    /** Flat list of every upcoming session across all the student's
     *  enrolled groups. Each entry has courseId/courseTitle, groupId/
     *  groupName, date, time, hours, datetime, and meeting info.
     *  Powers My Schedule, home Upcoming strip, and course-detail
     *  schedule section (filter by courseId on the client). */
    getStudentSessions: async (studentId: string) => {
        const response = await api.get(`/groups/student/${studentId}/sessions`);
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Module + trainer-submitted course flow (v2)
// ══════════════════════════════════════════════
export const moduleService = {
    /** Public list of active modules for the trainer's create-course picker. */
    listActive: async () => {
        const response = await api.get('/modules');
        return response.data as any[];
    },
};

export const trainerCourseService = {
    /** Trainer submits a new course. Starts as PENDING until admin reviews. */
    create: async (trainerId: string, payload: any) => {
        const response = await api.post('/courses', payload, { params: { trainerId } });
        return response.data;
    },
    /** Trainer edits their own course. Only works while status is
     *  PENDING or REJECTED — backend refuses APPROVED. */
    update: async (courseId: string, trainerId: string, payload: any) => {
        const response = await api.put(`/courses/${courseId}`, payload, { params: { trainerId } });
        return response.data;
    },
    /** Upload the course material (PDF/PPT/ZIP) BEFORE the course
     *  row exists — the returned url + name are then submitted with
     *  the create call. Returns { url, name, filePath }. */
    uploadMaterial: async (trainerId: string, file: { uri: string; name: string; type: string }) => {
        const form = new FormData();
        form.append('file', file as any);
        form.append('trainerId', trainerId);
        const res = await fetchUpload('/files/upload/pending-material', form);
        return res as { url: string; name: string; filePath: string };
    },
};

// ══════════════════════════════════════════════
// Feed Services (AI-generated daily learning feed)
// ══════════════════════════════════════════════
export const feedService = {
    /** Paged feed. Pass studentId so the response includes the user's
     *  liked/saved state per post. `lang` is the i18n language code —
     *  backend serves the translation if it has one, English otherwise. */
    getFeed: async (userId?: string, lang?: string, page = 0, size = 20) => {
        const response = await api.get('/feed', { params: { userId, lang, page, size } });
        return response.data as {
            items: any[];
            page: number; size: number; totalElements: number; hasMore: boolean;
        };
    },

    /** Saved posts for the "Saved" entry in the profile screen. */
    getSaved: async (userId: string, lang?: string) => {
        const response = await api.get('/feed/saved', { params: { userId, lang } });
        return response.data as any[];
    },

    /** Toggle like — returns the new state. */
    toggleLike: async (postId: string, userId: string) => {
        const response = await api.post(`/feed/${postId}/like`, { userId });
        return response.data as { liked: boolean };
    },

    /** Toggle save — returns the new state. */
    toggleSave: async (postId: string, userId: string) => {
        const response = await api.post(`/feed/${postId}/save`, { userId });
        return response.data as { saved: boolean };
    },

    /** Manual regenerate (dev / admin seeding). */
    generate: async () => {
        const response = await api.post('/feed/generate', {});
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Search log — records queries for the ML recommendation engine
// ══════════════════════════════════════════════
export const searchLogService = {
    /** Record a search the student executed. Fire-and-forget on the
     *  client side; backend writes to the search_logs table which the
     *  recommendation engine reads on its next refresh. */
    log: async (payload: { studentId: string; query: string; clickedCourseId?: string }) => {
        try {
            await api.post('/searches/log', payload);
        } catch (_) {
            // Network / 500 — drop silently. Search history UX on the
            // device still works; only the ML signal is lost.
        }
    },
};

// ══════════════════════════════════════════════
// Device Services (Expo push token registration)
// ══════════════════════════════════════════════
export const deviceService = {
    /** Register / re-register this device's Expo push token to the user.
     *  Idempotent — safe to call on every login. */
    register: async (payload: { userId: string; userType?: string; token: string; platform?: string }) => {
        const response = await api.post('/devices/register', payload);
        return response.data;
    },

    /** Drop the token on the backend so a previous user doesn't keep
     *  receiving pushes after the next user signs in (or after logout). */
    unregister: async (payload: { token: string }) => {
        const response = await api.post('/devices/unregister', payload);
        return response.data;
    },
};

// ══════════════════════════════════════════════
// Review Services (course + trainer ratings)
// ══════════════════════════════════════════════
export const reviewService = {
    /** Has this student already submitted a review for this course? */
    check: async (studentId: string, courseId: string) => {
        const response = await api.get('/reviews/check', { params: { studentId, courseId } });
        return response.data as { reviewed: boolean; courseRating?: number; trainerRating?: number; feedback?: string };
    },

    /** Submit the end-of-course survey. trainerId is optional — the
     *  backend will pull the canonical one off the course if missing.
     *  Two optional feedback fields — courseFeedback surfaces on
     *  course-detail, trainerFeedback on trainer pages. */
    submit: async (payload: {
        studentId: string;
        courseId: string;
        trainerId?: string;
        enrollmentId?: string;
        courseRating: number;
        trainerRating: number;
        courseFeedback?: string;
        trainerFeedback?: string;
    }) => {
        const response = await api.post('/reviews', payload);
        return response.data;
    },

    /** Visible reviews for a course — drops admin-hidden rows. Each
     *  row carries studentName + studentPhoto for direct rendering. */
    forCourse: async (courseId: string) => {
        const response = await api.get(`/reviews/course/${courseId}`);
        return response.data as any[];
    },

    /** Visible reviews for a trainer — same shape as forCourse. */
    forTrainer: async (trainerId: string) => {
        const response = await api.get(`/reviews/trainer/${trainerId}`);
        return response.data as any[];
    },
};

// ══════════════════════════════════════════════
// Student Services (read-only public lookups)
// ══════════════════════════════════════════════
export const studentService = {
    /** Fetch any student's PUBLIC profile (name / photo / bio / domains).
     *  Used by the group-chat avatar tap so any member can see who they
     *  are chatting with. The backend deliberately strips email / phone /
     *  address from this response — those stay on /me only. */
    getPublicProfile: async (studentId: string) => {
        const response = await api.get(`/students/${studentId}/public`);
        return response.data;
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

    /** Update trainer bio + profile picture (page 3) */
    updateTrainerPage3: async (trainerId: string, data: { bio: string; profilePictureUrl?: string }) => {
        const response = await api.put('/trainers/me/profile/page3', data, { params: { trainerId } });
        return response.data;
    },

    /** Update trainer professional info (page 2) — requires full payload */
    updateTrainerPage2: async (trainerId: string, data: any) => {
        const response = await api.put('/trainers/me/profile/page2', data, { params: { trainerId } });
        return response.data;
    },

    /** Get a single trainer's public profile */
    getTrainerById: async (trainerId: string) => {
        const response = await api.get(`/trainers/${trainerId}`);
        return response.data;
    },

    /** Toggle the trainer's self-controlled availability and/or
     *  concurrent-groups cap. Partial update — pass only the fields
     *  you want to change. Backend gate effects:
     *    isActive=false → admin can't form new groups for them,
     *                     ML stops recommending their courses.
     *    maxConcurrentGroups → ML drops the trainer's courses once
     *                          their active group count hits the cap. */
    updateAvailability: async (trainerId: string, data: { isActive?: boolean; maxConcurrentGroups?: number }) => {
        const response = await api.put('/trainers/me/availability', data, { params: { trainerId } });
        return response.data;
    },

    /** Read the trainer's preferred display currency. Falls back to
     *  TND when the backend has no value stored. */
    getCurrency: async (trainerId: string): Promise<{ currency: string }> => {
        const response = await api.get(`/trainers/${trainerId}/currency`);
        return response.data;
    },

    /** Earnings breakdown for a given month. Backend returns the
     *  currency alongside so the client doesn't have to look it up
     *  separately. Days come sorted newest-first. */
    getEarnings: async (
        trainerId: string,
        year: number,
        month: number,
    ): Promise<{
        year: number;
        month: number;
        currency: string;
        total: number;
        days: { date: string; courseId: string; courseTitle: string; amount: number }[];
    }> => {
        const response = await api.get(`/trainers/${trainerId}/earnings`, { params: { year, month } });
        return response.data;
    },

    /** Persist a new preferred currency for this trainer. Also
     *  becomes the default when creating a new course. */
    setCurrency: async (trainerId: string, currency: string): Promise<{ currency: string }> => {
        const response = await api.put(`/trainers/${trainerId}/currency`, { currency });
        return response.data;
    },

    /** Create a course */
    createCourse: async (trainerId: string, courseData: any) => {
        const response = await api.post('/courses', courseData, { params: { trainerId } });
        return response.data;
    },

    /** Update an existing course */
    updateCourse: async (courseId: string, trainerId: string, courseData: any) => {
        const response = await api.put(`/courses/${courseId}`, courseData, { params: { trainerId } });
        return response.data;
    },

    // publishCourse was removed — drafts no longer exist. Admin assigns
    // templates to trainers, and offerings are live the moment they're
    // created. The /courses/{id}/publish endpoint now returns 410 Gone.
};

export default api;
