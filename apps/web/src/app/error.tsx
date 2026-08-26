'use client';

import { useEffect } from 'react';
import { Radar, Wordmark } from './glyphs';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Client-side application error:', error);
  }, [error]);

  const handleReset = () => {
    // Clear potentially stale Firebase auth states or other bad local data
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
    } catch (e) {
      // Ignore
    }
    
    // Attempt to recover
    reset();
    
    // Fallback: hard reload
    setTimeout(() => {
      window.location.href = '/login';
    }, 100);
  };

  return (
    <div className="wrap" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Radar />
        <Wordmark />
      </div>
      
      <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '32px' }}>
        <h2 style={{ color: 'var(--fail)', margin: '0 0 16px 0' }}>Something went wrong!</h2>
        
        <p className="hint" style={{ marginBottom: '24px' }}>
          We encountered an unexpected error loading the application. This is often caused by stale authentication data from a previous session.
        </p>
        
        <div className="err" style={{ textAlign: 'left', marginBottom: '24px', fontSize: '13px', maxHeight: '100px', overflowY: 'auto' }}>
          <strong>Error details:</strong> {error.message || 'Unknown error'}
        </div>
        
        <button className="primary" onClick={handleReset} style={{ width: '100%', justifyContent: 'center' }}>
          Clear Data & Try Again
        </button>
      </div>
    </div>
  );
}
