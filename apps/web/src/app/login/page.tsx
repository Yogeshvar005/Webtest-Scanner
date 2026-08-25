'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Radar, Wordmark } from '../glyphs';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('isAuthenticated') === 'true') {
      router.push('/');
    }
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    // Mock login delay
    setTimeout(() => {
      setLoading(false);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userEmail', email);
      router.push('/');
    }, 1200);
  }

  return (
    <div className="wrap">
      <header className="masthead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="masthead-row">
          <Radar />
          <Wordmark />
        </div>
        <div style={{ paddingTop: '8px' }}>
          <Link href="/" className="secondary" style={{ textDecoration: 'none' }}>Go Back</Link>
        </div>
      </header>

      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 120px)',
      }}>
        <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
          <h1 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: 600 }}>Sign In</h1>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="primary"
              disabled={loading || !email || !password}
              style={{ marginTop: '12px', width: '100%', justifyContent: 'center' }}
            >
              {loading ? (
                <><span className="spinner" /> Signing in…</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="hint" style={{ marginTop: '24px', textAlign: 'center' }}>
            Enter any email and password to continue.
          </p>
        </div>
      </main>
    </div>
  );
}
