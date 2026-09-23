import React, { useState, useEffect } from 'react';
import { PolarisAppState } from '../../types/state';
import { polarisStore } from '../../store/polarisStore';
import { formatAcquisitionTime } from '../../services/sentinel1Service';

interface VesselCoordinateControlProps {
  state: PolarisAppState;
  compact?: boolean;
}

export const VesselCoordinateControl: React.FC<VesselCoordinateControlProps> = ({ state, compact = false }) => {
  const [lat, setLat] = useState<number>(state.departureLocation.latitude);
  const [lon, setLon] = useState<number>(state.departureLocation.longitude);
  const [radiusKm, setRadiusKm] = useState<number>(250);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Sync internal state when store departureLocation changes
  useEffect(() => {
    setLat(state.departureLocation.latitude);
    setLon(state.departureLocation.longitude);
  }, [state.departureLocation.latitude, state.departureLocation.longitude]);

  const handleUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isNaN(lat) || lat < -90 || lat > 90) return;
    if (isNaN(lon) || lon < -180 || lon > 180) return;

    setIsUpdating(true);
    polarisStore.updateVesselPosition(lat, lon, false);
    await polarisStore.syncSentinel1(lat, lon, radiusKm);
    setIsUpdating(false);
  };

  const obs = state.sentinel1Data?.observation;
  const coverageStatus = obs?.coverage_status || (state.sentinel1Status === 'NO_DATA' ? 'NOT_COVERED' : null);

  return (
    <div className={`glass-panel rounded-xl border flex flex-col gap-2.5 text-xs select-none ${
      state.sentinel1Status === 'ONLINE' ? 'border-sky-600/50 bg-sky-950/20' : 'border-slate-800 bg-slate-950/60'
    } ${compact ? 'p-2.5' : 'p-3.5'}`}>
      
      {/* Header & Provenance Badge */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
          <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
            VESSEL POSITION & SAR AOI
          </h4>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40" title="Source of truth for satellite observation query">
          SIMULATED / MANUAL
        </span>
      </div>

      {/* Coordinate Input Form */}
      <form onSubmit={handleUpdate} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">LATITUDE (°N / °S)</label>
            <input
              type="number"
              step="0.01"
              min="-90"
              max="90"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value))}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[11px] focus:border-sky-500 focus:outline-none"
              placeholder="-63.00"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">LONGITUDE (°E / °W)</label>
            <input
              type="number"
              step="0.01"
              min="-180"
              max="180"
              value={lon}
              onChange={(e) => setLon(parseFloat(e.target.value))}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[11px] focus:border-sky-500 focus:outline-none"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Search Radius Selector */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">SEARCH RADIUS</label>
          <div className="flex items-center gap-1">
            {[100, 250, 500].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadiusKm(r)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all border ${
                  radiusKm === r
                    ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={isUpdating || state.sentinel1Status === 'CONNECTING'}
          className="btn-secondary !py-1.5 w-full justify-center text-[10px] font-bold tracking-wider text-sky-300 border-sky-500/50 hover:bg-sky-950/60 mt-1 shadow-sm flex items-center gap-1.5"
        >
          {isUpdating || state.sentinel1Status === 'CONNECTING' ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"></div>
              <span>QUERYING COPERNICUS SATELLITE...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <span>UPDATE SATELLITE OBSERVATION</span>
            </>
          )}
        </button>
      </form>

      {/* Local Satellite Coverage & SAR Status Feedback Box */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5 text-[10px]">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-400">SAR Status:</span>
          {isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180 || state.sentinel1ImageError?.includes('INVALID_COORDINATES') ? (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-rose-950 text-rose-300 border border-rose-500/40">
              ⚠ INVALID_COORDINATES
            </span>
          ) : state.sentinel1ImageError?.includes('PROCESSING_ERROR') ? (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-orange-950 text-orange-300 border border-orange-500/40">
              ✕ PROCESSING_ERROR
            </span>
          ) : state.sentinel1ImageAvailable && state.sentinel1ImageUrl ? (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
              ● RECENT SATELLITE IMAGE AVAILABLE
            </span>
          ) : state.sentinel1Status === 'NO_DATA' || state.sentinel1ImageError?.includes('NO_RECENT_COVERAGE') ? (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-rose-950 text-rose-300 border border-rose-500/40">
              ○ NO_RECENT_COVERAGE
            </span>
          ) : state.sentinel1ImageLoading ? (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-sky-950 text-sky-300 border border-sky-500/40 animate-pulse">
              ◌ PROCESSING SAR IMAGE...
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold bg-slate-900 text-slate-400 border border-slate-700">
              IDLE
            </span>
          )}
        </div>

        {/* Dynamic Detail Card */}
        {state.sentinel1ImageAvailable && state.sentinel1ImageMetadata ? (
          <div className="flex flex-col gap-1 p-2 rounded bg-slate-900/80 border border-slate-800 text-slate-300">
            <div className="flex justify-between">
              <span>Acquisition ID:</span>
              <strong className="font-mono text-sky-300 truncate max-w-[140px]" title={state.sentinel1ImageMetadata.product_id}>
                {state.sentinel1ImageMetadata.product_id}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Platform / Mode:</span>
              <strong className="font-mono text-slate-200">
                {state.sentinel1ImageMetadata.platform || 'SENTINEL-1'} ({state.sentinel1ImageMetadata.mode || 'SAR'})
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Polarization:</span>
              <strong className="font-mono text-amber-300">
                {state.sentinel1ImageMetadata.polarization}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Acquisition Time:</span>
              <strong className="font-mono text-slate-200 text-[9px]">
                {formatAcquisitionTime(state.sentinel1ImageMetadata.acquisition_time)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Provenance Tag:</span>
              <strong className="font-mono text-emerald-400">RECENT (NOT LIVE)</strong>
            </div>
          </div>
        ) : state.sentinel1ImageError?.includes('PROCESSING_ERROR') ? (
          <div className="p-2 rounded bg-rose-950/30 border border-rose-500/40 text-rose-200 text-[10px]">
            {state.sentinel1ImageError}
          </div>
        ) : isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180 || state.sentinel1ImageError?.includes('INVALID_COORDINATES') ? (
          <div className="p-2 rounded bg-rose-950/30 border border-rose-500/40 text-rose-200 text-[10px]">
            Coordinates outside valid ranges. Latitude must be in [-90, 90] and longitude in [-180, 180].
          </div>
        ) : (
          <div className="p-2 rounded bg-amber-950/30 border border-amber-500/30 text-amber-200/90 text-[10px]">
            No recent Sentinel-1 acquisition covers this location within {radiusKm} km. Satellite SAR overlay is cleared.
          </div>
        )}
      </div>

    </div>
  );
};
