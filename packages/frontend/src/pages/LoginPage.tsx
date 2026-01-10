import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Film, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isLoading, error, clearError } = useAuthStore();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const from = location.state?.from?.pathname || '/dashboard';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        try {
            await login(email, password);
            toast.success('Welcome back!');
            navigate(from, { replace: true });
        } catch {
            // Error is handled by store
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left side - Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-fade-up">
                    {/* Logo */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-glow mb-6">
                            <Film className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-display font-bold text-dark-50">
                            Welcome Back
                        </h1>
                        <p className="mt-2 text-dark-400">
                            Sign in to continue to Video Highlights
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="label">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="w-5 h-5 text-dark-400" />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="input pl-12"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="label">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-dark-400" />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pl-12 pr-12"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-dark-400 hover:text-dark-200"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full h-12"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Register link */}
                    <p className="text-center text-dark-400">
                        Don't have an account?{' '}
                        <Link
                            to="/register"
                            className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                        >
                            Create one
                        </Link>
                    </p>
                </div>
            </div>

            {/* Right side - Decorative */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden">
                <div className="absolute inset-0 mesh-gradient" />
                <div className="absolute inset-0 flex items-center justify-center p-12">
                    <div className="max-w-lg text-center space-y-6">
                        <div className="flex justify-center gap-4 mb-8">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="w-24 h-32 rounded-xl bg-dark-800/50 border border-dark-700/50 backdrop-blur-sm animate-pulse"
                                    style={{ animationDelay: `${i * 0.2}s` }}
                                />
                            ))}
                        </div>
                        <h2 className="text-4xl font-display font-bold text-gradient">
                            AI-Powered Video Highlights
                        </h2>
                        <p className="text-dark-300 text-lg">
                            Upload videos, search with natural language, and create stunning highlight reels in minutes.
                        </p>
                        <div className="flex justify-center gap-4 mt-8">
                            <div className="badge-primary">Semantic Search</div>
                            <div className="badge-info">Auto Clips</div>
                            <div className="badge-success">Easy Export</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
