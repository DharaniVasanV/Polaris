import React, { useRef, useEffect, useState } from 'react';
import { PolarisAppState } from '../../types/state';
import { PolarMapRenderer } from './PolarMapRenderer';
import { GeoPoint, RouteWaypoint, Iceberg } from '../../types/domain';
import { mapToGeo, haversineDistanceKm } from '../../utils/geo';
import { formatCoordinates } from '../../utils/formatters';
import { polarisStore } from '../../store/polarisStore';

interface PolarMapProps {
  state: PolarisAppState;
  width?: number;
  height?: number;
}

export const PolarMap: React.FC<PolarMapProps> = ({ state, width = 1200, height = 700 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PolarMapRenderer | null>(null);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    geo: GeoPoint;
    label: string;
    subLabel?: string;
  } | null>(null);

  // Initialize and update renderer
  useEffect(() => {
    if (canvasRef.current) {
      if (rendererRef.current) {
        rendererRef.current.updateProps({ state });
      } else {
        rendererRef.current = new PolarMapRenderer(canvasRef.current, { state });
      }
    }
  }, [state]);

  // Clean up
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  // Handle canvas mouse move for interactive hover telemetry
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const geo = mapToGeo(mouseX, mouseY, canvasRef.current.width, canvasRef.current.height);

    // Check proximity to Icebergs
    for (const berg of state.icebergs) {
      const dist = haversineDistanceKm(geo, berg.currentPosition);
      if (dist < 35) {
        setHoverInfo({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          geo,
          label: `${berg.name} (Iceberg)`,
          subLabel: `Drift: ${berg.driftDirectionLabel} @ ${berg.speedKmh} km/h | Status: ${berg.riskLevel}`,
        });
        return;
      }
    }

    // Check proximity to Research Stations
    for (const st of state.researchStations) {
      const dist = haversineDistanceKm(geo, st.position);
      if (dist < 40) {
        setHoverInfo({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          geo,
          label: `${st.name} Station (${st.country})`,
          subLabel: `Access Risk: ${st.accessRiskLevel} | Elevation: ${st.elevationMeters}m`,
        });
        return;
      }
    }

    // Default geographic position
    if (geo.latitude <= -59 && geo.latitude >= -75 && geo.longitude >= -26 && geo.longitude <= 76) {
      setHoverInfo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        geo,
        label: formatCoordinates(geo),
        subLabel: `Antarctic Maritime Grid (Simulation: +${state.simulationTimeHours}h)`,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const geo = mapToGeo(mouseX, mouseY, canvasRef.current.width, canvasRef.current.height);

    // Check if clicked near an iceberg
    for (const berg of state.icebergs) {
      const dist = haversineDistanceKm(geo, berg.currentPosition);
      if (dist < 40) {
        polarisStore.addEventLog('ICEBERG', `Selected ${berg.name} for trajectory telemetry inspection.`, 'NORMAL');
        return;
      }
    }

    // Check if clicked near a route waypoint
    for (const route of state.routes) {
      for (const wp of route.waypoints) {
        const dist = haversineDistanceKm(geo, { latitude: wp.latitude, longitude: wp.longitude });
        if (dist < 30) {
          polarisStore.selectRoute(route.id);
          polarisStore.addEventLog('ROUTE', `Selected route candidate ${route.title}.`, 'NORMAL');
          return;
        }
      }
    }

    // Inspect grid cell if within polar domain
    if (geo.latitude <= -58.0 && geo.latitude >= -75.0 && geo.longitude >= -25.0 && geo.longitude <= 75.0) {
      const row = Math.max(0, Math.min(17, Math.round((-58.0 - geo.latitude) / 1.0)));
      const col = Math.max(0, Math.min(25, Math.round((geo.longitude - (-25.0)) / 4.0)));
      polarisStore.inspectCell(row, col, state.simulationTimeHours);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden flex items-center justify-center bg-[#060B14]">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        className="w-full h-full object-contain block bg-[#060B14] cursor-crosshair"
      />

      {/* Interactive Telemetry Hover Tooltip */}
      {hoverInfo && (
        <div
          className="absolute pointer-events-none z-30 px-3 py-2 rounded-lg bg-[#09111E]/95 border border-sky-400/50 shadow-2xl backdrop-blur-md text-[11px] text-white flex flex-col gap-0.5"
          style={{
            left: `${Math.min(hoverInfo.x + 15, (containerRef.current?.clientWidth || 800) - 220)}px`,
            top: `${Math.max(10, hoverInfo.y - 45)}px`,
          }}
        >
          <div className="font-bold text-sky-300 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            {hoverInfo.label}
          </div>
          {hoverInfo.subLabel && (
            <div className="text-[10px] text-slate-300">{hoverInfo.subLabel}</div>
          )}
        </div>
      )}
    </div>
  );
};
