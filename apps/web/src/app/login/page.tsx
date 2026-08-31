'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    <div className="wrap">
      <header className="masthead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Radar />
          <span className="font-serif" style={{ fontSize: 24, fontWeight: 600 }}>Webtest Scanner</span>
          <span className="pill-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>
            v2.0
          </span>
        </div>
        <div>
          <Link href="/" className="secondary" style={{ textDecoration: 'none' }}>
            Go Back
          </Link>
        </div>
      </header>

      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 140px)',
          padding: '20px 0',
        }}
      >
        <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '16px',
              marginBottom: '24px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              style={{
                flex: 1,
                background: mode === 'signin' ? 'var(--card)' : 'transparent',
                color: mode === 'signin' ? 'var(--fg)' : 'var(--muted)',
                borderColor: mode === 'signin' ? 'var(--primary)' : 'transparent',
                fontWeight: mode === 'signin' ? 600 : 400,
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              style={{
                flex: 1,
                background: mode === 'signup' ? 'var(--card)' : 'transparent',
                color: mode === 'signup' ? 'var(--fg)' : 'var(--muted)',
                borderColor: mode === 'signup' ? 'var(--primary)' : 'transparent',
                fontWeight: mode === 'signup' ? 600 : 400,
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Create Account
            </button>
          </div>

          <h1 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 600 }}>
            {mode === 'signin' ? 'Welcome Back' : 'Get Started'}
          </h1>
          <p className="hint" style={{ margin: '0 0 20px 0' }}>
            {mode === 'signin'
              ? 'Sign in to access and manage your website test scans.'
              : 'Create a free account to scan any website from anywhere.'}
          </p>

          {errorMsg && (
            <div
              className="err"
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            className="secondary"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            style={{
              width: '100%',
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              padding: '10px 16px',
              marginBottom: '20px',
              cursor: 'pointer',
            }}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '12px',
              margin: '16px 0',
            }}
          >
            <span style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
            <span style={{ padding: '0 10px', textTransform: 'uppercase' }}>or with email</span>
            <span style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
          </div>

          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            <button
              type="submit"
              className="primary"
              disabled={submitting || !email || !password}
              style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
            >
              {submitting ? (
                <>
                  <span className="spinner" />
                  {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : mode === 'signin' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
