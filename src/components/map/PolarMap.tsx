import React, { useEffect, useRef, useState } from 'react';
import { PolarisAppState, MapLayerState } from '../../types/state';
import { PolarMapRenderer } from './PolarMapRenderer';
import { MapLayerControls } from './MapLayerControls';
import { MapLegend } from './MapLegend';
import { polarCanvasToGeo } from '../../utils/geo';
import { polarisStore } from '../../store/polarisStore';
import { ZoomIn, ZoomOut, RotateCcw, Compass } from 'lucide-react';

interface PolarMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const PolarMap: React.FC<PolarMapProps> = ({ state, width = '100%', height = '100%' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PolarMapRenderer | null>(null);

  // Pan & Zoom interactive state
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Real-time Mouse Coordinate Tracker HUD state
  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lng: number;
    distToSouthPoleKm: number;
    distToVesselKm: number;
  } | null>(null);

  // Initialize Canvas Renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    // Handle high DPI Retina canvas scaling
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    resizeCanvas();

    rendererRef.current = new PolarMapRenderer(canvas, {
      state,
      zoomScale,
      panOffset,
    });

    const handleResize = () => {
      resizeCanvas();
      rendererRef.current?.render();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Update renderer props whenever state, zoom, or pan changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateProps({
        state,
        zoomScale,
        panOffset,
      });
    }
  }, [state, zoomScale, panOffset]);

  // Handle Mouse Hovering Lat / Lon Coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
      const dx = mouseX - dragStart.x;
      const dy = mouseY - dragStart.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: mouseX, y: mouseY });
      return;
    }

    const geo = polarCanvasToGeo(mouseX, mouseY, rect.width, rect.height, zoomScale, panOffset, -90, -50);

    const lat = geo.latitude;
    const lng = geo.longitude;

    // Calculate distance to South Pole (-90, 0)
    const distToSouthPoleKm = Math.abs(lat - -90) * 111.139;

    // Calculate distance to active vessel
    const vLat = state.departureLocation?.latitude ?? -66.5;
    const vLon = state.departureLocation?.longitude ?? 25.0;
    const dLat = ((lat - vLat) * Math.PI) / 180;
    const dLon = ((lng - vLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((vLat * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distToVesselKm = 6371 * c;

    setCursorCoords({
      lat,
      lng,
      distToSouthPoleKm,
      distToVesselKm,
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomScale((prev) => Math.min(3.5, Math.max(0.6, prev + delta)));
  };

  const handleZoomIn = () => setZoomScale((prev) => Math.min(3.5, prev + 0.25));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(0.6, prev - 0.25));
  const handleResetView = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleToggleLayer = (layerKey: keyof MapLayerState) => {
    polarisStore.toggleMapLayer(layerKey);
  };

  const formatDms = (deg: number, isLat: boolean) => {
    const absDeg = Math.abs(deg);
    const d = Math.floor(absDeg);
    const m = Math.floor((absDeg - d) * 60);
    const s = Math.round(((absDeg - d) * 60 - m) * 60);
    const dir = isLat ? (deg < 0 ? 'S' : 'N') : deg < 0 ? 'W' : 'E';
    return `${d}° ${m}' ${s}" ${dir}`;
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#060B14] flex items-center justify-center">
      {/* Antarctic Polar Stereographic Canvas Renderer */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ width, height }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Map Interactive Zoom & View Toolbar */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-sky-400 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-sky-400 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          title="Recenter South Pole (-90°S)"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-amber-400 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Real-Time Interactive Cursor Lat/Lon Tracker HUD */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-sky-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs text-slate-200 flex flex-col gap-1 min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
          <span className="font-bold text-sky-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            Antarctic Polar Projection HUD
          </span>
          <span className="text-[9px] bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded border border-sky-600/30">
            EPSG:3031 CIRCULAR
          </span>
        </div>

        {cursorCoords ? (
          <>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Hover Position:</span>
              <span className="font-bold text-cyan-300">
                {formatDms(cursorCoords.lat, true)}, {formatDms(cursorCoords.lng, false)}
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Decimal Coords:</span>
              <span className="text-slate-300">
                {cursorCoords.lat.toFixed(4)}°, {cursorCoords.lng.toFixed(4)}°
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Distance to South Pole:</span>
              <span className="text-amber-300 font-bold">
                {cursorCoords.distToSouthPoleKm.toFixed(0)} km
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Distance to Vessel:</span>
              <span className="text-emerald-400 font-bold">
                {cursorCoords.distToVesselKm.toFixed(0)} km
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-center py-1 text-[11px]">
            Hover mouse over circular map for coordinates & distances
          </div>
        )}

        {/* Dynamic Scale Bar matching reference image (>1000 km ocean span) */}
        <div className="mt-1 pt-1.5 border-t border-slate-800 flex flex-col gap-1">
          <div className="flex justify-between text-[9px] text-slate-400 font-bold">
            <span>0</span>
            <span>200</span>
            <span>400</span>
            <span>600</span>
            <span>800</span>
            <span>1000+ Km</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded flex overflow-hidden border border-slate-700">
            <div className="w-1/5 bg-sky-400" />
            <div className="w-1/5 bg-slate-900" />
            <div className="w-1/5 bg-sky-400" />
            <div className="w-1/5 bg-slate-900" />
            <div className="w-1/5 bg-amber-400" />
          </div>
        </div>
      </div>

      {/* Layer Controls Component */}
      <MapLayerControls
        layers={state.mapLayers}
        onToggleLayer={handleToggleLayer}
        sarAvailable={state.sentinel1ImageAvailable}
        sarProvenance="RECENT"
        hasScenarioRoute={!!state.activeWhatIfResult?.scenario_optimization}
      />

      {/* Map Legend Overlay Component */}
      <MapLegend />
    </div>
  );
};
