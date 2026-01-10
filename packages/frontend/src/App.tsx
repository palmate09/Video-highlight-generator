import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Layout from '@/components/common/Layout';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import VideoLibraryPage from '@/pages/VideoLibraryPage';
import VideoDetailPage from '@/pages/VideoDetailPage';
import SearchPage from '@/pages/SearchPage';
import HighlightPage from '@/pages/HighlightPage';
import HighlightListPage from '@/pages/HighlightListPage';

export default function App() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

    return (
        <Routes>
            {/* Public routes */}
            <Route
                path="/login"
                element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
            />
            <Route
                path="/register"
                element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
            />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/videos" element={<VideoLibraryPage />} />
                    <Route path="/videos/:id" element={<VideoDetailPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/highlights" element={<HighlightListPage />} />
                    <Route path="/highlights/new" element={<HighlightPage />} />
                    <Route path="/highlights/:id" element={<HighlightPage />} />
                </Route>
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}
