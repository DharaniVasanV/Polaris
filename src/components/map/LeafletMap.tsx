import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
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

interface LeafletMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({ state, width = '100%', height = '100%' }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups references for dynamic updates
  const layerGroupsRef = useRef<{
    tileLayer?: L.TileLayer;
    sarOverlay?: L.ImageOverlay;
    seaIceGroup?: L.LayerGroup;
    riskGroup?: L.LayerGroup;
    noGoGroup?: L.LayerGroup;
    icebergGroup?: L.LayerGroup;
    routeGroup?: L.LayerGroup;
    markerGroup?: L.LayerGroup;
  }>({});

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Initial Center: Vessel location or Antarctic operational corridor [-66.5, 25.0]
    const initialLat = state.departureLocation?.latitude ?? -66.5;
    const initialLon = state.departureLocation?.longitude ?? 25.0;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    // Add standard Zoom control in top-left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Create Custom Z-Index Panes for strict visual layer hierarchy
    const panes = [
      { name: 'sarPane', zIndex: 250 },
      { name: 'seaIcePane', zIndex: 300 },
      { name: 'riskPane', zIndex: 350 },
      { name: 'noGoPane', zIndex: 400 },
      { name: 'icebergPane', zIndex: 450 },
      { name: 'routePane', zIndex: 500 },
      { name: 'markerPane', zIndex: 600 },
    ];

    panes.forEach(({ name, zIndex }) => {
      const pane = map.createPane(name);
      pane.style.zIndex = zIndex.toString();
    });

    // Add OpenStreetMap Standard Base Tile Layer with required attribution
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Initialize Layer Groups attached to specific panes
    const seaIceGroup = L.layerGroup([], { pane: 'seaIcePane' }).addTo(map);
    const riskGroup = L.layerGroup([], { pane: 'riskPane' }).addTo(map);
    const noGoGroup = L.layerGroup([], { pane: 'noGoPane' }).addTo(map);
    const icebergGroup = L.layerGroup([], { pane: 'icebergPane' }).addTo(map);
    const routeGroup = L.layerGroup([], { pane: 'routePane' }).addTo(map);
    const markerGroup = L.layerGroup([], { pane: 'markerPane' }).addTo(map);

    layerGroupsRef.current = {
      tileLayer,
      seaIceGroup,
      riskGroup,
      noGoGroup,
      icebergGroup,
      routeGroup,
      markerGroup,
    };

    mapInstanceRef.current = map;

    // Handle map container resize
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

  // 2. Render / Update All Layers on State Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups.seaIceGroup) return;

    const layers: MapLayerState = state.mapLayers;
    const timeHorizon = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER A: Sentinel-1 SAR Raster Overlay
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
            <div class="font-bold text-sky-400 font-mono flex items-center gap-1">
              <span>🛰 Sentinel-1 SAR Backscatter</span>
            </div>
            <div class="text-[11px] text-slate-300 mt-1">Polarization: ${pol}</div>
            <div class="text-[11px] text-slate-300">Acquisition: ${acq} (RECENT)</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Georeferenced Sentinel Hub SAR Raster</div>
          </div>
        `);

        groups.sarOverlay = sarOverlay;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER B: Sea-Ice Concentration Grid & Hard NO-GO Zones
    // ─────────────────────────────────────────────────────────────────────────
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

          // Grid cell rectangle bounds
          const cellPolygonBounds: [number, number][] = [
            toLeafletLatLng(envGrid[r][c]),
            toLeafletLatLng(envGrid[r][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c + 1]),
            toLeafletLatLng(envGrid[r + 1][c]),
          ];

          // Render NO-GO Zones
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

          // Render Sea Ice Concentration
          if (layers.seaIce && sic >= 10) {
            let fillColor = 'rgba(6, 182, 212, 0.15)'; // 10-25% Low
            let fillOpacity = 0.35;

            if (sic >= threshold) {
              fillColor = 'rgba(239, 68, 68, 0.40)'; // Critical > threshold
            } else if (sic >= 50) {
              fillColor = 'rgba(245, 158, 11, 0.30)'; // High 50-70%
            } else if (sic >= 25) {
              fillColor = 'rgba(14, 116, 144, 0.25)'; // Moderate 25-50%
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

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER C: Icebergs, Tracks & Uncertainty Corridors
    // ─────────────────────────────────────────────────────────────────────────
    groups.icebergGroup?.clearLayers();

    if (layers.icebergs && groups.icebergGroup) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isCritical = berg.riskLevel === 'CRITICAL';

        // 1. Historical Track Line
        if (layers.icebergForecast && berg.historicalTrack.length > 1) {
          const histLine = L.polyline(toLeafletLatLngs(berg.historicalTrack), {
            pane: 'icebergPane',
            color: '#94A3B8',
            weight: 1.5,
            opacity: 0.6,
          });
          groups.icebergGroup?.addLayer(histLine);
        }

        // 2. Forecast Trajectory Line
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

        // 3. Expanding Uncertainty Envelopes
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

            circle.bindTooltip(
              `Forecast +${pt.horizonHours}h: ${berg.name} (Uncertainty Radius: ${pt.uncertaintyRadiusKm.toFixed(1)} km)`,
              { sticky: true }
            );

            groups.icebergGroup?.addLayer(circle);
          });
        }

        // 4. Current Iceberg Marker
        const bergMarker = L.marker(toLeafletLatLng(berg.currentPosition), {
          pane: 'icebergPane',
          icon: createIcebergDivIcon(isCritical, berg.name),
        });

        const isAI = berg.modelSource === 'POLARIS_GRU_Neural_Network';
        bergMarker.bindPopup(`
          <div class="p-1.5 font-sans text-xs">
            <div class="font-bold text-cyan-400 font-mono text-sm">${berg.name}</div>
            <div class="text-slate-300 mt-1">Status: <span class="font-bold text-amber-300">${berg.riskLevel}</span></div>
            <div class="text-slate-300">Drift: ${berg.driftDirectionLabel} @ ${berg.speedKmh} km/h</div>
            <div class="text-slate-300">Dimensions: ${berg.lengthKm}x${berg.widthKm} km</div>
            <div class="text-[10px] text-sky-400/80 mt-1 font-mono">${isAI ? '🤖 POLARIS GRU Neural Forecast Engine' : 'Observed Satellite Data'}</div>
          </div>
        `);

        groups.icebergGroup?.addLayer(bergMarker);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER D: Navigation Routes (Recommended, Alternative, Shortest, Counterfactual)
    // ─────────────────────────────────────────────────────────────────────────
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
          color = '#06B6D4'; // Bright Cyan Recommended
          weight = 6;
        } else if (route.type === 'ALTERNATIVE_B') {
          color = '#F59E0B'; // Amber Alternative
          dashArray = '6,6';
          weight = 4;
        } else if (isRejected) {
          color = '#64748B'; // Gray Shortest
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

      // What-If Scenario Counterfactual Route Layer
      if (state.activeWhatIfResult?.scenario_optimization?.candidate_routes) {
        const opt = state.activeWhatIfResult.scenario_optimization;
        const candidates: any[] = opt.candidate_routes || [];
        const recRoute = candidates.find((c) => c.route_id === opt.recommended_route_id) || candidates[0];

        if (recRoute && recRoute.waypoints && recRoute.waypoints.length > 0) {
          const scenarioLine = L.polyline(toLeafletLatLngs(recRoute.waypoints), {
            pane: 'routePane',
            color: '#8B5CF6',
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
    // LAYER E: Vessel, Destination & Research Stations Markers
    // ─────────────────────────────────────────────────────────────────────────
    groups.markerGroup?.clearLayers();

    if (groups.markerGroup) {
      // 1. Destination Marker
      if (state.destinationLocation) {
        const destMarker = L.marker(toLeafletLatLng(state.destinationLocation), {
          pane: 'markerPane',
          icon: createDestinationDivIcon(),
        });

        destMarker.bindPopup(`
          <div class="p-1.5 font-sans text-xs">
            <div class="font-bold text-amber-400 font-mono text-sm">DESTINATION TARGET</div>
            <div class="text-slate-200 mt-1 font-bold">${state.destinationLocation.name}</div>
            <div class="text-slate-300">Lat: ${state.destinationLocation.latitude.toFixed(4)}°, Lon: ${state.destinationLocation.longitude.toFixed(4)}°</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Primary Indian Antarctic Research Base</div>
          </div>
        `);

        groups.markerGroup.addLayer(destMarker);
      }

      // 2. Vessel Marker
      if (state.departureLocation) {
        const heading = (state.vessel as any).headingDegrees ?? 45;
        const vesselMarker = L.marker(toLeafletLatLng(state.departureLocation), {
          pane: 'markerPane',
          icon: createVesselDivIcon(heading),
        });

        vesselMarker.bindPopup(`
          <div class="p-1.5 font-sans text-xs">
            <div class="font-bold text-sky-400 font-mono text-sm">MV POLARIS EXPLORER</div>
            <div class="text-slate-200 mt-1">Class: <span class="font-bold text-emerald-400">${state.vessel.iceClass}</span></div>
            <div class="text-slate-300">Position: ${state.departureLocation.latitude.toFixed(4)}°S, ${state.departureLocation.longitude.toFixed(4)}°E</div>
            <div class="text-slate-300">Speed: ${state.vessel.nominalSpeedKnots} knots | Heading: ${heading}°</div>
            <div class="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600/40 rounded px-1.5 py-0.5 mt-1 inline-block">
              MANUAL / SIMULATED VESSEL POSITION
            </div>
          </div>
        `);

        groups.markerGroup.addLayer(vesselMarker);
      }

      // 3. Research Stations Markers
      if (layers.researchStations && state.researchStations) {
        state.researchStations.forEach((st) => {
          const isIndian = st.country === 'India';
          const stMarker = L.marker(toLeafletLatLng(st.position), {
            pane: 'markerPane',
            icon: createStationDivIcon(isIndian),
          });

          stMarker.bindPopup(`
            <div class="p-1.5 font-sans text-xs">
              <div class="font-bold ${isIndian ? 'text-amber-400' : 'text-slate-300'} font-mono">${st.name} Station</div>
              <div class="text-slate-300">Country: ${st.country}</div>
              <div class="text-slate-300">Access Risk: <span class="font-bold">${st.accessRiskLevel}</span></div>
              <div class="text-slate-300">Elevation: ${st.elevationMeters} m</div>
            </div>
          `);

          groups.markerGroup?.addLayer(stMarker);
        });
      }
    }
  }, [state]);

  const handleToggleLayer = (layerKey: keyof MapLayerState) => {
    polarisStore.toggleMapLayer(layerKey);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#060B14]">
      {/* Real Leaflet Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ width, height }} />

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
