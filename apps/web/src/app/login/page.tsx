'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0c0908]/85 backdrop-blur-2xl px-4 lg:px-8 py-4 sm:py-5 mb-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3.5 sm:space-x-4 group text-left cursor-pointer transition-transform duration-200 active:scale-[0.99]">
            {/* Designer Glowing Brand Mark */}
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-sky-500/30 blur-md opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-b from-[#241c19] via-[#16110f] to-[#0c0908] border border-white/20 group-hover:border-amber-400/50 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.25)] flex items-center justify-center transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                <i className="ph-bold ph-terminal-window text-2xl sm:text-[26px] text-amber-400 group-hover:text-amber-300 transition-colors drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-gradient-to-tr from-cyan-400 to-sky-400 border border-[#0c0908] shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                </span>
              </div>
            </div>

            {/* Designer Typography & Badge */}
            <div className="flex items-center space-x-2.5 sm:space-x-3.5">
              <div className="flex items-baseline space-x-1 sm:space-x-1.5">
                <span className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white font-sans drop-shadow-sm group-hover:text-neutral-100 transition-colors">
                  Webtest
                </span>
                <span className="text-xl sm:text-2xl lg:text-[26px] font-serif italic font-normal tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 animate-logo-shimmer select-none drop-shadow-[0_2px_16px_rgba(251,191,36,0.4)]">
                  Scanner
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-gradient-to-r from-sky-500/10 via-amber-500/10 to-transparent border border-sky-500/30 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.15)] backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                v2.0
              </span>
            </div>
          </Link>

          {/* Designer Telemetry Pill */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono text-neutral-300 bg-white/[0.04] border border-white/10 shadow-inner backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              </span>
              <span className="tracking-tight text-neutral-400">Engine Online</span>
            </div>
          </div>
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
