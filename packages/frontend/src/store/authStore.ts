import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setOnTokenUpdate } from '@/services/api';

interface User {
    id: string;
    email: string;
    name: string | null;
}

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    clearError: () => void;
    setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            login: async (email: string, password: string) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await api.post('/auth/login', { email, password });
                    const { user, accessToken } = response.data.data;

                    set({
                        user,
                        accessToken,
                        isAuthenticated: true,
                        isLoading: false,
                    });

                    // Set token for API calls
                    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                } catch (error: any) {
                    set({
                        isLoading: false,
                        error: error.response?.data?.error || 'Login failed',
                    });
                    throw error;
                }
            },

            register: async (email: string, password: string, name?: string) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await api.post('/auth/register', { email, password, name });
                    const { user, accessToken } = response.data.data;

                    set({
                        user,
                        accessToken,
                        isAuthenticated: true,
                        isLoading: false,
                    });

                    // Set token for API calls
                    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                } catch (error: any) {
                    set({
                        isLoading: false,
                        error: error.response?.data?.error || 'Registration failed',
                    });
                    throw error;
                }
            },

            logout: async () => {
                try {
                    await api.post('/auth/logout');
                } catch {
                    // Ignore errors during logout
                }

                set({
                    user: null,
                    accessToken: null,
                    isAuthenticated: false,
                });

                delete api.defaults.headers.common['Authorization'];
            },

            refreshToken: async () => {
                try {
                    const response = await api.post('/auth/refresh');
                    const { accessToken } = response.data.data;

                    set({ accessToken });
                    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                } catch {
                    // Refresh failed, logout
                    get().logout();
                }
            },

            clearError: () => set({ error: null }),

            setUser: (user) => set({ user }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                accessToken: state.accessToken,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => (state) => {
                // Set token on rehydration
                if (state?.accessToken) {
                    api.defaults.headers.common['Authorization'] = `Bearer ${state.accessToken}`;
                }
            },
        }
    )
);

// Subscribe to token updates from the API interceptor
setOnTokenUpdate((token) => {
    useAuthStore.setState({ accessToken: token });
});
