import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import 'proj4leaflet';
import { PolarisAppState, MapLayerState } from '../../types/state';
import { BASELINE_ENVIRONMENT_GRID } from '../../data/baselineEnvironment';
import { applyScenarioToEnvironment } from '../../simulation/scenarioEngine';
import { evaluateCellRisk } from '../../simulation/riskEngine';
import { polarisStore } from '../../store/polarisStore';
import {
  toLeafletLatLng,
  toLeafletLatLngs,
  bboxToLeafletBounds,
  createVesselDivIcon,
  createDestinationDivIcon,
  createIcebergDivIcon,
  createStationDivIcon,
} from '../../utils/leafletHelpers';
import { MapLayerControls } from './MapLayerControls';
import { MapLegend } from './MapLegend';

// ─── EPSG:3031 South Pole Stereographic Projection Setup ───────────────────
const proj4def =
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

const crs3031 = new (L as any).Proj.CRS('EPSG:3031', proj4def, {
  origin: [-4194304, 4194304],
  resolutions: [32768, 16384, 8192, 4096, 2048, 1024, 512, 256, 128, 64],
  bounds: L.bounds([-4194304, -4194304], [4194304, 4194304]),
});

interface LeafletMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({ state, width = '100%', height = '100%' }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Real-time Mouse Coordinate Tracker state
  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lng: number;
    distToSouthPoleKm: number;
    distToVesselKm: number;
  } | null>(null);

  // Layer groups references
  const layerGroupsRef = useRef<{
    tileLayer?: L.TileLayer;
    graticuleGroup?: L.LayerGroup;
    labelGroup?: L.LayerGroup;
    sarOverlay?: L.ImageOverlay;
    seaIceGroup?: L.LayerGroup;
    riskGroup?: L.LayerGroup;
    noGoGroup?: L.LayerGroup;
    icebergGroup?: L.LayerGroup;
    routeGroup?: L.LayerGroup;
    markerGroup?: L.LayerGroup;
  }>({});

  // 1. Initialize Leaflet Map Instance with EPSG:3031 Projection
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Initial Center: South Pole (-90°S) or Antarctic Corridor
    const initialLat = state.departureLocation?.latitude ?? -70.0;
    const initialLon = state.departureLocation?.longitude ?? 25.0;

    const map = L.map(mapContainerRef.current, {
      crs: crs3031,
      center: [initialLat, initialLon],
      zoom: 3,
      minZoom: 1,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: true,
    });

    // Add Zoom Control
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Create Custom Z-Index Panes for visual hierarchy
    const panes = [
      { name: 'graticulePane', zIndex: 200 },
      { name: 'sarPane', zIndex: 250 },
      { name: 'seaIcePane', zIndex: 300 },
      { name: 'riskPane', zIndex: 350 },
      { name: 'noGoPane', zIndex: 400 },
      { name: 'icebergPane', zIndex: 450 },
      { name: 'routePane', zIndex: 500 },
      { name: 'markerPane', zIndex: 600 },
      { name: 'labelPane', zIndex: 650 },
    ];

    panes.forEach(({ name, zIndex }) => {
      const pane = map.createPane(name);
      pane.style.zIndex = zIndex.toString();
    });

    // Basemap: Standard OpenStreetMap tile fallback with polar reprojection
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; NASA GIBS / SCAR / OpenStreetMap',
    }).addTo(map);

    // Initialize Layer Groups attached to specific panes
    const graticuleGroup = L.layerGroup([], { pane: 'graticulePane' }).addTo(map);
    const labelGroup = L.layerGroup([], { pane: 'labelPane' }).addTo(map);
    const seaIceGroup = L.layerGroup([], { pane: 'seaIcePane' }).addTo(map);
    const riskGroup = L.layerGroup([], { pane: 'riskPane' }).addTo(map);
    const noGoGroup = L.layerGroup([], { pane: 'noGoPane' }).addTo(map);
    const icebergGroup = L.layerGroup([], { pane: 'icebergPane' }).addTo(map);
    const routeGroup = L.layerGroup([], { pane: 'routePane' }).addTo(map);
    const markerGroup = L.layerGroup([], { pane: 'markerPane' }).addTo(map);

    layerGroupsRef.current = {
      tileLayer,
      graticuleGroup,
      labelGroup,
      seaIceGroup,
      riskGroup,
      noGoGroup,
      icebergGroup,
      routeGroup,
      markerGroup,
    };

    // Render Antarctic Polar Graticule (Circles & Meridians)
    renderAntarcticGraticule(graticuleGroup, labelGroup);

    // Real-Time Mouse Move Coordinate Tracker
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;

      // Calculate distance to South Pole (-90, 0) in Km using haversine formula
      const distToSouthPoleKm = Math.abs(lat - (-90)) * 111.139;

      // Calculate distance to active vessel
      const vLat = state.departureLocation?.latitude ?? -66.5;
      const vLon = state.departureLocation?.longitude ?? 25.0;
      const dLat = (lat - vLat) * (Math.PI / 180);
      const dLon = (lng - vLon) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(vLat * (Math.PI / 180)) *
          Math.cos(lat * (Math.PI / 180)) *
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
    });

    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ─── Function to Render Concentric Polar Graticule (Lat/Lon Rings) ────────
  const renderAntarcticGraticule = (graticuleGroup: L.LayerGroup, labelGroup: L.LayerGroup) => {
    graticuleGroup.clearLayers();
    labelGroup.clearLayers();

    // 1. Concentric Latitude Rings (60°S, 70°S, 80°S, Antarctic Circle 66.56°S)
    const latRings = [
      { lat: -60, label: '60° S', dash: undefined, color: '#38BDF8', opacity: 0.5, weight: 1.5 },
      { lat: -66.562, label: "Antarctic Circle (66°34' S)", dash: '6,6', color: '#F59E0B', opacity: 0.8, weight: 2 },
      { lat: -70, label: '70° S', dash: undefined, color: '#38BDF8', opacity: 0.4, weight: 1 },
      { lat: -80, label: '80° S', dash: undefined, color: '#38BDF8', opacity: 0.4, weight: 1 },
    ];

    latRings.forEach((ring) => {
      const circlePts: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 2) {
        circlePts.push([ring.lat, lon]);
      }

      const poly = L.polyline(circlePts, {
        color: ring.color,
        weight: ring.weight,
        dashArray: ring.dash,
        opacity: ring.opacity,
        interactive: false,
      });
      graticuleGroup.addLayer(poly);

      // Add text label along ring
      const labelMarker = L.marker([ring.lat, 0], {
        icon: L.divIcon({
          className: 'bg-transparent text-[10px] font-bold font-mono tracking-widest text-sky-400 drop-shadow',
          html: `<span style="color: ${ring.color}; opacity: 0.9;">${ring.label}</span>`,
          iconSize: [120, 20],
          iconAnchor: [-10, 10],
        }),
        interactive: false,
      });
      labelGroup.addLayer(labelMarker);
    });

    // 2. Radial Longitude Meridians (0°, 90°E, 180°, 90°W, etc.)
    const meridians = [0, 45, 90, 135, 180, -135, -90, -45];
    meridians.forEach((lon) => {
      const linePts: [number, number][] = [
        [-90, lon],
        [-50, lon],
      ];

      const poly = L.polyline(linePts, {
        color: '#38BDF8',
        weight: 1,
        dashArray: '3,3',
        opacity: 0.35,
        interactive: false,
      });
      graticuleGroup.addLayer(poly);

      const lonLabel = lon === 0 ? '0° (Prime)' : lon === 180 ? '180°' : lon > 0 ? `${lon}° E` : `${Math.abs(lon)}° W`;
      const labelMarker = L.marker([-55, lon], {
        icon: L.divIcon({
          className: 'bg-transparent text-[10px] font-bold font-mono text-cyan-300 drop-shadow',
          html: `<span>${lonLabel}</span>`,
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        }),
        interactive: false,
      });
      labelGroup.addLayer(labelMarker);
    });

    // 3. Geographic Region Text Labels matching reference image
    const regions = [
      { name: 'SOUTHERN OCEAN', lat: -58.0, lon: 0.0, color: '#38BDF8', size: 'text-sm font-black' },
      { name: 'SOUTHERN OCEAN', lat: -58.0, lon: 180.0, color: '#38BDF8', size: 'text-sm font-black' },
      { name: 'SOUTHERN OCEAN', lat: -58.0, lon: 90.0, color: '#38BDF8', size: 'text-sm font-black' },
      { name: 'SOUTHERN OCEAN', lat: -58.0, lon: -90.0, color: '#38BDF8', size: 'text-sm font-black' },
      { name: 'WEDDELL SEA', lat: -74.0, lon: -40.0, color: '#60A5FA', size: 'text-xs font-bold' },
      { name: 'ROSS SEA', lat: -76.0, lon: 175.0, color: '#60A5FA', size: 'text-xs font-bold' },
      { name: 'AMUNDSEN SEA', lat: -72.0, lon: -110.0, color: '#60A5FA', size: 'text-xs font-bold' },
      { name: 'BELLINGSHAUSEN SEA', lat: -71.0, lon: -85.0, color: '#60A5FA', size: 'text-xs font-bold' },
      { name: 'EAST ANTARCTICA', lat: -78.0, lon: 75.0, color: '#94A3B8', size: 'text-xs font-bold' },
      { name: 'WEST ANTARCTICA', lat: -78.0, lon: -105.0, color: '#94A3B8', size: 'text-xs font-bold' },
      { name: 'ANTARCTIC PENINSULA', lat: -68.0, lon: -65.0, color: '#CBD5E1', size: 'text-[11px] font-bold' },
      { name: 'SOUTH POLE (-90°S)', lat: -90.0, lon: 0.0, color: '#EF4444', size: 'text-xs font-black' },
    ];

    regions.forEach((r) => {
      const regMarker = L.marker([r.lat, r.lon], {
        icon: L.divIcon({
          className: `bg-transparent font-sans tracking-widest uppercase drop-shadow-md whitespace-nowrap ${r.size}`,
          html: `<span style="color: ${r.color}; opacity: 0.9;">${r.name}</span>`,
          iconSize: [180, 24],
          iconAnchor: [90, 12],
        }),
        interactive: false,
      });
      labelGroup.addLayer(regMarker);
    });
  };

  // 2. Render / Update All Layers on State Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups.seaIceGroup) return;

    const layers: MapLayerState = state.mapLayers;
    const timeHorizon = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // LAYER A: Sentinel-1 SAR Raster Overlay
    if (groups.sarOverlay) {
      map.removeLayer(groups.sarOverlay);
      groups.sarOverlay = undefined;
    }

    if (layers.sentinel1Sar && state.sentinel1ImageAvailable && state.sentinel1ImageUrl) {
      const bbox = state.sentinel1ImageBbox || state.sentinel1ImageMetadata?.image_bbox;
      if (bbox) {
        const bounds = bboxToLeafletBounds(bbox);
        const sarOverlay = L.imageOverlay(state.sentinel1ImageUrl, bounds, {
          pane: 'sarPane',
          opacity: state.sentinel1Opacity ?? 0.70,
          interactive: true,
        }).addTo(map);

        groups.sarOverlay = sarOverlay;
      }
    }

    // LAYER B: Sea-Ice Concentration Grid & Hard NO-GO Zones
    groups.seaIceGroup.clearLayers();
    groups.noGoGroup?.clearLayers();

    if (layers.seaIce || layers.noGoZones) {
      const threshold = state.vessel.safeSicThresholdPercent;

      for (let r = 0; r < envGrid.length - 1; r++) {
        for (let c = 0; c < envGrid[r].length - 1; c++) {
          const cell = envGrid[r][c];
          if (cell.isLand || cell.isIceShelf) continue;

          const sic = cell.sicValues[timeHorizon] ?? cell.sicValues[0];
          const risk = evaluateCellRisk(cell, timeHorizon, state.vessel, state.icebergs);

          const cellPolygonBounds: [number, number][] = [
            toLeafletLatLng(envGrid[r][c]),
            toLeafletLatLng(envGrid[r][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c]),
          ];

          if (layers.noGoZones && risk.isNoGo) {
            const noGoPolygon = L.polygon(cellPolygonBounds, {
              pane: 'noGoPane',
              color: '#EF4444',
              weight: 1.5,
              fillColor: '#EF4444',
              fillOpacity: 0.30,
              dashArray: '3,3',
            });
            noGoPolygon.bindTooltip(
              `NO-GO HAZARD ZONE | Cell [${r},${c}] | SIC: ${sic.toFixed(0)}% | Risk: ${risk.totalRisk.toFixed(0)}/100`,
              { sticky: true }
            );
            groups.noGoGroup?.addLayer(noGoPolygon);
          }

          if (layers.seaIce && sic >= 10) {
            let fillColor = 'rgba(6, 182, 212, 0.15)';
            let fillOpacity = 0.35;

            if (sic >= threshold) {
              fillColor = 'rgba(239, 68, 68, 0.40)';
            } else if (sic >= 50) {
              fillColor = 'rgba(245, 158, 11, 0.30)';
            } else if (sic >= 25) {
              fillColor = 'rgba(14, 116, 144, 0.25)';
            }

            const icePolygon = L.polygon(cellPolygonBounds, {
              pane: 'seaIcePane',
              color: 'rgba(255, 255, 255, 0.05)',
              weight: 0.5,
              fillColor,
              fillOpacity,
            });

            icePolygon.on('click', () => {
              polarisStore.inspectCell(r, c, timeHorizon);
            });

            icePolygon.bindTooltip(
              `Sea Ice: ${sic.toFixed(1)}% | Cell [${r},${c}] (Lat: ${cell.latitude.toFixed(2)}°, Lon: ${cell.longitude.toFixed(2)}°)`,
              { sticky: true }
            );

            groups.seaIceGroup.addLayer(icePolygon);
          }
        }
      }
    }

    // LAYER C: Icebergs, Tracks & Uncertainty Corridors
    groups.icebergGroup?.clearLayers();

    if (layers.icebergs && groups.icebergGroup) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isCritical = berg.riskLevel === 'CRITICAL';

        if (layers.icebergForecast && berg.historicalTrack.length > 1) {
          const histLine = L.polyline(toLeafletLatLngs(berg.historicalTrack), {
            pane: 'icebergPane',
            color: '#94A3B8',
            weight: 1.5,
            opacity: 0.6,
          });
          groups.icebergGroup?.addLayer(histLine);
        }

        if (layers.icebergForecast && berg.forecastTrack.length > 1) {
          const fcstLine = L.polyline(toLeafletLatLngs(berg.forecastTrack), {
            pane: 'icebergPane',
            color: isCritical ? '#F59E0B' : '#06B6D4',
            weight: 2,
            dashArray: '4,4',
            opacity: 0.85,
          });
          groups.icebergGroup?.addLayer(fcstLine);
        }

        if (layers.icebergUncertainty) {
          berg.forecastTrack.forEach((pt) => {
            if (pt.horizonHours === 0) return;
            const radiusMeters = (pt.uncertaintyRadiusKm || 5) * 1000;
            const circle = L.circle(toLeafletLatLng(pt), {
              pane: 'icebergPane',
              radius: radiusMeters,
              color: isB22 && pt.horizonHours >= 24 ? '#EF4444' : '#06B6D4',
              fillColor: isB22 && pt.horizonHours >= 24 ? '#EF4444' : '#06B6D4',
              fillOpacity: 0.12,
              weight: 1,
              dashArray: '2,3',
            });
            groups.icebergGroup?.addLayer(circle);
          });
        }

        const bergMarker = L.marker(toLeafletLatLng(berg.currentPosition), {
          pane: 'icebergPane',
          icon: createIcebergDivIcon(isCritical, berg.name),
        });

        groups.icebergGroup?.addLayer(bergMarker);
      });
    }

    // LAYER D: Navigation Routes
    groups.routeGroup?.clearLayers();

    if (groups.routeGroup) {
      state.routes.forEach((route) => {
        if (route.type === 'SHORTEST_REJECTED' && !layers.shortestRoute) return;
        if (route.type === 'SAFE_A' && !layers.recommendedRoute) return;
        if (route.type === 'ALTERNATIVE_B' && !layers.alternativeRoute) return;

        const isSelected = route.id === state.selectedRouteId;
        const isRejected = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';

        let color = route.color || '#06B6D4';
        let weight = isSelected ? 5.5 : 3.5;
        let dashArray: string | undefined = undefined;

        if (route.type === 'SAFE_A') {
          color = '#06B6D4';
          weight = 6;
        } else if (route.type === 'ALTERNATIVE_B') {
          color = '#F59E0B';
          dashArray = '6,6';
          weight = 4;
        } else if (isRejected) {
          color = '#64748B';
          dashArray = '4,4';
          weight = 3;
        }

        const routeLine = L.polyline(toLeafletLatLngs(route.waypoints), {
          pane: 'routePane',
          color,
          weight,
          dashArray,
          opacity: 0.95,
        });

        routeLine.on('click', () => {
          polarisStore.selectRoute(route.id);
        });

        groups.routeGroup?.addLayer(routeLine);
      });
    }

    // LAYER E: Vessel, Destination & Research Stations
    groups.markerGroup?.clearLayers();

    if (groups.markerGroup) {
      if (state.destinationLocation) {
        const destMarker = L.marker(toLeafletLatLng(state.destinationLocation), {
          pane: 'markerPane',
          icon: createDestinationDivIcon(),
        });
        groups.markerGroup.addLayer(destMarker);
      }

      if (state.departureLocation) {
        const heading = (state.vessel as any).headingDegrees ?? 45;
        const vesselMarker = L.marker(toLeafletLatLng(state.departureLocation), {
          pane: 'markerPane',
          icon: createVesselDivIcon(heading),
        });
        groups.markerGroup.addLayer(vesselMarker);
      }

      if (layers.researchStations && state.researchStations) {
        state.researchStations.forEach((st) => {
          const isIndian = st.country === 'India';
          const stMarker = L.marker(toLeafletLatLng(st.position), {
            pane: 'markerPane',
            icon: createStationDivIcon(isIndian),
          });
          groups.markerGroup?.addLayer(stMarker);
        });
      }
    }
  }, [state]);

  const handleToggleLayer = (layerKey: keyof MapLayerState) => {
    polarisStore.toggleMapLayer(layerKey);
  };

  // Helper to format degrees/minutes/seconds
  const formatDms = (deg: number, isLat: boolean) => {
    const absDeg = Math.abs(deg);
    const d = Math.floor(absDeg);
    const m = Math.floor((absDeg - d) * 60);
    const s = Math.round(((absDeg - d) * 60 - m) * 60);
    const dir = isLat ? (deg < 0 ? 'S' : 'N') : deg < 0 ? 'W' : 'E';
    return `${d}° ${m}' ${s}" ${dir}`;
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#060B14]">
      {/* Real Leaflet Polar Stereographic Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ width, height }} />

      {/* Real-Time Interactive Cursor Lat/Lon Tracker HUD */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-sky-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs text-slate-200 flex flex-col gap-1 min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
          <span className="font-bold text-sky-400 uppercase tracking-wider text-[10px]">
            🌐 Antarctic EPSG:3031 Coordinate HUD
          </span>
          <span className="text-[9px] bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded border border-sky-600/30">
            POLAR STEREOGRAPHIC
          </span>
        </div>

        {cursorCoords ? (
          <>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Position:</span>
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
            Hover mouse over map for coordinates & distances
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
