import React, { useState } from 'react';
import { polarisStore } from '../store/polarisStore';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('captain@polaris.ai');
  const [pass, setPass] = useState('polarisdemo');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      polarisStore.login(email, pass);
      const s = polarisStore.getState();
      if (!s.isAuthenticated) setError('Invalid credentials.');
      setLoading(false);
    }, 500);
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      minHeight: '100vh', fontFamily: 'var(--font-sans)',
    }}>
      {/* Left — Antarctic visual */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(160deg, var(--navy-800), var(--blue-500))',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 48px',
      }}>
        <img
          src="/assets/antarctica/hero-antarctica.png"
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            opacity: 0.3, mixBlendMode: 'luminosity',
          }}
        />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '0.12em', color: 'white' }}>POLARIS</span>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'white', lineHeight: 1.3, maxWidth: 400, marginBottom: 16 }}>
            Predictive Ocean–Ice Learning for Antarctic Route Intelligence
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(219,230,245,0.7)', maxWidth: 380, lineHeight: 1.6 }}>
            AI-powered decision support for research vessel navigation in the Southern Ocean.
          </p>
          <div style={{
            marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'rgba(219,230,245,0.4)', display: 'flex', gap: 20,
          }}>
            <span>EPSG:3031</span>
            <span>60°S — 90°S</span>
            <span>PROTOTYPE v2.4</span>
          </div>
        </div>
      </div>

      {/* Right — Auth card */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px', background: 'var(--surface)',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Operations Access
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Sign in to the POLARIS mission console.
            </p>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Username</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                className="p-input"
                autoComplete="username" autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</label>
              <input
                type="password" value={pass} onChange={e => setPass(e.target.value)}
                className="p-input"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 'var(--r-md)',
                background: 'var(--critical-bg)', border: '1px solid var(--critical-border)',
                fontSize: 12, color: 'var(--critical)',
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 4 }}>
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>

          <div style={{
            marginTop: 16, padding: '10px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--blue-50)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
          }}>
            Demo Environment · Credentials pre-filled
          </div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              onClick={() => polarisStore.setScreen('LANDING')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--blue-500)', fontWeight: 600,
              }}
            >← Back to POLARIS</button>
          </div>
        </div>
      </div>
    </div>
  );
};
