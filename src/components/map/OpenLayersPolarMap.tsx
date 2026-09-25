import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import ImageLayer from 'ol/layer/Image';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import CircleGeom from 'ol/geom/Circle';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style';
import { register } from 'ol/proj/proj4';
import { get as getProjection, transform } from 'ol/proj';
import proj4 from 'proj4';

import { PolarisAppState, MapLayerState } from '../../types/state';
import { BASELINE_ENVIRONMENT_GRID } from '../../data/baselineEnvironment';
import { applyScenarioToEnvironment } from '../../simulation/scenarioEngine';
import { evaluateCellRisk } from '../../simulation/riskEngine';
import { polarisStore } from '../../store/polarisStore';
import { haversineDistanceNm, calculateBearing } from '../../utils/geo';
import { AntarcticMapProvider, BasemapSourceType } from '../../services/antarcticMapProvider';
import { MapLayerControls } from './MapLayerControls';
import { MapLegend } from './MapLegend';
import {
  ZoomIn, ZoomOut, RotateCcw, Navigation,
  Maximize2, Minimize2, Ruler, Compass, Layers, HelpCircle, Globe,
} from 'lucide-react';

// ─── Register EPSG:3031 (WGS 84 / Antarctic Polar Stereographic) ───────────
proj4.defs(
  'EPSG:3031',
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
);
register(proj4);
const proj3031 = getProjection('EPSG:3031')!;
// Full BAS tile service extent in EPSG:3031
proj3031.setExtent([-4898635, -4898635, 4898635, 4898635]);

// ─── Geographic helper ────────────────────────────────────────────────────
// Convert lon/lat (EPSG:4326) → EPSG:3031 [x,y] at module level for extent calc
const _to3031 = (lon: number, lat: number): [number, number] =>
  transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];

// ─── Antarctic initial fit extent ──────────────────────────────────────
// Hardcoded EPSG:3031 extent that encompasses 55°S → 90°S (all longitudes).
// Using 55°S gives a generous Southern Ocean margin beyond the 60°S ring,
// ensuring the full peninsula, Ross Sea and Weddell Sea are visible.
// In EPSG:3031: 60°S ring radius ≈ 2,623,000 m; 55°S ring ≈ 3,333,000 m.
//
// The user-provided value [-3333134, -3333134, 3333134, 3333134] is correct.
// We expand by one step to [-3500000, -3500000, 3500000, 3500000] for padding.
const ANTARCTIC_FIT_EXTENT: [number, number, number, number] =
  [-3500000, -3500000, 3500000, 3500000];

// Helper: apply the initial fit with updateSize first so pixel dimensions
// reflect the actual container size after the dashboard layout is complete.
function fitAntarctica(map: Map) {
  map.updateSize();
  const size = map.getSize();
  map.getView().fit(ANTARCTIC_FIT_EXTENT, {
    size,
    padding: [40, 40, 40, 40],
    nearest: true,
    duration: 0,
  });
}

interface Props {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const OpenLayersPolarMap: React.FC<Props> = ({ state }) => {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [basemapType, setBasemapType] = useState<BasemapSourceType>('BAS_ANTARCTIC');
  const providerRef = useRef(new AntarcticMapProvider({ sourceType: 'BAS_ANTARCTIC' }));

  const [showLayerControls, setShowLayerControls] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureNm, setMeasureNm] = useState(0);

  // Layer sources
  const srcRef = useRef({
    oceanBg: new VectorSource(),    // Full-rectangle ocean fill (z-index 0)
    graticule: new VectorSource(),
    seaIce: new VectorSource(),
    risk: new VectorSource(),
    noGo: new VectorSource(),
    iceberg: new VectorSource(),
    uncertainty: new VectorSource(),
    route: new VectorSource(),
    vessel: new VectorSource(),
    dest: new VectorSource(),
    measure: new VectorSource(),
    basemapLayer: null as any,
    sarLayer: null as ImageLayer<ImageStatic> | null,
  });

  const measurePtsRef = useRef<number[][]>([]);

  const to3031 = (lon: number, lat: number): [number, number] =>
    transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];
  const fromProj = (x: number, y: number): [number, number] =>
    transform([x, y], 'EPSG:3031', 'EPSG:4326') as [number, number];

  // ─── 1. INIT MAP ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const s = srcRef.current;

    // ── LAYER 0: Full-Rectangle Southern Ocean Background ──────────────────
    // IMPORTANT: The BAS tile service has a circular raster coverage extent in
    // EPSG:3031. Where tiles have no data (the four rectangular corners), they
    // render transparent — this looks like CSS "circular clipping" but is actually
    // just the raster data boundary showing the container background color.
    // Fix: add a solid Southern Ocean color rectangle covering the full viewport
    // extent at z-index 0 so every pixel has the correct geographic ocean color.
    const OCEAN_COLOR = '#C4DDE8';
    const OCEAN_HALF = 6000000;
    const oceanRect = new Feature({
      geometry: new Polygon([[
        [-OCEAN_HALF, -OCEAN_HALF],
        [ OCEAN_HALF, -OCEAN_HALF],
        [ OCEAN_HALF,  OCEAN_HALF],
        [-OCEAN_HALF,  OCEAN_HALF],
        [-OCEAN_HALF, -OCEAN_HALF],
      ]]),
    });
    oceanRect.setStyle(new Style({ fill: new Fill({ color: OCEAN_COLOR }) }));
    s.oceanBg.addFeature(oceanRect);

    // Real BAS Antarctic basemap layer
    const basemapLayer = providerRef.current.createBasemapLayer();
    s.basemapLayer = basemapLayer;

    const map = new Map({
      target: mapDivRef.current,
      layers: [
        new VectorLayer({ source: s.oceanBg, zIndex: 0 }),
        basemapLayer,
        new VectorLayer({ source: s.graticule, zIndex: 3 }),
        new VectorLayer({ source: s.seaIce, zIndex: 5 }),
        new VectorLayer({ source: s.risk, zIndex: 6 }),
        new VectorLayer({ source: s.noGo, zIndex: 7 }),
        new VectorLayer({ source: s.iceberg, zIndex: 8 }),
        new VectorLayer({ source: s.uncertainty, zIndex: 9 }),
        new VectorLayer({ source: s.route, zIndex: 10 }),
        new VectorLayer({ source: s.vessel, zIndex: 11 }),
        new VectorLayer({ source: s.dest, zIndex: 12 }),
        new VectorLayer({ source: s.measure, zIndex: 13 }),
      ],
      view: new View({
        projection: 'EPSG:3031',
        center: [0, 0],
        zoom: 2,
        minZoom: 1,
        maxZoom: 9,
        extent: [-5200000, -5200000, 5200000, 5200000],
      }),
      controls: [],
    });

    drawGraticule(s.graticule);

    // ── FIT: Wait for the dashboard layout to settle before fitting ──────────
    // WHY: rendercomplete fires immediately after the first OL render, which
    // may happen before the React sidebar panels have finished their CSS layout.
    // If the map container pixel size is wrong at that moment, the fit() call
    // will produce the wrong zoom level (often zoomed too far in).
    // FIX: double requestAnimationFrame guarantees we run AFTER the browser
    // has completed both React render + CSS layout + paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAntarctica(map);
      });
    });

    // ── ResizeObserver: re-fit when the container is resized (e.g. sidebar toggle)
    const observer = new ResizeObserver(() => {
      if (!mapRef.current) return;
      mapRef.current.updateSize();
    });
    if (mapDivRef.current) observer.observe(mapDivRef.current);

    map.on('pointermove', (evt) => {
      const [lon, lat] = fromProj(evt.coordinate[0], evt.coordinate[1]);
      if (!isNaN(lat) && !isNaN(lon)) setCursorCoords({ lat, lon });
    });

    map.on('singleclick', (evt) => {
      if ((window as any).__pol_measuring) {
        const pts = [...measurePtsRef.current, evt.coordinate];
        measurePtsRef.current = pts;
        drawMeasure(s.measure, pts);
      }
    });

    mapRef.current = map;
    return () => { observer.disconnect(); map.setTarget(undefined); mapRef.current = null; };
  }, []);

  // ─── 2. GRATICULE ─────────────────────────────────────────────────────────
  const drawGraticule = (src: VectorSource) => {
    src.clear();

    // Latitude rings: 60°S … 85°S
    [-60, -65, -70, -75, -80, -85].forEach((lat) => {
      const ring: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 3) ring.push(to3031(lon, lat));
      const f = new Feature({ geometry: new Polygon([ring]) });
      f.setStyle(new Style({
        stroke: new Stroke({ color: 'rgba(2,132,199,0.55)', width: 1, lineDash: [4, 5] }),
      }));
      src.addFeature(f);

      // Lat label at 0° and 90°E
      [0, 90].forEach((llon) => {
        const lf = new Feature({ geometry: new Point(to3031(llon, lat)) });
        lf.setStyle(new Style({
          text: new Text({
            text: `${Math.abs(lat)}°S`,
            font: 'bold 10px "JetBrains Mono",monospace',
            fill: new Fill({ color: '#38BDF8' }),
            stroke: new Stroke({ color: '#000814', width: 2.5 }),
            offsetY: -8,
          }),
        }));
        src.addFeature(lf);
      });
    });

    // Longitude spokes: 0°, 30°E, 60°E, 90°E, 120°E, 150°E, 180°, and western equivalents
    [0, 30, 60, 90, 120, 150, 180, -30, -60, -90, -120, -150].forEach((lon) => {
      const spoke: [number, number][] = [];
      for (let lat = -90; lat <= -55; lat += 2) spoke.push(to3031(lon, lat));
      const f = new Feature({ geometry: new LineString(spoke) });
      f.setStyle(new Style({
        stroke: new Stroke({ color: 'rgba(2,132,199,0.45)', width: 0.8, lineDash: [3, 5] }),
      }));
      src.addFeature(f);

      // Meridian label at outer ring
      const lf = new Feature({ geometry: new Point(to3031(lon, -57)) });
      const txt = lon === 0 ? '0°' : lon === 180 ? '180°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
      lf.setStyle(new Style({
        text: new Text({
          text: txt,
          font: 'bold 10px "JetBrains Mono",monospace',
          fill: new Fill({ color: '#7DD3FC' }),
          stroke: new Stroke({ color: '#000814', width: 3 }),
        }),
      }));
      src.addFeature(lf);
    });
  };

  // ─── 3. MEASURE TOOL ──────────────────────────────────────────────────────
  const drawMeasure = (src: VectorSource, pts: number[][]) => {
    src.clear();
    pts.forEach((p, i) => {
      const f = new Feature({ geometry: new Point(p) });
      f.setStyle(new Style({
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#F59E0B' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
        text: new Text({ text: `P${i + 1}`, font: 'bold 9px monospace', fill: new Fill({ color: '#F59E0B' }), offsetY: -12 }),
      }));
      src.addFeature(f);
    });
    if (pts.length > 1) {
      const lf = new Feature({ geometry: new LineString(pts) });
      lf.setStyle(new Style({ stroke: new Stroke({ color: '#F59E0B', width: 2.5, lineDash: [6, 4] }) }));
      src.addFeature(lf);
      let nm = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [lon1, lat1] = fromProj(pts[i][0], pts[i][1]);
        const [lon2, lat2] = fromProj(pts[i + 1][0], pts[i + 1][1]);
        nm += haversineDistanceNm({ latitude: lat1, longitude: lon1 }, { latitude: lat2, longitude: lon2 });
      }
      setMeasureNm(nm);
    }
  };

  // ─── 4. POLARIS OVERLAYS ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const s = srcRef.current;
    if (!map) return;

    const ly: MapLayerState = state.mapLayers;
    const th = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // Sentinel-1 SAR — ONLY when checkbox ON
    if (s.sarLayer) { map.removeLayer(s.sarLayer); s.sarLayer = null; }
    if (ly.sentinel1Sar && state.sentinel1ImageAvailable && state.sentinel1ImageUrl) {
      const bbox = state.sentinel1ImageBbox || state.sentinel1ImageMetadata?.image_bbox;
      if (bbox) {
        const [x0, y0] = to3031(bbox.min_lon, bbox.min_lat);
        const [x1, y1] = to3031(bbox.max_lon, bbox.max_lat);
        const sar = new ImageLayer({
          source: new ImageStatic({
            url: state.sentinel1ImageUrl,
            projection: 'EPSG:3031',
            imageExtent: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
            crossOrigin: 'anonymous',
          }),
          opacity: state.sentinel1Opacity ?? 0.70,
          zIndex: 4,
        });
        map.addLayer(sar);
        s.sarLayer = sar;
      }
    }

    // Sea Ice & NO-GO
    s.seaIce.clear(); s.risk.clear(); s.noGo.clear();
    if (ly.seaIce || ly.noGoZones) {
      const thresh = state.vessel.safeSicThresholdPercent;
      for (let r = 0; r < envGrid.length - 1; r++) {
        for (let c = 0; c < envGrid[r].length - 1; c++) {
          const cell = envGrid[r][c];
          if (cell.isLand || cell.isIceShelf) continue;
          const sic = cell.sicValues[th] ?? cell.sicValues[0];
          const risk = evaluateCellRisk(cell, th, state.vessel, state.icebergs);
          const poly: [number, number][] = [
            to3031(envGrid[r][c].longitude, envGrid[r][c].latitude),
            to3031(envGrid[r][c + 1].longitude, envGrid[r][c + 1].latitude),
            to3031(envGrid[r + 1][c + 1].longitude, envGrid[r + 1][c + 1].latitude),
            to3031(envGrid[r + 1][c].longitude, envGrid[r + 1][c].latitude),
            to3031(envGrid[r][c].longitude, envGrid[r][c].latitude),
          ];

          if (ly.noGoZones && risk.isNoGo) {
            const f = new Feature({ geometry: new Polygon([poly]) });
            f.setStyle(new Style({ fill: new Fill({ color: 'rgba(220,38,38,0.30)' }), stroke: new Stroke({ color: '#DC2626', width: 1, lineDash: [4, 4] }) }));
            s.noGo.addFeature(f);
          }

          if (ly.seaIce) {
            let col = 'rgba(16,185,129,0.15)';
            if (risk.totalRisk >= 70 || sic >= thresh) col = 'rgba(239,68,68,0.35)';
            else if (risk.totalRisk >= 50 || sic >= 50) col = 'rgba(249,115,22,0.28)';
            else if (risk.totalRisk >= 30 || sic >= 25) col = 'rgba(245,158,11,0.22)';
            const f = new Feature({ geometry: new Polygon([poly]) });
            f.setStyle(new Style({ fill: new Fill({ color: col }), stroke: new Stroke({ color: 'rgba(255,255,255,0.04)', width: 0.3 }) }));
            s.seaIce.addFeature(f);
          }
        }
      }
    }

    // Icebergs
    s.iceberg.clear(); s.uncertainty.clear();
    if (ly.icebergs) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isCrit = berg.riskLevel === 'CRITICAL';

        if (ly.icebergForecast && berg.historicalTrack.length > 1) {
          const f = new Feature({ geometry: new LineString(berg.historicalTrack.map(p => to3031(p.longitude, p.latitude))) });
          f.setStyle(new Style({ stroke: new Stroke({ color: '#64748B', width: 1.5 }) }));
          s.iceberg.addFeature(f);
        }
        if (ly.icebergForecast && berg.forecastTrack.length > 1) {
          const f = new Feature({ geometry: new LineString(berg.forecastTrack.map(p => to3031(p.longitude, p.latitude))) });
          f.setStyle(new Style({ stroke: new Stroke({ color: isCrit ? '#F59E0B' : '#06B6D4', width: 2, lineDash: [5, 4] }) }));
          s.iceberg.addFeature(f);
        }
        if (ly.icebergUncertainty) {
          berg.forecastTrack.forEach(pt => {
            if (!pt.horizonHours) return;
            const f = new Feature({ geometry: new CircleGeom(to3031(pt.longitude, pt.latitude), (pt.uncertaintyRadiusKm || 5) * 1000) });
            f.setStyle(new Style({
              fill: new Fill({ color: isB22 && pt.horizonHours >= 24 ? 'rgba(239,68,68,0.15)' : 'rgba(6,182,212,0.08)' }),
              stroke: new Stroke({ color: isB22 && pt.horizonHours >= 24 ? '#EF4444' : '#0284C7', width: 1, lineDash: [3, 3] }),
            }));
            s.uncertainty.addFeature(f);
          });
        }

        const f = new Feature({ geometry: new Point(to3031(berg.currentPosition.longitude, berg.currentPosition.latitude)) });
        f.setStyle(new Style({
          image: new CircleStyle({ radius: isB22 ? 8 : 6, fill: new Fill({ color: isB22 ? '#EF4444' : '#38BDF8' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
          text: new Text({ text: berg.name, font: 'bold 9px "Inter",sans-serif', fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#000', width: 2.5 }), offsetX: 12, offsetY: -2 }),
        }));
        s.iceberg.addFeature(f);
      });
    }

    // Routes
    s.route.clear();
    state.routes.forEach((route) => {
      if (route.type === 'SHORTEST_REJECTED' && !ly.shortestRoute) return;
      if (route.type === 'SAFE_A' && !ly.recommendedRoute) return;
      if (route.type === 'ALTERNATIVE_B' && !ly.alternativeRoute) return;

      const isRej = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
      let col = '#0284C7'; let w = route.id === state.selectedRouteId ? 5.5 : 3.5; let dash: number[] | undefined;
      if (route.type === 'SAFE_A') { col = '#0284C7'; w = 5.5; }
      else if (route.type === 'ALTERNATIVE_B') { col = '#D97706'; w = 4; dash = [6, 6]; }
      else if (isRej) { col = '#64748B'; w = 3; dash = [4, 4]; }

      const f = new Feature({ geometry: new LineString(route.waypoints.map(wp => to3031(wp.longitude, wp.latitude))) });
      f.setStyle(new Style({ stroke: new Stroke({ color: col, width: w, lineDash: dash }) }));
      s.route.addFeature(f);
    });

    // What-If counterfactual route
    if (state.activeWhatIfResult?.scenario_optimization?.candidate_routes) {
      const opt = state.activeWhatIfResult.scenario_optimization;
      const cands: any[] = opt.candidate_routes || [];
      const rec = cands.find((c: any) => c.route_id === opt.recommended_route_id) || cands[0];
      if (rec?.waypoints?.length) {
        const f = new Feature({ geometry: new LineString(rec.waypoints.map((wp: any) => to3031(wp.longitude, wp.latitude))) });
        f.setStyle(new Style({ stroke: new Stroke({ color: '#7C3AED', width: 4.5, lineDash: [6, 6] }) }));
        s.route.addFeature(f);
      }
    }

    // Vessel
    s.vessel.clear();
    const vLat = state.departureLocation?.latitude ?? -63.0;
    const vLon = state.departureLocation?.longitude ?? 0.0;
    const vf = new Feature({ geometry: new Point(to3031(vLon, vLat)) });
    vf.setStyle(new Style({
      image: new CircleStyle({ radius: 9, fill: new Fill({ color: '#38BDF8' }), stroke: new Stroke({ color: '#fff', width: 2.5 }) }),
      text: new Text({
        text: `VESSEL\n${Math.abs(vLat).toFixed(3)}°S, ${vLon.toFixed(3)}°${vLon >= 0 ? 'E' : 'W'}\nMANUAL / SIMULATED`,
        font: 'bold 9px "JetBrains Mono",monospace',
        fill: new Fill({ color: '#38BDF8' }),
        stroke: new Stroke({ color: '#000814', width: 3 }),
        offsetY: -28,
      }),
    }));
    s.vessel.addFeature(vf);

    // Destination
    s.dest.clear();
    if (state.destinationLocation) {
      const dLat = state.destinationLocation.latitude;
      const dLon = state.destinationLocation.longitude;
      const distNm = haversineDistanceNm({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });
      const bearing = calculateBearing({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });
      const df = new Feature({ geometry: new Point(to3031(dLon, dLat)) });
      df.setStyle(new Style({
        image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#F59E0B' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
        text: new Text({
          text: `TARGET: ${state.destinationLocation.name}\n${distNm.toFixed(0)} NM @ ${bearing.toFixed(0)}°`,
          font: 'bold 9px "Inter",sans-serif',
          fill: new Fill({ color: '#FDE68A' }),
          stroke: new Stroke({ color: '#000814', width: 3 }),
          offsetY: 22,
        }),
      }));
      s.dest.addFeature(df);
    }
  }, [state]);

  // ─── 4b. BASEMAP SWITCH ───────────────────────────────────────────────────
  const switchBasemap = (type: BasemapSourceType) => {
    setBasemapType(type);
    setShowBasemapMenu(false);
    providerRef.current.setSourceType(type);
    const map = mapRef.current;
    const s = srcRef.current;
    if (map && s.basemapLayer) {
      map.removeLayer(s.basemapLayer);
      const newLayer = providerRef.current.createBasemapLayer();
      map.getLayers().insertAt(0, newLayer);
      s.basemapLayer = newLayer;
    }
  };

  const dms = (deg: number, isLat: boolean) => {
    const a = Math.abs(deg);
    const d = Math.floor(a); const m = Math.floor((a - d) * 60); const sec = Math.round(((a - d) * 60 - m) * 60);
    const dir = isLat ? (deg < 0 ? 'S' : 'N') : deg < 0 ? 'W' : 'E';
    return `${d}° ${m}' ${sec}" ${dir}`;
  };

  return (
    // No overflow-hidden, no border-radius — the map must be fully rectangular
    // Background is the ocean color (visible before OL renders and in corners)
    <div ref={wrapperRef} className="w-full h-full relative" style={{ background: '#C4DDE8' }}>
      {/* OpenLayers full-rectangle map canvas — background set to ocean color */}
      <div ref={mapDivRef} className="w-full h-full z-0" style={{ background: '#C4DDE8' }} />

      {/* ── Left Toolbar ── */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-md">
        {[
          { icon: <ZoomIn className="w-4 h-4" />, onClick: () => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() ?? 2) + 0.4), title: 'Zoom In', cls: 'text-sky-400' },
          { icon: <ZoomOut className="w-4 h-4" />, onClick: () => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() ?? 2) - 0.4), title: 'Zoom Out', cls: 'text-sky-400' },
          {
            icon: <RotateCcw className="w-4 h-4" />,
            onClick: () => {
              const m = mapRef.current;
              if (m) { m.updateSize(); m.getView().fit(ANTARCTIC_FIT_EXTENT, { size: m.getSize(), padding: [40, 40, 40, 40], nearest: true, duration: 700 }); }
            },
            title: 'Full Antarctica (55°S – 90°S)',
            cls: 'text-amber-400',
          },
          {
            icon: <Navigation className="w-4 h-4" />,
            onClick: () => {
              const vLat = state.departureLocation?.latitude ?? -63;
              const vLon = state.departureLocation?.longitude ?? 0;
              mapRef.current?.getView().animate({ center: to3031(vLon, vLat), zoom: 5, duration: 700 });
            },
            title: 'Locate Vessel',
            cls: 'text-emerald-400',
          },
          {
            icon: <Ruler className="w-4 h-4" />,
            onClick: () => {
              const next = !isMeasuring;
              setIsMeasuring(next);
              (window as any).__pol_measuring = next;
              if (!next) { measurePtsRef.current = []; setMeasureNm(0); srcRef.current.measure.clear(); }
            },
            title: 'Measure Distance',
            cls: isMeasuring ? 'text-white bg-amber-500 rounded-lg' : 'text-amber-400',
          },
          {
            icon: isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />,
            onClick: () => {
              if (!document.fullscreenElement) { wrapperRef.current?.requestFullscreen(); setIsFullscreen(true); }
              else { document.exitFullscreen(); setIsFullscreen(false); }
            },
            title: 'Fullscreen',
            cls: 'text-slate-300',
          },
        ].map((btn, idx) => (
          <button key={idx} onClick={btn.onClick} title={btn.title}
            className={`p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 transition-colors ${btn.cls}`}>
            {btn.icon}
          </button>
        ))}
      </div>

      {/* ── Right Controls ── */}
      <div className="absolute top-4 right-4 z-[1000] flex gap-2">
        {[
          { label: 'Basemap', icon: <Globe className="w-3.5 h-3.5" />, active: showBasemapMenu, onClick: () => { setShowBasemapMenu(v => !v); setShowLayerControls(false); setShowLegend(false); setShowDebug(false); } },
          { label: 'Layers', icon: <Layers className="w-3.5 h-3.5" />, active: showLayerControls, onClick: () => { setShowLayerControls(v => !v); setShowBasemapMenu(false); setShowLegend(false); setShowDebug(false); } },
          { label: 'Legend', icon: <HelpCircle className="w-3.5 h-3.5" />, active: showLegend, onClick: () => { setShowLegend(v => !v); setShowLayerControls(false); setShowBasemapMenu(false); setShowDebug(false); } },
          { label: 'Debug', icon: <Compass className="w-3.5 h-3.5" />, active: showDebug, onClick: () => { setShowDebug(v => !v); setShowLegend(false); setShowLayerControls(false); setShowBasemapMenu(false); } },
        ].map((btn, i) => (
          <button key={i} onClick={btn.onClick}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xl backdrop-blur-md flex items-center gap-1.5 ${
              btn.active ? 'bg-sky-600 border-sky-400 text-white' : 'bg-slate-900/90 border-slate-800 text-sky-400 hover:bg-slate-800/90'
            }`}>
            {btn.icon}<span>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* ── Quick Navigation Buttons ── */}
      <div className="absolute top-14 right-4 z-[1000] flex gap-2">
        <button
          onClick={() => {
            const m = mapRef.current;
            if (m) { m.updateSize(); m.getView().fit(ANTARCTIC_FIT_EXTENT, { size: m.getSize(), padding: [40, 40, 40, 40], nearest: true, duration: 600 }); }
          }}
          className="px-3 py-1 rounded-lg border border-amber-500/60 bg-amber-950/80 text-amber-300 text-[11px] font-bold hover:bg-amber-900/80 transition-colors shadow-xl backdrop-blur-md flex items-center gap-1.5"
          title="Fit full 55°S – 90°S Antarctica"
        >
          🌍 ANTARCTICA
        </button>
        <button
          onClick={() => {
            const vLat = state.departureLocation?.latitude ?? -63;
            const vLon = state.departureLocation?.longitude ?? 0;
            mapRef.current?.getView().animate({ center: to3031(vLon, vLat), zoom: 5, duration: 600 });
          }}
          className="px-3 py-1 rounded-lg border border-emerald-500/60 bg-emerald-950/80 text-emerald-300 text-[11px] font-bold hover:bg-emerald-900/80 transition-colors shadow-xl backdrop-blur-md flex items-center gap-1.5"
          title="Zoom to vessel position"
        >
          ⚓ ZOOM TO VESSEL
        </button>
      </div>

      {/* Basemap Menu */}
      {showBasemapMenu && (
        <div className="absolute top-14 right-4 z-[1000] w-[260px] bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 text-xs">
          <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800 pb-1">Antarctic Basemap — EPSG:3031</span>
          {([
            ['BAS_ANTARCTIC', '🗺️ BAS Antarctic & Southern Ocean', '(Real official basemap)'],
            ['NASA_GIBS_WMTS', '🌍 NASA GIBS Blue Marble', '(Bathymetry + hillshade)'],
            ['OFFLINE_VECTOR', '📡 Offline Mission Vector', '(No network required)'],
          ] as [BasemapSourceType, string, string][]).map(([type, label, sub]) => (
            <button key={type} onClick={() => switchBasemap(type)}
              className={`p-2 rounded-lg text-left transition-colors flex items-start gap-2 ${basemapType === type ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'}`}>
              <div>
                <div>{label}</div>
                <div className="text-[9px] opacity-70">{sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showLayerControls && (
        <div className="absolute top-14 right-4 z-[1000] max-w-xs">
          <MapLayerControls layers={state.mapLayers} onToggleLayer={(k) => polarisStore.toggleMapLayer(k)} sarAvailable={state.sentinel1ImageAvailable} sarProvenance="RECENT" hasScenarioRoute={!!state.activeWhatIfResult?.scenario_optimization} />
        </div>
      )}
      {showLegend && (
        <div className="absolute top-14 right-4 z-[1000] max-w-xs">
          <MapLegend />
        </div>
      )}

      {/* Debug overlay — shows coordinate pipeline values for alignment verification */}
      {showDebug && (() => {
        const vLat = state.departureLocation?.latitude ?? -63.0;
        const vLon = state.departureLocation?.longitude ?? 0.0;
        const [vx, vy] = to3031(vLon, vLat);
        const firstRoute = state.routes[0];
        const fp = firstRoute?.waypoints[0];
        const lp = firstRoute?.waypoints[firstRoute.waypoints.length - 1];
        const fpx = fp ? to3031(fp.longitude, fp.latitude) : null;
        const lpx = lp ? to3031(lp.longitude, lp.latitude) : null;
        const gridCell = (() => {
          const g = BASELINE_ENVIRONMENT_GRID;
          if (!g?.length || !g[0]?.length) return null;
          const r0 = g[0][0]; const rN = g[g.length - 1][g[0].length - 1];
          const [bx0, by0] = to3031(r0.longitude, r0.latitude);
          const [bx1, by1] = to3031(rN.longitude, rN.latitude);
          return { lat0: r0.latitude, lon0: r0.longitude, latN: rN.latitude, lonN: rN.longitude, x0: bx0.toFixed(0), y0: by0.toFixed(0), x1: bx1.toFixed(0), y1: by1.toFixed(0) };
        })();
        return (
          <div className="absolute top-14 right-4 z-[1100] w-[320px] bg-slate-950/98 border border-emerald-500/50 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-[10px] text-slate-300 flex flex-col gap-1.5">
            <div className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1 mb-0.5">🛠 Coordinate Pipeline Debug</div>

            {/* Live map view info */}
            {(() => {
              const m = mapRef.current;
              if (!m) return <div className="text-slate-500">Map not yet initialized</div>;
              const v = m.getView();
              const sz = m.getSize();
              const ext = v.calculateExtent(sz);
              const ctr = v.getCenter();
              const res = v.getResolution();
              return (
                <>
                  <div className="text-lime-300 font-bold">MAP CONTAINER SIZE</div>
                  <div>{sz ? `${sz[0]}×${sz[1]} px` : 'unknown'}</div>
                  <div className="text-lime-300 font-bold mt-1">VIEW CENTER (EPSG:3031)</div>
                  <div>X: {ctr ? ctr[0].toFixed(0) : '?'} m  Y: {ctr ? ctr[1].toFixed(0) : '?'} m</div>
                  <div className="text-lime-300 font-bold mt-1">VIEW RESOLUTION</div>
                  <div>{res ? res.toFixed(1) : '?'} m/px</div>
                  <div className="text-lime-300 font-bold mt-1">CURRENT EXTENT (EPSG:3031)</div>
                  <div>minX: {ext ? ext[0].toFixed(0) : '?'}</div>
                  <div>minY: {ext ? ext[1].toFixed(0) : '?'}</div>
                  <div>maxX: {ext ? ext[2].toFixed(0) : '?'}</div>
                  <div>maxY: {ext ? ext[3].toFixed(0) : '?'}</div>
                  <div className="text-lime-300 font-bold mt-1">TARGET EXTENT (EPSG:3031)</div>
                  <div>-3500000, -3500000, 3500000, 3500000</div>
                  <div className={`font-bold mt-0.5 ${ext && Math.abs(ext[0]) > 3000000 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {ext && Math.abs(ext[0]) > 3000000 ? '✓ Extent looks correct' : '✗ Extent too narrow — re-fit needed'}
                  </div>
                  <button onClick={() => { if (m) { m.updateSize(); m.getView().fit(ANTARCTIC_FIT_EXTENT, { size: m.getSize(), padding: [40,40,40,40], nearest: true, duration: 0 }); }}} className="mt-1 bg-lime-800 hover:bg-lime-700 text-lime-200 px-2 py-1 rounded font-bold text-[10px]">Force Re-fit Antarctica</button>
                </>
              );
            })()}

            <div className="border-t border-slate-800 mt-1 pt-1" />
            <div className="text-amber-300 font-bold">VESSEL (EPSG:4326)</div>
            <div>LAT: {vLat.toFixed(6)}°  LON: {vLon.toFixed(6)}°</div>
            <div className="text-amber-300 font-bold mt-1">VESSEL (EPSG:3031)</div>
            <div>X: {vx.toFixed(1)} m   Y: {vy.toFixed(1)} m</div>
            <div className="text-sky-300 font-bold mt-1">CURSOR (EPSG:4326)</div>
            <div>{cursorCoords ? `LAT: ${cursorCoords.lat.toFixed(5)}°  LON: ${cursorCoords.lon.toFixed(5)}°` : 'Move mouse over map'}</div>
            {fp && <>
              <div className="text-cyan-300 font-bold mt-1">ROUTE[0] FIRST WP (4326)</div>
              <div>LAT: {fp.latitude.toFixed(5)}  LON: {fp.longitude.toFixed(5)}</div>
              <div className="text-cyan-300 font-bold">ROUTE[0] FIRST WP (3031)</div>
              <div>X: {fpx![0].toFixed(1)}  Y: {fpx![1].toFixed(1)}</div>
              <div className="text-cyan-300 font-bold">ROUTE[0] LAST WP (3031)</div>
              <div>X: {lpx![0].toFixed(1)}  Y: {lpx![1].toFixed(1)}</div>
            </>}
            {gridCell && <>
              <div className="text-violet-300 font-bold mt-1">ENV GRID BOUNDS (4326)</div>
              <div>NW: ({gridCell.lat0}°, {gridCell.lon0}°)</div>
              <div>SE: ({gridCell.latN}°, {gridCell.lonN}°)</div>
              <div className="text-violet-300 font-bold">ENV GRID BOUNDS (3031)</div>
              <div>NW: ({gridCell.x0}, {gridCell.y0})</div>
              <div>SE: ({gridCell.x1}, {gridCell.y1})</div>
            </>}
            <div className="text-slate-500 text-[9px] mt-1 border-t border-slate-800 pt-1">
              All POLARIS overlays: EPSG:4326 → EPSG:3031 via ol/proj transform()
            </div>
          </div>
        );
      })()}

      {/* Measure HUD */}
      {isMeasuring && (
        <div className="absolute top-4 left-16 z-[1000] bg-amber-900/90 border border-amber-500 rounded-xl px-3 py-1.5 text-white font-mono text-xs shadow-xl backdrop-blur-md flex items-center gap-3">
          <span>📏 <b>{measureNm.toFixed(1)} NM</b> ({(measureNm * 1.852).toFixed(1)} km)</span>
          <button onClick={() => { measurePtsRef.current = []; setMeasureNm(0); srcRef.current.measure.clear(); }} className="text-[10px] bg-amber-700 hover:bg-amber-600 px-2 py-0.5 rounded font-bold">Clear</button>
        </div>
      )}

      {/* Live Coordinate HUD */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-sky-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs text-slate-200 min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
          <span className="font-bold text-sky-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />WGS 84 / Antarctic Polar Stereographic
          </span>
          <span className="text-[9px] bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded border border-sky-600/30">EPSG:3031</span>
        </div>
        {cursorCoords ? (
          <>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-slate-400">LAT</span>
              <span className="text-cyan-300 font-bold">{Math.abs(cursorCoords.lat).toFixed(3)}°{cursorCoords.lat < 0 ? 'S' : 'N'}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-slate-400">LON</span>
              <span className="text-cyan-300 font-bold">{Math.abs(cursorCoords.lon).toFixed(3)}°{cursorCoords.lon >= 0 ? 'E' : 'W'}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 border-t border-slate-800 pt-1 mt-0.5">
              <span>DMS</span>
              <span>{dms(cursorCoords.lat, true)}, {dms(cursorCoords.lon, false)}</span>
            </div>
          </>
        ) : (
          <div className="text-slate-500 text-center text-[11px] py-0.5">Move mouse over map for live coordinates</div>
        )}
      </div>
    </div>
  );
};
