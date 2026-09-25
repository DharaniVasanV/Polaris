import React from 'react';
import { PolarisAppState, ForecastHorizonDay } from '../types/state';
import { PolarMap } from '../components/map/PolarMap';
import { polarisStore } from '../store/polarisStore';
import { getForecastForHorizon } from '../simulation/forecastEngine';
import { ForecastHorizon } from '../services/seaIceModelService';

interface IceIntelligenceScreenProps {
  state: PolarisAppState;
}

export const IceIntelligenceScreen: React.FC<IceIntelligenceScreenProps> = ({ state }) => {
  const horizonMetrics = getForecastForHorizon(state.forecastHorizon);
  const [selectedIcebergId, setSelectedIcebergId] = React.useState<string>(state.icebergs[0]?.id || 'B-22');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isSyncingSeaIce, setIsSyncingSeaIce] = React.useState(false);
  const [isSyncingWeather, setIsSyncingWeather] = React.useState(false);

  const activeIceberg = state.icebergs.find((b) => b.id === selectedIcebergId) || state.icebergs[0];

  const handleSyncGRU = async () => {
    setIsSyncing(true);
    await polarisStore.syncAllIcebergsWithGRUModel();
    setIsSyncing(false);
  };

  const handleSyncSeaIce = async () => {
    setIsSyncingSeaIce(true);
    await polarisStore.syncSeaIceForecast();
    setIsSyncingSeaIce(false);
  };

  const handleSyncWeather = async () => {
    setIsSyncingWeather(true);
    await polarisStore.syncWeatherForecast();
    setIsSyncingWeather(false);
  };

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden bg-[#060B14]">
      {/* Left Column: Horizon Controls & Analytics */}
      <aside className="w-full md:w-96 bg-[#090F1C] border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-xs shrink-0 select-none">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <h2 className="text-sm font-bold text-white tracking-wider">ICE INTELLIGENCE</h2>
          </div>
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-500/40">4D HORIZONS</span>
        </div>

        {/* Forecast Horizon Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Select Spatiotemporal Forecast Horizon</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'TODAY' as ForecastHorizonDay, label: 'TODAY (0h)', conf: '94% Conf' },
              { key: 'PLUS_1_DAY' as ForecastHorizonDay, label: '+1 DAY (24h)', conf: '89% Conf' },
              { key: 'PLUS_3_DAYS' as ForecastHorizonDay, label: '+3 DAYS (72h)', conf: '78% Conf' },
              { key: 'PLUS_7_DAYS' as ForecastHorizonDay, label: '+7 DAYS (168h)', conf: '63% Conf' },
            ].map(({ key, label, conf }) => (
              <button
                key={key}
                onClick={() => polarisStore.setForecastHorizon(key)}
                className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all ${
                  state.forecastHorizon === key
                    ? 'bg-sky-600 text-white font-bold border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                    : 'bg-slate-900/90 text-slate-300 hover:text-white border-slate-800 font-medium'
                }`}
              >
                <span className="text-xs">{label}</span>
                <span className="text-[9px] opacity-80 font-mono">{conf}</span>
              </button>
            ))}
          </div>
        </div>

        {/* GRU Trajectory Neural Network Panel */}
        <div className="glass-panel p-4 rounded-xl border border-cyan-900/50 bg-gradient-to-b from-[#081528]/90 to-[#050C18]/90 flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-cyan-900/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">GRU Trajectory Neural Engine</span>
            </div>
            <span className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded border ${
              state.aiModelStatus === 'ONLINE'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
            }`}>
              {state.aiModelStatus === 'ONLINE' ? 'LIVE MODEL' : 'OFFLINE'}
            </span>
          </div>

          {/* Iceberg Selector Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {state.icebergs.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedIcebergId(b.id)}
                className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all shrink-0 border ${
                  activeIceberg?.id === b.id
                    ? 'bg-cyan-600 text-white border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          {activeIceberg && (
            <div className="flex flex-col gap-2 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Model Architecture:</span>
                <strong className="text-cyan-300 font-mono text-[10px]">GRU (64 units, 10-day seq)</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Training Dataset:</span>
                <strong className="text-slate-200 font-mono text-[10px]">BYU Antarctic (214,561 pts)</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Current Drift Vector:</span>
                <strong className="text-slate-200 font-mono">{activeIceberg.driftDirectionLabel} ({activeIceberg.speedKmh} km/h)</strong>
              </div>

              {/* 5-Step Trajectory Forecast Table */}
              <div className="mt-1 flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Multi-Step Forecast Coordinates</span>
                <div className="rounded border border-slate-800 bg-black/40 overflow-hidden">
                  <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-900/80 font-bold text-[9px] text-slate-400 border-b border-slate-800">
                    <span>STEP</span>
                    <span>LAT</span>
                    <span>LON</span>
                    <span className="text-right">HAZARD</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-900/60 font-mono text-[10px]">
                    {activeIceberg.forecastTrack.slice(1).map((step, idx) => (
                      <div key={idx} className="grid grid-cols-4 gap-1 p-1.5 text-slate-300 hover:bg-cyan-950/20">
                        <span className="text-sky-400 font-bold">{step.stepLabel || `+${step.horizonHours}h`}</span>
                        <span>{step.latitude.toFixed(2)}°</span>
                        <span>{step.longitude.toFixed(2)}°</span>
                        <span className="text-right text-amber-300 font-semibold">{step.totalHazardRadiusKm ? `${Math.round(step.totalHazardRadiusKm)}km` : `${Math.round(step.uncertaintyRadiusKm)}km`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSyncGRU}
                disabled={isSyncing}
                className={`mt-1 btn-primary !py-1.5 w-full justify-center text-[10px] font-bold tracking-wider ${
                  isSyncing ? 'opacity-70 cursor-wait' : ''
                }`}
              >
                {isSyncing ? 'RUNNING GRU INFERENCE...' : 'RE-RUN GRU INFERENCE NOW'}
              </button>
            </div>
          )}
        </div>

        {/* ConvLSTM Sea-Ice Concentration Engine Panel */}
        <div className="glass-panel p-4 rounded-xl border border-teal-900/50 bg-gradient-to-b from-[#082024]/90 to-[#041215]/90 flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-teal-900/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.8)]"></span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">ConvLSTM Sea-Ice Engine</span>
            </div>
            <span className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded border ${
              state.seaIceModelStatus === 'ONLINE'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
            }`}>
              {state.seaIceModelStatus === 'ONLINE' ? 'LIVE MODEL' : 'BUNDLED CACHE'}
            </span>
          </div>

          {/* Model Architecture & Sector */}
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Architecture:</span>
              <strong className="text-teal-300 font-mono text-[10px]">ConvLSTM2D (5ch, 7d seq)</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Coverage Sector:</span>
              <strong className="text-slate-200 font-mono text-[10px]">Queen Maud Land (88 cells)</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Spatial Domain:</span>
              <strong className="text-slate-300 font-mono text-[9px]">-70°S to -60°S | 0°E to 30°E</strong>
            </div>
          </div>

          {/* 5-Step Horizon Tabs */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Temporal Prediction Horizon</span>
            <div className="grid grid-cols-5 gap-1">
              {(['0h', '6h', '12h', '18h', '24h'] as ForecastHorizon[]).map((h) => {
                const isSelected = state.selectedSeaIceHorizon === h;
                const provBadge = h === '0h' ? 'CDR' : h === '6h' ? 'KIN' : 'LSTM';
                return (
                  <button
                    key={h}
                    onClick={() => polarisStore.setSeaIceHorizon(h)}
                    className={`py-1.5 px-1 rounded flex flex-col items-center justify-center transition-all border ${
                      isSelected
                        ? 'bg-teal-600 text-white font-bold border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[10px] font-bold">{h}</span>
                    <span className="text-[8px] opacity-75 font-mono">{provBadge}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horizon Details */}
          {state.seaIceForecastData && (
            <div className="rounded border border-teal-950 bg-black/40 p-2 flex flex-col gap-1.5 text-[10px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Provenance:</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  state.selectedSeaIceHorizon === '0h'
                    ? 'bg-sky-950 text-sky-400 border border-sky-600/40'
                    : state.selectedSeaIceHorizon === '6h'
                    ? 'bg-indigo-950 text-indigo-400 border border-indigo-600/40'
                    : 'bg-teal-950 text-teal-300 border border-teal-600/40'
                }`}>
                  {state.selectedSeaIceHorizon === '0h'
                    ? '● Observed CDR'
                    : state.selectedSeaIceHorizon === '6h'
                    ? '◒ Kinematic Transition'
                    : '▲ ConvLSTM Neural Forecast'}
                </span>
              </div>
              {(() => {
                const cells = state.seaIceForecastData.forecast[state.selectedSeaIceHorizon] || [];
                const predicted = cells.filter((c) => c.prediction_status === 'PREDICTED');
                const avgSic = predicted.length > 0
                  ? (predicted.reduce((acc, c) => acc + (c.sic_percent || 0), 0) / predicted.length).toFixed(1)
                  : 'N/A';
                const avgConf = predicted.length > 0
                  ? (predicted.reduce((acc, c) => acc + (c.confidence || 0), 0) / predicted.length).toFixed(0)
                  : 'N/A';
                const highRisk = predicted.filter((c) => (c.sic_percent || 0) >= 70).length;

                return (
                  <div className="grid grid-cols-3 gap-1 pt-1 text-center font-mono">
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Sector Mean SIC</div>
                      <div className="text-teal-300 font-bold">{avgSic}%</div>
                    </div>
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Model Conf</div>
                      <div className="text-emerald-400 font-bold">{avgConf}%</div>
                    </div>
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Cells &gt;70% SIC</div>
                      <div className="text-rose-400 font-bold">{highRisk}</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <button
            onClick={handleSyncSeaIce}
            disabled={isSyncingSeaIce}
            className={`btn-secondary !py-1.5 w-full justify-center text-[10px] font-bold tracking-wider text-teal-300 border-teal-800 hover:bg-teal-950/60 ${
              isSyncingSeaIce ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            {isSyncingSeaIce ? 'FETCHING CONVLSTM FORECAST...' : 'SYNC CONVLSTM SEA ICE'}
          </button>
        </div>

        {/* Weather Risk Neural Engine Panel */}
        <div className="glass-panel p-4 rounded-xl border border-purple-900/50 bg-gradient-to-b from-[#160b26]/90 to-[#0c0517]/90 flex flex-col gap-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-purple-900/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Weather Risk MLP Engine</span>
            </div>
            <span className={`px-1.5 py-0.5 text-[8px] font-mono font-bold rounded border ${
              state.weatherModelStatus === 'ONLINE'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
            }`}>
              {state.weatherModelStatus === 'ONLINE' ? 'LIVE MODEL' : 'BUNDLED CACHE'}
            </span>
          </div>

          {/* Model Architecture & Features */}
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Model Architecture:</span>
              <strong className="text-purple-300 font-mono text-[10px]">PyTorch MLP (128-64-32-1)</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Feature Space:</span>
              <strong className="text-slate-200 font-mono text-[10px]">27 ERA5 Features (Wind/Gust/MSLP)</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Forecast Horizon:</span>
              <strong className="text-purple-300 font-mono text-[10px]">T + 6 Hours Ahead</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Grid Coverage:</span>
              <strong className="text-slate-300 font-mono text-[9px]">468 Cells (Full Corridor)</strong>
            </div>
          </div>

          {/* Weather Risk Statistics */}
          {state.weatherForecastData && (
            <div className="rounded border border-purple-950 bg-black/40 p-2 flex flex-col gap-1.5 text-[10px]">
              {(() => {
                const cells = state.weatherForecastData.cells || [];
                const safeCount = cells.filter((c) => c.riskClass === 'SAFE').length;
                const modCount = cells.filter((c) => c.riskClass === 'MODERATE').length;
                const highCount = cells.filter((c) => c.riskClass === 'HIGH' || c.riskClass === 'CRITICAL').length;
                const avgRisk = cells.length > 0
                  ? (cells.reduce((acc, c) => acc + c.riskScore, 0) / cells.length).toFixed(3)
                  : '0.000';

                return (
                  <div className="grid grid-cols-4 gap-1 pt-0.5 text-center font-mono">
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Mean Risk</div>
                      <div className="text-purple-300 font-bold">{avgRisk}</div>
                    </div>
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Safe</div>
                      <div className="text-emerald-400 font-bold">{safeCount}</div>
                    </div>
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">Moderate</div>
                      <div className="text-amber-300 font-bold">{modCount}</div>
                    </div>
                    <div className="bg-slate-900/60 p-1 rounded border border-slate-800">
                      <div className="text-[8px] text-slate-500 uppercase">High/Crit</div>
                      <div className="text-rose-400 font-bold">{highCount}</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <button
            onClick={handleSyncWeather}
            disabled={isSyncingWeather}
            className={`btn-secondary !py-1.5 w-full justify-center text-[10px] font-bold tracking-wider text-purple-300 border-purple-800 hover:bg-purple-950/60 ${
              isSyncingWeather ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            {isSyncingWeather ? 'COMPUTING WEATHER RISK...' : 'SYNC WEATHER RISK MLP'}
          </button>
        </div>

        {/* Horizon State Summary */}
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5 text-[11px]">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Forecast Horizon State</span>
          <div className="flex justify-between text-slate-400"><span>Forecast Confidence:</span><strong className={`${horizonMetrics.confidencePercent > 75 ? 'text-emerald-400' : 'text-amber-400'} font-mono`}>{horizonMetrics.confidencePercent}%</strong></div>
          <div className="flex justify-between text-slate-400"><span>Ice Edge Expansion:</span><strong className="text-slate-200 font-mono">{horizonMetrics.iceGrowthDescription}</strong></div>
          <div className="flex justify-between text-slate-400"><span>Mean Pack Drift:</span><strong className="text-slate-200 font-mono">{horizonMetrics.meanDriftSpeed} ({horizonMetrics.driftDirection})</strong></div>
          <div className="flex justify-between text-slate-400"><span>Iceberg Uncertainty Envelope:</span><strong className="text-amber-400 font-mono">&plusmn;{horizonMetrics.uncertaintyBufferKm} km</strong></div>
          <div className="flex justify-between text-slate-400"><span>Lead Closure Probability:</span><strong className={`${state.forecastHorizon === 'PLUS_7_DAYS' ? 'text-rose-400' : 'text-slate-200'} font-mono`}>{horizonMetrics.leadClosureProbability}</strong></div>
          <div className="flex justify-between text-slate-400"><span>Ice Structure:</span><strong className="text-slate-300 font-mono text-[10px]">{horizonMetrics.iceDensityDescription}</strong></div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-cyan-900/40 bg-cyan-950/20 flex flex-col gap-1.5 text-[11px] text-cyan-200">
          <strong className="text-white text-xs">Spatiotemporal Horizon Summary:</strong>
          <p className="leading-relaxed">{horizonMetrics.narrativeNote}</p>
        </div>

        <button onClick={() => polarisStore.setScreen('DECISION_CENTER')} className="btn-primary !py-2 w-full justify-center text-xs mt-1">
          Open Bridge Decision Center &rarr;
        </button>
      </aside>

      {/* Center Canvas View */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#060B14] relative">
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <PolarMap state={state} />

          <div className="absolute top-4 glass-panel px-4 py-1.5 rounded-full border border-sky-400/40 flex items-center gap-2.5 shadow-xl">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-xs font-bold text-white tracking-wider">ACTIVE HORIZON: {horizonMetrics.label}</span>
            <span className="text-[11px] text-cyan-300 font-mono">| Spatiotemporal Model Confidence: {horizonMetrics.confidencePercent}%</span>
          </div>
        </div>
      </main>
    </div>
  );
};
