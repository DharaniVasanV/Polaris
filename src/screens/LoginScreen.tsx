import React, { useState } from 'react';
import { polarisStore } from '../store/polarisStore';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('captain@polaris.ai');
  const [password, setPassword] = useState('polaris2026');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    polarisStore.login(email, password);
  };

  const handleOfflineLogin = () => {
    polarisStore.emergencyOfflineLogin();
  };

  return (
    <div className="min-h-screen w-full bg-[#040810] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient radar grid */}
      <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]"></div>

      {/* Decorative polar coordinates */}
      <div className="absolute top-8 left-8 text-[11px] font-mono text-slate-500 hidden sm:block">
        <div>POLAR SECTOR: 69°22'S, 76°11'E</div>
        <div>ANTARCTIC TREATY REGION</div>
      </div>
      <div className="absolute top-8 right-8 text-[11px] font-mono text-slate-500 hidden sm:block text-right">
        <div>VESSEL CLASS: PC3 POLAR ICEBREAKER</div>
        <div>STATION APPROACH: BHARATI / MAITRI</div>
      </div>

      <div className="glass-panel w-full max-w-md bg-[#0A111E]/95 border border-sky-500/30 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.15)] p-8 relative z-10 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-700 flex items-center justify-center border border-sky-400/40 shadow-[0_0_20px_rgba(56,189,248,0.4)]">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-widest text-white mt-2">POLARIS</h1>
          <p className="text-xs font-semibold text-sky-400 tracking-wide">Intelligent Antarctic Navigation Co-Pilot</p>
          <p className="text-[11px] text-slate-400 max-w-xs mt-1">Antarctic Maritime Spatiotemporal Decision-Support Console</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Officer / Scientist Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/90 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              placeholder="captain@polaris.ai"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Security Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/90 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary !py-3 w-full justify-center text-xs font-bold tracking-wider mt-2 shadow-[0_0_15px_rgba(2,132,199,0.4)]"
          >
            SIGN IN VIA SATELLITE LINK &rarr;
          </button>

          <button
            type="button"
            onClick={handleOfflineLogin}
            className="w-full py-2.5 px-4 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/50 text-amber-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          >
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            EMERGENCY OFFLINE LOGIN (CACHED DATA)
          </button>
        </form>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400 text-center leading-relaxed">
          <strong className="text-sky-300">Operational Notice:</strong> AI recommends; Captain / Ice Navigator makes the final operational decision.
        </div>
      </div>

      <div className="absolute bottom-4 text-[10px] text-slate-600 font-mono">
        POLARIS PROTOTYPE &bull; SMART INDIA HACKATHON
      </div>
    </div>
  );
};
