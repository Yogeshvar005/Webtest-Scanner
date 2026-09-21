'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import { Radar, Wordmark } from '../glyphs';
import { useAuth } from '../../lib/auth-context';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden style={{ marginRight: '8px' }}>
      <path
        fill="#EA4335"
        d="M12 5c1.7 0 3 .7 3.9 1.5l2.9-2.9C17 1.9 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.6 2.8C6.4 7.2 8.9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.6 2.8c2.1-2 3.8-5 3.8-8.7z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 14.9c-.3-.8-.5-1.7-.5-2.6s.2-1.8.5-2.6L1.9 6.9C.7 9.3 0 11.6 0 14s.7 4.7 1.9 7.1l3.6-2.8z"
      />
      <path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.6-2.8c-1.1.7-2.5 1.2-4.4 1.2-3.1 0-5.6-2.2-6.5-5.1L1.9 16.1C3.7 19.8 7.5 23 12 23z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  const setTheme = (theme: 'dark' | 'light') => {
    setResolvedTheme(theme);
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      router.push('/');
    } catch (err: any) {
      let msg = err.message || 'Authentication failed';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'An account already exists with this email.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed.';
      }
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.push('/');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err.message || 'Google sign-in failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0c0908]/80 backdrop-blur-xl px-4 lg:px-8 py-3.5 mb-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group text-left">
            <div className="relative w-8 h-8 rounded-lg bg-[#1a1412] border border-white/10 flex items-center justify-center text-sky-400 group-hover:border-sky-500/40 transition-colors shadow-sm">
              <i className="ph ph-terminal-window text-lg" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-semibold tracking-tight text-white group-hover:text-neutral-100 transition-colors">
                Webtest <span className="animate-logo-shimmer font-serif italic text-amber-400/90 font-normal">Scanner</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
                v2.0
              </span>
            </div>
          </Link>

          <button
              type="button"
              className="p-2 rounded-lg bg-[#15110f] hover:bg-[#1f1916] text-neutral-400 hover:text-white transition-colors border border-white/5 cursor-pointer"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              title={mounted && resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle light / dark mode"
            >
              {mounted ? (
                resolvedTheme === 'dark' ? (
                  <Sun size={16} className="text-amber-400" />
                ) : (
                  <Moon size={16} className="text-sky-400" />
                )
              ) : (
                <Sun size={16} className="text-amber-400" />
              )}
            </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="relative rounded-2xl bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] shadow-card-glass shadow-glow p-7 sm:p-9 w-full max-w-md">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-[#120e0c] rounded-xl border border-white/5 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-neutral-800 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-neutral-800 text-white shadow-sm border border-white/15'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Create Account
            </button>
          </div>

          <h1 className="text-xl font-semibold text-white mb-1.5">
            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-xs text-neutral-400 mb-6">
            {mode === 'signin'
              ? 'Sign in to access your automated test suites, reports, and telemetry.'
              : 'Create your account to start running AI-driven synthetic audits.'}
          </p>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <i className="ph ph-warning-circle text-base flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-[#120e0c] hover:bg-[#1a1412] text-neutral-200 text-xs font-medium border border-white/10 transition-colors mb-5 cursor-pointer disabled:opacity-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center text-center text-[11px] uppercase tracking-wider text-neutral-500 my-4">
            <span className="flex-1 border-b border-white/[0.08]" />
            <span className="px-3">or with email</span>
            <span className="flex-1 border-b border-white/[0.08]" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[11px] font-mono uppercase text-neutral-400 mb-1.5">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2.5 px-3 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none placeholder:text-neutral-600 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-mono uppercase text-neutral-400 mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="w-full bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2.5 px-3 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none placeholder:text-neutral-600 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full mt-2 inline-flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-md shadow-sky-950/40 border border-sky-400/30 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="spinner mr-2" />
                  {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : mode === 'signin' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="text-center mt-6 pt-5 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('wts_guest', 'true');
                  router.push('/');
                }
              }}
              className="text-xs font-semibold text-neutral-400 hover:text-amber-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Test the application locally without creating an account"
            >
              <span>🚀</span> Continue as Guest (Instant Access)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
