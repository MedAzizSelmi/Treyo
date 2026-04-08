import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// BACKEND URL
const API_URL = 'http://192.168.100.30:8085/api';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests
api.interceptors.request.use(
    async (config) => {
        const token = await SecureStore.getItemAsync('jwt_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Auth Services
export const authService = {
    // Login
    login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });

        if (response.data.token) {
            await SecureStore.setItemAsync('jwt_token', response.data.token);

            // Create user object from individual fields
            const userData = {
                userId: response.data.userId,
                email: response.data.email,
                name: response.data.name,
                role: response.data.role,
                onboardingComplete: response.data.onboardingComplete
            };
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }

        return response.data;
    },

    // Register - Route based on userType
    register: async (data: { name: string; email: string; password: string; userType: string }) => {
        // Determine endpoint based on userType
        const endpoint = data.userType === 'STUDENT'
            ? '/auth/register/student'
            : '/auth/register/trainer';

        // Send request
        const response = await api.post(endpoint, {
            name: data.name,
            email: data.email,
            password: data.password
        });

        console.log('Registration response:', response.data);

        if (response.data.token) {
            await SecureStore.setItemAsync('jwt_token', response.data.token);

            // Create user object from individual fields
            const userData = {
                userId: response.data.userId,
                email: response.data.email,
                name: response.data.name,
                role: response.data.role,
                userType: data.userType, // Add userType for onboarding routing
                onboardingComplete: response.data.onboardingComplete || false
            };
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }

        return response.data;
    },

    // Logout
    logout: async () => {
        await SecureStore.deleteItemAsync('jwt_token');
        await SecureStore.deleteItemAsync('user_data');
    },

    // Get current user
    getCurrentUser: async () => {
        const userData = await SecureStore.getItemAsync('user_data');
        return userData ? JSON.parse(userData) : null;
    },

    // Check if logged in
    isLoggedIn: async () => {
        const token = await SecureStore.getItemAsync('jwt_token');
        return !!token;
    },
};

// Course Services
export const courseService = {
    // Get AI recommendations
    getRecommendations: async () => {
        try {
            const response = await api.get('/courses/recommendations');
            return response.data;
        } catch (error) {
            console.log('Backend recommendations not available, using mock data');
            // Mock data fallback
            return [
                {
                    id: 1,
                    title: 'React Native Advanced',
                    trainer: 'John Doe',
                    rating: 4.8,
                    students: 234,
                    duration: '12 weeks',
                    level: 'Intermediate'
                },
                {
                    id: 2,
                    title: 'Node.js Backend Development',
                    trainer: 'Jane Smith',
                    rating: 4.9,
                    students: 189,
                    duration: '10 weeks',
                    level: 'Advanced'
                }
            ];
        }
    },

    // Get all courses
    getAllCourses: async () => {
        try {
            const response = await api.get('/courses');
            return response.data;
        } catch (error) {
            console.log('Backend courses not available, using mock data');
            return [];
        }
    },

    // Get course by ID
    getCourseById: async (id: number) => {
        const response = await api.get(`/courses/${id}`);
        return response.data;
    },

    // Enroll in course
    enrollInCourse: async (courseId: number) => {
        const response = await api.post(`/courses/${courseId}/enroll`);
        return response.data;
    },

    // Get my enrolled courses
    getMyCourses: async () => {
        try {
            const response = await api.get('/courses/my-courses');
            return response.data;
        } catch (error) {
            console.log('Backend my-courses not available, using mock data');
            // Mock data fallback
            return [
                {
                    id: 1,
                    title: 'Introduction to React',
                    progress: 65,
                    nextSession: '2026-03-20',
                    trainer: 'Alice Johnson'
                }
            ];
        }
    },
};

// Trainer Services
export const trainerService = {
    // Create course
    createCourse: async (courseData: any) => {
        const response = await api.post('/trainer/courses', courseData);
        return response.data;
    },

    // Get my courses as trainer
    getMyCourses: async () => {
        const response = await api.get('/trainer/courses');
        return response.data;
    },

    // Update course
    updateCourse: async (id: number, courseData: any) => {
        const response = await api.put(`/trainer/courses/${id}`, courseData);
        return response.data;
    },

    // Delete course
    deleteCourse: async (id: number) => {
        const response = await api.delete(`/trainer/courses/${id}`);
        return response.data;
    },
};

export default api;