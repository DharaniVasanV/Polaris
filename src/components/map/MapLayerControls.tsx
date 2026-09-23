import React, { useState } from 'react';
import { MapLayerState } from '../../types/state';
import { Layers, ChevronDown, ChevronUp, Eye } from 'lucide-react';

interface MapLayerControlsProps {
  layers: MapLayerState;
  onToggleLayer: (layerKey: keyof MapLayerState) => void;
  sarAvailable?: boolean;
  sarProvenance?: string;
  hasScenarioRoute?: boolean;
}

export const MapLayerControls: React.FC<MapLayerControlsProps> = ({
  layers,
  onToggleLayer,
  sarAvailable = true,
  sarProvenance = 'RECENT',
  hasScenarioRoute = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const layerItems: { key: keyof MapLayerState; label: string; badge?: string; category: string }[] = [
    { key: 'sentinel1Sar', label: 'Sentinel-1 SAR Image', badge: sarAvailable ? sarProvenance : 'N/A', category: 'Satellite' },
    { key: 'seaIce', label: 'Sea-Ice Concentration Grid', category: 'Environment' },
    { key: 'noGoZones', label: 'NO-GO Hazard Zones', category: 'Safety' },
    { key: 'icebergs', label: 'Iceberg Markers & Drift Tracks', category: 'Hazards' },
    { key: 'icebergUncertainty', label: 'Iceberg Uncertainty Circles', category: 'Hazards' },
    { key: 'recommendedRoute', label: 'Recommended Route (Primary)', category: 'Navigation' },
    { key: 'alternativeRoute', label: 'Alternative Route (Secondary)', category: 'Navigation' },
    { key: 'shortestRoute', label: 'Shortest Route (Rejected)', category: 'Navigation' },
    { key: 'researchStations', label: 'Research Stations (Bharati/Maitri)', category: 'Infrastructure' },
  ];

  return (
    <div className="absolute top-4 right-4 z-[1000] font-sans">
      <div className="bg-[#09111E]/95 border border-slate-700/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden min-w-[260px] max-w-[320px] transition-all duration-200">
        {/* Header Toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3.5 py-2.5 bg-slate-900/80 hover:bg-slate-800/80 text-white flex items-center justify-between gap-2 border-b border-slate-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-xs tracking-wider uppercase text-slate-200">Map Layer Control</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <span className="text-[10px] text-sky-400/80 font-mono">
              {Object.values(layers).filter(Boolean).length} Active
            </span>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Layer List Body */}
        {isOpen && (
          <div className="p-3 flex flex-col gap-2 max-h-[420px] overflow-y-auto custom-scrollbar text-xs">
            {layerItems.map((item) => {
              const active = !!layers[item.key];
              return (
                <label
                  key={item.key}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                    active
                      ? 'bg-sky-950/40 border-sky-500/50 text-slate-100'
                      : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggleLayer(item.key)}
                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900 accent-sky-500"
                    />
                    <span className="font-medium text-[11px] truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                        item.badge === 'RECENT'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </label>
              );
            })}

            {hasScenarioRoute && (
              <div className="mt-1 pt-2 border-t border-purple-900/40 flex items-center justify-between text-[11px] text-purple-300 px-1">
                <span className="flex items-center gap-1.5 font-bold">
                  <Eye className="w-3.5 h-3.5 text-purple-400" />
                  What-If Scenario Route
                </span>
                <span className="text-[9px] bg-purple-900/60 text-purple-200 border border-purple-500/40 px-1.5 py-0.5 rounded font-mono">
                  ACTIVE
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
