import React from 'react';

export const ModelTransparency: React.FC = () => {
  return (
    <div className="glass-panel p-4 rounded-xl border border-sky-900/50 bg-[#091122]/90 flex flex-col gap-3 text-xs text-slate-300">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
        <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">Prototype vs Future Architecture Transparency</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
        <div className="p-2.5 rounded bg-slate-950/80 border border-cyan-800/40 flex flex-col gap-1">
          <strong className="text-cyan-300">INTEGRATED GRU AI MODEL:</strong>
          <p className="text-slate-400 leading-tight">
            Trained <strong>GRU Sequential Neural Network</strong> (64 units, Dense 32) trained on <strong>214,561 satellite observations</strong> from BYU Antarctic Iceberg Database. Computes 5-day recursive drift with empirical test error bounds (168 km to 2,371 km) + vessel safety buffer.
          </p>
        </div>
        <div className="p-2.5 rounded bg-slate-950/80 border border-teal-800/40 flex flex-col gap-1">
          <strong className="text-teal-300">INTEGRATED CONVLSTM SEA-ICE MODEL:</strong>
          <p className="text-slate-400 leading-tight">
            Trained <strong>ConvLSTM2D Neural Network</strong> (5 physical channels: SIC, ERA5 wind U/V, ocean current U/V; 7-day lookback) predicting multi-step spatiotemporal sea-ice concentrations across Queen Maud Land (-70°S to -60°S, 0°E to 30°E).
          </p>
        </div>
        <div className="p-2.5 rounded bg-slate-950/80 border border-purple-800/40 flex flex-col gap-1">
          <strong className="text-purple-300">INTEGRATED WEATHER RISK MLP:</strong>
          <p className="text-slate-400 leading-tight">
            Trained <strong>PyTorch MLP Neural Network</strong> (128-64-32-1) with <strong>27 ERA5 features</strong> (wind vectors, gusts, MSLP, pressure tendencies) predicting 6h-ahead maritime navigation weather risk across 468 cells.
          </p>
        </div>
        <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1">
          <strong className="text-emerald-300">FUTURE PRODUCTION EXPANSION:</strong>
          <p className="text-slate-400 leading-tight">
            Live telemetry integration with Copernicus Sentinel-1 SAR, AMSR2 microwave feeds, US NIC telemetry, and full-hemisphere GEBCO bathymetry.
          </p>
        </div>
      </div>
    </div>
  );
};
