import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

export const MapLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <div className="absolute bottom-5 left-4 z-[1000] font-sans">
      <div className="bg-[#09111E]/95 border border-slate-700/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden min-w-[220px] max-w-[280px]">
        {/* Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 bg-slate-900/80 hover:bg-slate-800/80 text-white flex items-center justify-between gap-2 border-b border-slate-800 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-200">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span>NAVIGATION LEGEND</span>
          </div>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        {/* Legend Contents */}
        {isOpen && (
          <div className="p-2.5 flex flex-col gap-2.5 text-[10px] text-slate-300">
            {/* Risk Levels */}
            <div>
              <div className="font-bold text-[9px] text-slate-400 tracking-wider uppercase mb-1">FUSED RISK MATRIX</div>
              <div className="grid grid-cols-2 gap-1 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/80 border border-emerald-400/50"></span>
                  <span>Safe</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500/80 border border-amber-400/50"></span>
                  <span>Moderate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500/80 border border-orange-400/50"></span>
                  <span>High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-red-600/90 border border-red-500"></span>
                  <span>Critical (NO-GO)</span>
                </div>
              </div>
            </div>

            {/* Routes */}
            <div className="pt-1.5 border-t border-slate-800">
              <div className="font-bold text-[9px] text-slate-400 tracking-wider uppercase mb-1">NAVIGATION ROUTES</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-1 bg-cyan-400 rounded-full"></span>
                  <span className="font-bold text-cyan-300">Recommended Route</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-1 border-b-2 border-dashed border-amber-400"></span>
                  <span className="text-amber-300">Alternative Route</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-1 border-b-2 border-dashed border-slate-500"></span>
                  <span className="text-slate-400">Shortest (Rejected)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-1 border-b-2 border-dashed border-purple-400"></span>
                  <span className="text-purple-300">Scenario Counterfactual</span>
                </div>
              </div>
            </div>

            {/* Observation & Hazards */}
            <div className="pt-1.5 border-t border-slate-800">
              <div className="font-bold text-[9px] text-slate-400 tracking-wider uppercase mb-1">OBSERVATION & MARKERS</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 bg-slate-800 border border-sky-400 rounded flex items-center justify-center text-[8px] text-sky-400 font-bold">🛰</span>
                  <span>Sentinel-1 SAR Backscatter</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-cyan-400 border border-white rotate-45"></span>
                  <span>Iceberg & Track</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-cyan-400/60 bg-cyan-950/40"></span>
                  <span>Uncertainty Envelope</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-sky-400 border border-white flex items-center justify-center text-[7px] text-slate-900 font-bold">🚢</span>
                  <span className="font-bold text-sky-300">Vessel Position</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
