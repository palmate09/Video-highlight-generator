import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Film, Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register, isLoading, error, clearError } = useAuthStore();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const passwordRequirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'Contains a number', met: /\d/.test(password) },
        { label: 'Contains uppercase', met: /[A-Z]/.test(password) },
    ];

    const isPasswordValid = passwordRequirements.every((r) => r.met);
    const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        if (!isPasswordValid) {
            toast.error('Please meet all password requirements');
            return;
        }

        if (!doPasswordsMatch) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            await register(email, password, name || undefined);
            toast.success('Account created successfully!');
            navigate('/dashboard', { replace: true });
        } catch {
            // Error handled by store
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left side - Decorative */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden">
                <div className="absolute inset-0 mesh-gradient" />
                <div className="absolute inset-0 flex items-center justify-center p-12">
                    <div className="max-w-lg text-center space-y-6">
                        <div className="flex justify-center mb-8">
                            <div className="relative">
                                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center shadow-glow-lg">
                                    <Film className="w-16 h-16 text-white" />
                                </div>
                                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse">
                                    <Check className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                        <h2 className="text-4xl font-display font-bold text-gradient">
                            Start Creating Today
                        </h2>
                        <p className="text-dark-300 text-lg">
                            Join thousands of creators using AI to transform their videos into engaging highlights.
                        </p>
                        <ul className="text-left space-y-3 max-w-sm mx-auto">
                            {[
                                'Upload videos up to 2GB',
                                'AI-powered semantic search',
                                'Automatic scene detection',
                                'Export in HD quality',
                            ].map((feature, i) => (
                                <li key={i} className="flex items-center gap-3 text-dark-200">
                                    <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-primary-400" />
                                    </div>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Right side - Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-fade-up">
                    {/* Logo */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-glow mb-6 lg:hidden">
                            <Film className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-display font-bold text-dark-50">
                            Create Account
                        </h1>
                        <p className="mt-2 text-dark-400">
                            Get started with Video Highlights
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="label">
                                Name (optional)
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="w-5 h-5 text-dark-400" />
                                </div>
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="input pl-12"
                                    placeholder="Your name"
                                    autoComplete="name"
                                />
                            </div>
                        </div>

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
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-dark-400 hover:text-dark-200"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {/* Password requirements */}
                            {password.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {passwordRequirements.map((req, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 text-xs ${req.met ? 'text-emerald-400' : 'text-dark-400'
                                                }`}
                                        >
                                            <Check className={`w-3 h-3 ${req.met ? 'opacity-100' : 'opacity-30'}`} />
                                            {req.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="label">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-dark-400" />
                                </div>
                                <input
                                    id="confirmPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`input pl-12 ${confirmPassword.length > 0 && !doPasswordsMatch ? 'input-error' : ''
                                        }`}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                            {confirmPassword.length > 0 && !doPasswordsMatch && (
                                <p className="mt-1 text-xs text-rose-400">Passwords do not match</p>
                            )}
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
                            disabled={isLoading || !isPasswordValid || !doPasswordsMatch}
                            className="btn-primary w-full h-12"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Create Account
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Login link */}
                    <p className="text-center text-dark-400">
                        Already have an account?{' '}
                        <Link
                            to="/login"
                            className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
