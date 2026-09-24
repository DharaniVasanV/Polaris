import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { PolarisAppState, MapLayerState } from '../../types/state';
import { BASELINE_ENVIRONMENT_GRID } from '../../data/baselineEnvironment';
import { applyScenarioToEnvironment } from '../../simulation/scenarioEngine';
import { evaluateCellRisk } from '../../simulation/riskEngine';
import { polarisStore } from '../../store/polarisStore';
import { haversineDistanceNm, haversineDistanceKm, calculateBearing } from '../../utils/geo';
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
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Navigation,
  Maximize2,
  Minimize2,
  Ruler,
  Compass,
  Layers,
} from 'lucide-react';

interface LeafletMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({ state, width = '100%', height = '100%' }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Real-time Mouse / Touch Coordinate Tracker state
  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Measurement Tool state
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureDistanceNm, setMeasureDistanceNm] = useState<number>(0);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Layer groups references attached to strict Z-index panes
  const layerGroupsRef = useRef<{
    tileLayer?: L.TileLayer;
    graticuleGroup?: L.LayerGroup;
    sarOverlay?: L.ImageOverlay;
    seaIceGroup?: L.LayerGroup;
    riskGroup?: L.LayerGroup;
    noGoGroup?: L.LayerGroup;
    icebergTrackGroup?: L.LayerGroup;
    uncertaintyGroup?: L.LayerGroup;
    routeGroup?: L.LayerGroup;
    vesselGroup?: L.LayerGroup;
    destinationGroup?: L.LayerGroup;
    measureGroup?: L.LayerGroup;
  }>({});

  const measurePointsRef = useRef<L.LatLng[]>([]);
  measurePointsRef.current = measurePoints;

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Single source of truth vessel coordinates
    const vLat = state.departureLocation?.latitude ?? -66.5;
    const vLon = state.departureLocation?.longitude ?? 25.0;

    // Initial Center: Antarctic corridor centered at [-67.5, 25.0]
    const map = L.map(mapContainerRef.current, {
      center: [-67.5, 25.0],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
    });

    // Create Strict Visual Layer Order Panes (Z-Index Hierarchy)
    // 1. Base Map (100) -> 2. Graticule (200) -> 3. Sentinel-1 (250) -> 4. Sea Ice (300)
    // 5. Fused Risk (350) -> 6. NO-GO (400) -> 7. Iceberg Tracks (450) -> 8. Uncertainty (480)
    // 9. Routes (500) -> 10. Vessel (600) -> 11. Destination/Stations (650)
    const panes = [
      { name: 'graticulePane', zIndex: 200 },
      { name: 'sarPane', zIndex: 250 },
      { name: 'seaIcePane', zIndex: 300 },
      { name: 'riskPane', zIndex: 350 },
      { name: 'noGoPane', zIndex: 400 },
      { name: 'icebergTrackPane', zIndex: 450 },
      { name: 'uncertaintyPane', zIndex: 480 },
      { name: 'routePane', zIndex: 500 },
      { name: 'vesselPane', zIndex: 600 },
      { name: 'destinationPane', zIndex: 650 },
      { name: 'measurePane', zIndex: 700 },
    ];

    panes.forEach(({ name, zIndex }) => {
      const pane = map.createPane(name);
      pane.style.zIndex = zIndex.toString();
    });

    // Base Tile Layer: High contrast Carto Light / Positron for scientific nautical display
    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; CartoDB &copy; OpenStreetMap &copy; POLARIS Antarctic Command',
    }).addTo(map);

    // Initialize Layer Groups attached to specific panes
    const graticuleGroup = L.layerGroup([], { pane: 'graticulePane' }).addTo(map);
    const seaIceGroup = L.layerGroup([], { pane: 'seaIcePane' }).addTo(map);
    const riskGroup = L.layerGroup([], { pane: 'riskPane' }).addTo(map);
    const noGoGroup = L.layerGroup([], { pane: 'noGoPane' }).addTo(map);
    const icebergTrackGroup = L.layerGroup([], { pane: 'icebergTrackPane' }).addTo(map);
    const uncertaintyGroup = L.layerGroup([], { pane: 'uncertaintyPane' }).addTo(map);
    const routeGroup = L.layerGroup([], { pane: 'routePane' }).addTo(map);
    const vesselGroup = L.layerGroup([], { pane: 'vesselPane' }).addTo(map);
    const destinationGroup = L.layerGroup([], { pane: 'destinationPane' }).addTo(map);
    const measureGroup = L.layerGroup([], { pane: 'measurePane' }).addTo(map);

    layerGroupsRef.current = {
      tileLayer,
      graticuleGroup,
      seaIceGroup,
      riskGroup,
      noGoGroup,
      icebergTrackGroup,
      uncertaintyGroup,
      routeGroup,
      vesselGroup,
      destinationGroup,
      measureGroup,
    };

    // Render Geographic Lat/Lon Graticule Lines & Labels
    renderGeographicGraticule(graticuleGroup);

    // Continuous Mouse Move Coordinate Readout
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    });

    // Click handler for Measurement Tool
    map.on('click', (e: L.LeafletMouseEvent) => {
      if ((window as any).__polaris_measuring) {
        const newPts = [...measurePointsRef.current, e.latlng];
        setMeasurePoints(newPts);
        renderMeasurementTool(measureGroup, newPts);
      }
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

  // ─── Function: Geographic Lat/Lon Graticule Lines & Dynamic Labels ────────
  const renderGeographicGraticule = (graticuleGroup: L.LayerGroup) => {
    graticuleGroup.clearLayers();

    // Latitudes: 60°S, 65°S, 70°S, 75°S, 80°S, 85°S
    const latitudes = [-60, -65, -70, -75, -80, -85];
    latitudes.forEach((lat) => {
      const linePts: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 2) {
        linePts.push([lat, lon]);
      }

      const isCircle = lat === -65 || lat === -66.5;
      const poly = L.polyline(linePts, {
        color: isCircle ? '#0284C7' : '#0369A1',
        weight: isCircle ? 1.4 : 0.9,
        dashArray: isCircle ? '6,4' : '3,4',
        opacity: 0.65,
        interactive: false,
      });
      graticuleGroup.addLayer(poly);

      // Latitude label at meridian intersections
      [-20, 0, 25, 50, 75].forEach((lLon) => {
        const lblMarker = L.marker([lat, lLon], {
          icon: L.divIcon({
            className: 'bg-transparent text-[10px] font-bold font-mono text-sky-700 drop-shadow-sm',
            html: `<span>${Math.abs(lat)}°S</span>`,
            iconSize: [45, 16],
            iconAnchor: [20, 8],
          }),
          interactive: false,
        });
        graticuleGroup.addLayer(lblMarker);
      });
    });

    // Longitudes: 0°, 30°E, 60°E, 90°E, 120°E, 150°E, 180°, 30°W, 60°W, 90°W, 120°W, 150°W
    const longitudes = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30];
    longitudes.forEach((lon) => {
      const linePts: [number, number][] = [];
      for (let lat = -55; lat >= -88; lat -= 1) {
        linePts.push([lat, lon]);
      }

      const poly = L.polyline(linePts, {
        color: '#0369A1',
        weight: 0.9,
        dashArray: '3,4',
        opacity: 0.55,
        interactive: false,
      });
      graticuleGroup.addLayer(poly);

      const lonStr = lon === 0 ? '0°' : lon === 180 ? '180°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
      const lblMarker = L.marker([-58, lon], {
        icon: L.divIcon({
          className: 'bg-transparent text-[10px] font-bold font-mono text-sky-800 drop-shadow-sm',
          html: `<span>${lonStr}</span>`,
          iconSize: [50, 16],
          iconAnchor: [25, 8],
        }),
        interactive: false,
      });
      graticuleGroup.addLayer(lblMarker);
    });
  };

  // ─── Function: Render Measurement Tool Polylines & Markers ────────────────
  const renderMeasurementTool = (measureGroup: L.LayerGroup, pts: L.LatLng[]) => {
    measureGroup.clearLayers();
    if (pts.length === 0) return;

    // Draw markers
    pts.forEach((pt, idx) => {
      const marker = L.circleMarker(pt, {
        radius: 5,
        color: '#D97706',
        fillColor: '#F59E0B',
        fillOpacity: 0.9,
      });
      marker.bindTooltip(`Point ${idx + 1}`, { permanent: true, direction: 'top' });
      measureGroup.addLayer(marker);
    });

    if (pts.length > 1) {
      const poly = L.polyline(pts, {
        color: '#D97706',
        weight: 3,
        dashArray: '6,6',
      });
      measureGroup.addLayer(poly);

      // Compute total distance
      let totNm = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        totNm += haversineDistanceNm(
          { latitude: pts[i].lat, longitude: pts[i].lng },
          { latitude: pts[i + 1].lat, longitude: pts[i + 1].lng }
        );
      }
      setMeasureDistanceNm(totNm);
    }
  };

  // 2. Render / Update All Layers on State Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups.seaIceGroup) return;

    const layers: MapLayerState = state.mapLayers;
    const timeHorizon = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 3: Sentinel-1 SAR Raster Overlay (Georeferenced to AOI)
    // ─────────────────────────────────────────────────────────────────────────
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

        const pol = state.sentinel1ImageMetadata?.polarization || 'HH+HV';
        const acq = state.sentinel1Data?.observation?.acquisition_time
          ? new Date(state.sentinel1Data.observation.acquisition_time).toISOString().replace('.000', '')
          : 'RECENT';

        sarOverlay.bindPopup(`
          <div class="p-1 font-sans text-xs">
            <div class="font-bold text-sky-600 font-mono flex items-center gap-1">
              <span>🛰 Sentinel-1 SAR Backscatter</span>
            </div>
            <div class="text-[11px] text-slate-700 mt-1">Polarization: ${pol}</div>
            <div class="text-[11px] text-slate-700">Acquisition: ${acq} (RECENT)</div>
            <div class="text-[10px] text-slate-500 mt-0.5">Georeferenced Sentinel Hub SAR Raster</div>
          </div>
        `);

        groups.sarOverlay = sarOverlay;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 4 & 5: Sea-Ice Concentration Grid & Fused Risk Heatmap Polygons
    // ─────────────────────────────────────────────────────────────────────────
    groups.seaIceGroup.clearLayers();
    groups.riskGroup?.clearLayers();
    groups.noGoGroup?.clearLayers();

    if (layers.seaIce || layers.noGoZones) {
      const threshold = state.vessel.safeSicThresholdPercent;

      for (let r = 0; r < envGrid.length - 1; r++) {
        for (let c = 0; c < envGrid[r].length - 1; c++) {
          const cell = envGrid[r][c];
          if (cell.isLand || cell.isIceShelf) continue;

          const sic = cell.sicValues[timeHorizon] ?? cell.sicValues[0];
          const risk = evaluateCellRisk(cell, timeHorizon, state.vessel, state.icebergs);

          // Real Leaflet Geographic Cell Rectangle Bounds
          const cellPolygonBounds: [number, number][] = [
            toLeafletLatLng(envGrid[r][c]),
            toLeafletLatLng(envGrid[r][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c]),
          ];

          // ───────────────────────────────────────────────────────────────────
          // LAYER 6: NO-GO Safety Engine Hazard Cells (Transparent Dark Red)
          // ───────────────────────────────────────────────────────────────────
          if (layers.noGoZones && risk.isNoGo) {
            const noGoPolygon = L.polygon(cellPolygonBounds, {
              pane: 'noGoPane',
              color: '#DC2626',
              weight: 1.5,
              fillColor: '#EF4444',
              fillOpacity: 0.35,
              dashArray: '4,4',
            });

            const hazardReason = risk.noGoReason || 'EXCESSIVE SEA ICE / HARD HAZARD';
            noGoPolygon.bindTooltip(
              `<b>⛔ NO-GO HAZARD ZONE</b><br/>Cell [${r},${c}]<br/>Hazard: ${hazardReason}<br/>SIC: ${sic.toFixed(0)}% | Risk Score: ${risk.totalRisk.toFixed(0)}/100`,
              { sticky: true }
            );
            groups.noGoGroup?.addLayer(noGoPolygon);
          }

          // Fused Risk Heatmap Polygons (Green -> Yellow -> Orange -> Red)
          if (layers.seaIce) {
            let fillColor = 'rgba(16, 185, 129, 0.18)'; // Green (Safe < 30)
            let fillOpacity = 0.22;

            if (risk.totalRisk >= 70 || sic >= threshold) {
              fillColor = 'rgba(239, 68, 68, 0.38)'; // Critical Red (>= 70)
              fillOpacity = 0.35;
            } else if (risk.totalRisk >= 50 || sic >= 50) {
              fillColor = 'rgba(249, 115, 22, 0.30)'; // Orange High (50-70)
              fillOpacity = 0.28;
            } else if (risk.totalRisk >= 30 || sic >= 25) {
              fillColor = 'rgba(245, 158, 11, 0.25)'; // Yellow Moderate (30-50)
              fillOpacity = 0.24;
            }

            const icePolygon = L.polygon(cellPolygonBounds, {
              pane: 'seaIcePane',
              color: 'rgba(15, 23, 42, 0.08)',
              weight: 0.5,
              fillColor,
              fillOpacity,
            });

            icePolygon.on('click', () => {
              polarisStore.inspectCell(r, c, timeHorizon);
            });

            icePolygon.bindTooltip(
              `Sea Ice: ${sic.toFixed(1)}% | Risk: ${risk.totalRisk.toFixed(0)}/100 | Cell [${r},${c}] (Lat: ${cell.latitude.toFixed(2)}°, Lon: ${cell.longitude.toFixed(2)}°)`,
              { sticky: true }
            );

            groups.seaIceGroup.addLayer(icePolygon);
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 7 & 8: Icebergs, Historical/Predicted Tracks & Uncertainty Circles
    // ─────────────────────────────────────────────────────────────────────────
    groups.icebergTrackGroup?.clearLayers();
    groups.uncertaintyGroup?.clearLayers();

    if (layers.icebergs && groups.icebergTrackGroup && groups.uncertaintyGroup) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isCritical = berg.riskLevel === 'CRITICAL';

        // Historical Track Line (Solid gray)
        if (layers.icebergForecast && berg.historicalTrack.length > 1) {
          const histLine = L.polyline(toLeafletLatLngs(berg.historicalTrack), {
            pane: 'icebergTrackPane',
            color: '#64748B',
            weight: 1.8,
            opacity: 0.7,
          });
          groups.icebergTrackGroup?.addLayer(histLine);
        }

        // Forecast Trajectory Line (+24h, Dashed cyan/amber)
        if (layers.icebergForecast && berg.forecastTrack.length > 1) {
          const fcstLine = L.polyline(toLeafletLatLngs(berg.forecastTrack), {
            pane: 'icebergTrackPane',
            color: isCritical ? '#D97706' : '#0284C7',
            weight: 2.2,
            dashArray: '5,5',
            opacity: 0.9,
          });
          groups.icebergTrackGroup?.addLayer(fcstLine);
        }

        // Expanding Uncertainty Circles (Real Lat/Lon geographic radius in meters)
        if (layers.icebergUncertainty) {
          berg.forecastTrack.forEach((pt) => {
            if (pt.horizonHours === 0) return;
            const radiusMeters = (pt.uncertaintyRadiusKm || 5) * 1000;
            const circle = L.circle(toLeafletLatLng(pt), {
              pane: 'uncertaintyPane',
              radius: radiusMeters,
              color: isB22 && pt.horizonHours >= 24 ? '#DC2626' : '#0284C7',
              fillColor: isB22 && pt.horizonHours >= 24 ? '#EF4444' : '#38BDF8',
              fillOpacity: 0.14,
              weight: 1.2,
              dashArray: '3,3',
            });

            circle.bindTooltip(
              `Forecast +${pt.horizonHours}h: ${berg.name} (Uncertainty Radius: ${pt.uncertaintyRadiusKm.toFixed(1)} km)`,
              { sticky: true }
            );

            groups.uncertaintyGroup?.addLayer(circle);
          });
        }

        // Current Iceberg Diamond Marker
        const bergMarker = L.marker(toLeafletLatLng(berg.currentPosition), {
          pane: 'icebergTrackPane',
          icon: createIcebergDivIcon(isCritical, berg.name),
        });

        const isAI = berg.modelSource === 'POLARIS_GRU_Neural_Network';
        bergMarker.bindPopup(`
          <div class="p-1.5 font-sans text-xs">
            <div class="font-bold text-sky-800 font-mono text-sm">${berg.name}</div>
            <div class="text-slate-700 mt-1">Risk Level: <span class="font-bold text-amber-600">${berg.riskLevel}</span></div>
            <div class="text-slate-700">Drift: ${berg.driftDirectionLabel} @ ${berg.speedKmh} km/h</div>
            <div class="text-slate-700">Dimensions: ${berg.lengthKm}x${berg.widthKm} km</div>
            <div class="text-[10px] text-sky-700 mt-1 font-mono">${isAI ? '🤖 POLARIS GRU Neural Forecast Engine' : 'Observed Satellite Data'}</div>
          </div>
        `);

        groups.icebergTrackGroup?.addLayer(bergMarker);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 9: Navigation Routes (Recommended, Alternative, Shortest, Counterfactual)
    // ─────────────────────────────────────────────────────────────────────────
    groups.routeGroup?.clearLayers();

    if (groups.routeGroup) {
      state.routes.forEach((route) => {
        if (route.type === 'SHORTEST_REJECTED' && !layers.shortestRoute) return;
        if (route.type === 'SAFE_A' && !layers.recommendedRoute) return;
        if (route.type === 'ALTERNATIVE_B' && !layers.alternativeRoute) return;

        const isSelected = route.id === state.selectedRouteId;
        const isRejected = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';

        let color = '#0284C7';
        let weight = isSelected ? 5.5 : 3.5;
        let dashArray: string | undefined = undefined;

        if (route.type === 'SAFE_A') {
          color = '#0284C7'; // Cyan/Blue Recommended Route
          weight = 6;
        } else if (route.type === 'ALTERNATIVE_B') {
          color = '#D97706'; // Amber Alternative Route
          dashArray = '6,6';
          weight = 4;
        } else if (isRejected) {
          color = '#64748B'; // Gray Shortest Route
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

        const distNm = route.metrics?.totalDistanceNm ?? 0;
        routeLine.bindTooltip(
          `<b>${route.title}</b><br/>Distance: ${distNm.toFixed(0)} NM<br/>Status: ${route.status}`,
          { sticky: true }
        );

        groups.routeGroup?.addLayer(routeLine);
      });

      // Counterfactual Route Layer (What-If Scenario Active)
      if (state.activeWhatIfResult?.scenario_optimization?.candidate_routes) {
        const opt = state.activeWhatIfResult.scenario_optimization;
        const candidates: any[] = opt.candidate_routes || [];
        const recRoute = candidates.find((c) => c.route_id === opt.recommended_route_id) || candidates[0];

        if (recRoute && recRoute.waypoints && recRoute.waypoints.length > 0) {
          const scenarioLine = L.polyline(toLeafletLatLngs(recRoute.waypoints), {
            pane: 'routePane',
            color: '#7C3AED', // Purple Counterfactual Route
            weight: 4.5,
            dashArray: '6,6',
            opacity: 0.95,
          });

          scenarioLine.bindTooltip(
            `<b>⚡ WHAT-IF SCENARIO COUNTERFACTUAL ROUTE</b><br/>Optimized under ${state.activeScenario?.title || 'Scenario'}`,
            { sticky: true }
          );

          groups.routeGroup?.addLayer(scenarioLine);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 10 & 11: Vessel, Destination & Research Base Station Markers
    // ─────────────────────────────────────────────────────────────────────────
    groups.vesselGroup?.clearLayers();
    groups.destinationGroup?.clearLayers();

    if (groups.vesselGroup && groups.destinationGroup) {
      // Single Source of Truth Vessel Coordinates
      const vLat = state.departureLocation?.latitude ?? -66.5;
      const vLon = state.departureLocation?.longitude ?? 25.0;
      const heading = (state.vessel as any).headingDegrees ?? 45;

      // Prominent Vessel Marker
      const vesselMarker = L.marker([vLat, vLon], {
        pane: 'vesselPane',
        icon: createVesselDivIcon(heading),
      });

      vesselMarker.bindTooltip(
        `<div class="font-mono text-xs"><b>VESSEL</b><br/>${vLat.toFixed(2)}°, ${vLon.toFixed(2)}°<br/><span class="text-[9px] text-amber-700">MANUAL / SIMULATED VESSEL POSITION</span></div>`,
        { permanent: true, direction: 'top', offset: [0, -20] }
      );

      vesselMarker.bindPopup(`
        <div class="p-1.5 font-sans text-xs">
          <div class="font-bold text-sky-800 font-mono text-sm">MV POLARIS EXPLORER</div>
          <div class="text-slate-700 mt-1">Ice Class: <span class="font-bold text-emerald-700">${state.vessel.iceClass}</span></div>
          <div class="text-slate-700 font-mono">Position: ${vLat.toFixed(4)}°S, ${vLon.toFixed(4)}°E</div>
          <div class="text-slate-700">Speed: ${state.vessel.nominalSpeedKnots} knots | Heading: ${heading}°</div>
          <div class="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 mt-1 inline-block">
            MANUAL / SIMULATED VESSEL POSITION
          </div>
        </div>
      `);

      groups.vesselGroup.addLayer(vesselMarker);

      // Destination Target Base Station Marker
      if (state.destinationLocation) {
        const dLat = state.destinationLocation.latitude;
        const dLon = state.destinationLocation.longitude;

        const destMarker = L.marker([dLat, dLon], {
          pane: 'destinationPane',
          icon: createDestinationDivIcon(),
        });

        const distNm = haversineDistanceNm({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });
        const bearing = calculateBearing({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });

        destMarker.bindPopup(`
          <div class="p-1.5 font-sans text-xs">
            <div class="font-bold text-amber-700 font-mono text-sm">DESTINATION TARGET</div>
            <div class="text-slate-800 mt-1 font-bold">${state.destinationLocation.name}</div>
            <div class="text-slate-700 font-mono">Lat: ${dLat.toFixed(4)}°, Lon: ${dLon.toFixed(4)}°</div>
            <div class="text-slate-700 mt-0.5">Distance from Vessel: <b>${distNm.toFixed(0)} NM</b> (${(distNm * 1.852).toFixed(0)} km)</div>
            <div class="text-slate-700">Initial Bearing: <b>${bearing.toFixed(0)}°</b></div>
          </div>
        `);

        groups.destinationGroup.addLayer(destMarker);
      }

      // Research Base Stations (Maitri, Bharati, Amundsen-Scott, McMurdo, Rothera, Halley)
      if (layers.researchStations && state.researchStations) {
        state.researchStations.forEach((st) => {
          const isIndian = st.country === 'India';
          const stMarker = L.marker(toLeafletLatLng(st.position), {
            pane: 'destinationPane',
            icon: createStationDivIcon(isIndian),
          });

          stMarker.bindPopup(`
            <div class="p-1.5 font-sans text-xs">
              <div class="font-bold ${isIndian ? 'text-amber-700' : 'text-slate-800'} font-mono">${st.name} Base Station</div>
              <div class="text-slate-700">Country: ${st.country}</div>
              <div class="text-slate-700">Access Risk: <span class="font-bold">${st.accessRiskLevel}</span></div>
            </div>
          `);

          groups.destinationGroup?.addLayer(stMarker);
        });
      }
    }
  }, [state]);

  // Toolbar Actions
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetView = () => mapInstanceRef.current?.flyTo([-67.5, 25.0], 4);
  const handleLocateVessel = () => {
    const vLat = state.departureLocation?.latitude ?? -66.5;
    const vLon = state.departureLocation?.longitude ?? 25.0;
    mapInstanceRef.current?.flyTo([vLat, vLon], 6);
  };

  const handleToggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleToggleMeasure = () => {
    const nextVal = !isMeasuring;
    setIsMeasuring(nextVal);
    (window as any).__polaris_measuring = nextVal;
    if (!nextVal) {
      setMeasurePoints([]);
      setMeasureDistanceNm(0);
      layerGroupsRef.current.measureGroup?.clearLayers();
    }
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
    <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-slate-900 flex items-center justify-center">
      {/* Real Leaflet Map Viewport */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ width, height }} />

      {/* Map Control Toolbar (Top-Left) */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5 bg-white/95 border border-slate-300 rounded-xl p-1.5 shadow-xl backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          title="Reset to Antarctic View"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sky-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={handleLocateVessel}
          title="Locate Vessel"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-emerald-700 transition-colors"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          onClick={handleToggleMeasure}
          title="Distance Measurement Tool"
          className={`p-2 rounded-lg transition-colors ${
            isMeasuring ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-amber-700'
          }`}
        >
          <Ruler className="w-4 h-4" />
        </button>
        <button
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Measurement Tool Active HUD */}
      {isMeasuring && (
        <div className="absolute top-4 left-16 z-[1000] bg-amber-900/90 border border-amber-500 rounded-xl px-3 py-1.5 text-white font-mono text-xs shadow-xl backdrop-blur-md flex items-center gap-3">
          <span>📏 Measuring: <b>{measureDistanceNm.toFixed(1)} NM</b> ({(measureDistanceNm * 1.852).toFixed(1)} km)</span>
          <button
            onClick={() => {
              setMeasurePoints([]);
              setMeasureDistanceNm(0);
              layerGroupsRef.current.measureGroup?.clearLayers();
            }}
            className="text-[10px] bg-amber-700 hover:bg-amber-600 px-2 py-0.5 rounded font-bold"
          >
            Clear
          </button>
        </div>
      )}

      {/* Continuous Live Coordinate Readout HUD (Bottom Bar) */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-300 rounded-xl p-3 shadow-xl backdrop-blur-md font-mono text-xs text-slate-800 flex flex-col gap-1 min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
          <span className="font-bold text-sky-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-700" />
            Antarctic Navigation Display
          </span>
          <span className="text-[9px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-bold border border-sky-300">
            WGS84 GEOGRAPHIC
          </span>
        </div>

        {cursorCoords ? (
          <>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-sans">Latitude:</span>
              <span className="font-bold text-sky-900">{Math.abs(cursorCoords.lat).toFixed(2)}°S</span>
            </div>

            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-sans">Longitude:</span>
              <span className="font-bold text-sky-900">
                {cursorCoords.lng >= 0 ? `${cursorCoords.lng.toFixed(2)}°E` : `${Math.abs(cursorCoords.lng).toFixed(2)}°W`}
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-200 pt-1 mt-0.5">
              <span>DMS Coordinates:</span>
              <span className="text-slate-700 font-bold">
                {formatDms(cursorCoords.lat, true)}, {formatDms(cursorCoords.lng, false)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-500 text-center py-1 text-[11px]">
            Hover mouse over map for continuous Lat/Lon readout
          </div>
        )}
      </div>

      {/* Map Layer Controls Component */}
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
