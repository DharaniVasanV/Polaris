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
import { Style, Stroke, Fill, Circle as CircleStyle, Text, RegularShape } from 'ol/style';
import { register } from 'ol/proj/proj4';
import { get as getProjection, transform } from 'ol/proj';
import proj4 from 'proj4';

import { PolarisAppState, MapLayerState } from '../../types/state';
import { BASELINE_ENVIRONMENT_GRID, GRID_ROWS, GRID_COLS } from '../../data/baselineEnvironment';
import { applyScenarioToEnvironment } from '../../simulation/scenarioEngine';
import { evaluateCellRisk } from '../../simulation/riskEngine';
import { polarisStore } from '../../store/polarisStore';
import { haversineDistanceNm } from '../../utils/geo';
import { AntarcticMapProvider, BasemapSourceType } from '../../services/antarcticMapProvider';
import { MapLayerControls } from './MapLayerControls';
import { MapLegend } from './MapLegend';
import {
  ZoomIn, ZoomOut, RotateCcw, Navigation,
  Maximize2, Minimize2, Ruler, Compass, Layers, HelpCircle, Globe, X
} from 'lucide-react';

// ─── Register EPSG:3031 (WGS 84 / Antarctic Polar Stereographic) ───────────
proj4.defs(
  'EPSG:3031',
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
);
register(proj4);
const proj3031 = getProjection('EPSG:3031')!;
proj3031.setExtent([-4898635, -4898635, 4898635, 4898635]);

// ─── Geo projection helpers ──────────────────────────────────────────────
const to3031 = (lon: number, lat: number): [number, number] =>
  transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];

const fromProj = (x: number, y: number): [number, number] =>
  transform([x, y], 'EPSG:3031', 'EPSG:4326') as [number, number];

// ─── Antarctic Navigation Camera Boundary ─────────────────────────────────
const ANTARCTIC_NAV_EXTENT: [number, number, number, number] =
  [-3700000, -3700000, 3700000, 3700000];

const ANTARCTIC_MIN_ZOOM = 1;
const ANTARCTIC_MAX_ZOOM = 12;

function fitAntarctica(map: Map) {
  map.updateSize();
  const size = map.getSize();
  map.getView().fit(ANTARCTIC_NAV_EXTENT, {
    size,
    padding: [20, 20, 20, 20],
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

  // Selected cell popover state
  const [selectedCellInfo, setSelectedCellInfo] = useState<{ row: number; col: number; lat: number; lon: number } | null>(null);

  // Vector Sources
  const srcRef = useRef({
    oceanBg: new VectorSource(),
    graticule: new VectorSource(),
    seaIce: new VectorSource(),
    risk: new VectorSource(),
    noGo: new VectorSource(),
    iceberg: new VectorSource(),
    uncertainty: new VectorSource(),
    route: new VectorSource(),
    vessel: new VectorSource(),
    dest: new VectorSource(),
    selection: new VectorSource(),
    measure: new VectorSource(),
    basemapLayer: null as any,
    sarLayer: null as ImageLayer<ImageStatic> | null,
  });

  const measurePtsRef = useRef<number[][]>([]);

  // ─── 1. MAP INIT ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const s = srcRef.current;

    // Full-rectangle ocean background
    const OCEAN_COLOR = '#DCEAF0';
    const OCEAN_HALF = 8_500_000;
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
        new VectorLayer({ source: s.selection, zIndex: 10 }),
        new VectorLayer({ source: s.route, zIndex: 11 }),
        new VectorLayer({ source: s.vessel, zIndex: 12 }),
        new VectorLayer({ source: s.dest, zIndex: 13 }),
        new VectorLayer({ source: s.measure, zIndex: 14 }),
      ],
      view: new View({
        projection: 'EPSG:3031',
        center: [0, -500000],
        zoom: 2,
        minZoom: ANTARCTIC_MIN_ZOOM,
        maxZoom: ANTARCTIC_MAX_ZOOM,
        extent: ANTARCTIC_NAV_EXTENT,
        constrainOnlyCenter: false,
        smoothExtentConstraint: false,
        multiWorld: false,
      }),
      controls: [],
    });

    drawGraticule(s.graticule);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAntarctica(map);
      });
    });

    const observer = new ResizeObserver(() => {
      if (!mapRef.current) return;
      mapRef.current.updateSize();
    });
    if (mapDivRef.current) observer.observe(mapDivRef.current);

    map.on('pointermove', (evt) => {
      const [lon, lat] = fromProj(evt.coordinate[0], evt.coordinate[1]);
      if (!isNaN(lat) && !isNaN(lon)) setCursorCoords({ lat, lon });
    });

    // ── Single Click Event (MapInteractionController) ───────────────────────
    map.on('singleclick', (evt) => {
      if ((window as any).__pol_measuring) {
        const pts = [...measurePtsRef.current, evt.coordinate];
        measurePtsRef.current = pts;
        drawMeasure(s.measure, pts);
        return;
      }

      // Check if user clicked an iceberg marker first
      let clickedBergId: string | null = null;
      map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        const bergId = feature.get('icebergId');
        if (bergId) clickedBergId = bergId;
      });

      if (clickedBergId) {
        polarisStore.setSelectedIceberg(clickedBergId);
        return;
      }

      // Find nearest grid cell in model environment grid
      const [lon, lat] = fromProj(evt.coordinate[0], evt.coordinate[1]);
      const grid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, polarisStore.getState().activeScenario);

      let bestCell: any = null;
      let minSqDist = Infinity;

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cell = grid[r][c];
          const dLat = cell.latitude - lat;
          const dLon = cell.longitude - lon;
          const sqDist = dLat * dLat + dLon * dLon;
          if (sqDist < minSqDist) {
            minSqDist = sqDist;
            bestCell = cell;
          }
        }
      }

      // Hit tolerance check (approx 2.5 degrees lat/lon max distance)
      if (bestCell && minSqDist < 6.5) {
        polarisStore.inspectCell(bestCell.row, bestCell.col, polarisStore.getState().simulationTimeHours);
        setSelectedCellInfo({
          row: bestCell.row,
          col: bestCell.col,
          lat: bestCell.latitude,
          lon: bestCell.longitude,
        });

        // Draw selected cell highlight on selection vector source (2px royal blue outline + fill)
        s.selection.clear();
        const r = bestCell.row;
        const c = bestCell.col;
        if (r < grid.length - 1 && c < grid[r].length - 1) {
          const poly: [number, number][] = [
            to3031(grid[r][c].longitude,     grid[r][c].latitude),
            to3031(grid[r][c + 1].longitude, grid[r][c + 1].latitude),
            to3031(grid[r + 1][c + 1].longitude, grid[r + 1][c + 1].latitude),
            to3031(grid[r + 1][c].longitude, grid[r + 1][c].latitude),
            to3031(grid[r][c].longitude,     grid[r][c].latitude),
          ];
          const f = new Feature({ geometry: new Polygon([poly]) });
          f.setStyle(new Style({
            fill: new Fill({ color: 'rgba(65, 91, 177, 0.22)' }),
            stroke: new Stroke({ color: '#415BB1', width: 2.2 }),
          }));
          s.selection.addFeature(f);
        }
      } else {
        s.selection.clear();
        setSelectedCellInfo(null);
        polarisStore.clearCellInspection();
      }
    });

    mapRef.current = map;
    return () => {
      observer.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  // ─── 2. GRATICULE ────────────────────────────────────────────────────────
  const drawGraticule = (src: VectorSource) => {
    src.clear();
    const LATS = [-60, -70, -80, -90];
    const CLR = 'rgba(112, 151, 210, 0.35)';

    LATS.forEach((lat) => {
      const ring: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 5) ring.push(to3031(lon, lat));
      const f = new Feature({ geometry: new Polygon([ring]) });
      f.setStyle(new Style({
        stroke: new Stroke({ color: CLR, width: 1.0, lineDash: [6, 6] }),
      }));
      src.addFeature(f);
      if (lat !== -90) {
        const lf = new Feature({ geometry: new Point(to3031(0, lat)) });
        lf.setStyle(new Style({
          text: new Text({
            text: `${Math.abs(lat)}°S`,
            font: '10px "JetBrains Mono",monospace',
            fill: new Fill({ color: '#415BB1' }),
            stroke: new Stroke({ color: 'rgba(255,255,255,0.85)', width: 2 }),
            offsetY: -8,
          }),
        }));
        src.addFeature(lf);
      }
    });

    [0, 30, 60, 90, 120, 150, 180, -30, -60, -90, -120, -150].forEach((lon) => {
      const spoke: [number, number][] = [];
      for (let lat = -89.5; lat >= -58; lat -= 3) spoke.push(to3031(lon, lat));
      const f = new Feature({ geometry: new LineString(spoke) });
      f.setStyle(new Style({ stroke: new Stroke({ color: CLR, width: 1.0, lineDash: [4, 6] }) }));
      src.addFeature(f);
      if (lon % 30 === 0) {
        const txt = lon === 0 ? '0°' : lon === 180 ? '180°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
        const lf = new Feature({ geometry: new Point(to3031(lon, -58)) });
        lf.setStyle(new Style({
          text: new Text({
            text: txt,
            font: '9px "JetBrains Mono",monospace',
            fill: new Fill({ color: '#415BB1' }),
            stroke: new Stroke({ color: 'rgba(255,255,255,0.85)', width: 2 }),
          }),
        }));
        src.addFeature(lf);
      }
    });
  };

  // ─── 3. MEASURE TOOL ──────────────────────────────────────────────────────
  const drawMeasure = (src: VectorSource, pts: number[][]) => {
    src.clear();
    pts.forEach((p, i) => {
      const f = new Feature({ geometry: new Point(p) });
      f.setStyle(new Style({
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#D89B2B' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
        text: new Text({ text: `P${i + 1}`, font: 'bold 9px monospace', fill: new Fill({ color: '#D89B2B' }), offsetY: -12 }),
      }));
      src.addFeature(f);
    });
    if (pts.length > 1) {
      const lf = new Feature({ geometry: new LineString(pts) });
      lf.setStyle(new Style({ stroke: new Stroke({ color: '#D89B2B', width: 2, lineDash: [6, 4] }) }));
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

  // ─── 4. POLARIS OVERLAYS (NO GIANT CIRCLES!) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const s = srcRef.current;
    if (!map) return;

    const ly: MapLayerState = state.mapLayers;
    const th = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // ── Sentinel-1 SAR Overlay ──────────────────────────────────────────────
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
          opacity: Math.min(state.sentinel1Opacity ?? 0.52, 0.60),
          zIndex: 4,
        });
        map.addLayer(sar);
        s.sarLayer = sar;
      }
    }

    // ── Sea Ice & Risk Grid & NO-GO Zones (Cell-based, NO GIANT CIRCLES) ───
    s.seaIce.clear(); s.risk.clear(); s.noGo.clear();
    if (ly.seaIce || ly.noGoZones) {
      for (let r = 0; r < envGrid.length - 1; r++) {
        for (let c = 0; c < envGrid[r].length - 1; c++) {
          const cell = envGrid[r][c];
          if (cell.isLand || cell.isIceShelf) continue;
          const sic = cell.sicValues[th] ?? cell.sicValues[0];
          const risk = evaluateCellRisk(cell, th, state.vessel, state.icebergs);

          const poly: [number, number][] = [
            to3031(envGrid[r][c].longitude,     envGrid[r][c].latitude),
            to3031(envGrid[r][c + 1].longitude, envGrid[r][c + 1].latitude),
            to3031(envGrid[r + 1][c + 1].longitude, envGrid[r + 1][c + 1].latitude),
            to3031(envGrid[r + 1][c].longitude, envGrid[r + 1][c].latitude),
            to3031(envGrid[r][c].longitude,     envGrid[r][c].latitude),
          ];

          // NO-GO Zone: dark red cell fill (22% opacity) + thin border
          if (ly.noGoZones && risk.isNoGo) {
            const f = new Feature({ geometry: new Polygon([poly]) });
            f.setStyle(new Style({
              fill: new Fill({ color: 'rgba(201, 75, 75, 0.22)' }),
              stroke: new Stroke({ color: 'rgba(201, 75, 75, 0.60)', width: 0.8, lineDash: [4, 4] }),
            }));
            s.noGo.addFeature(f);
          }

          // Sea-Ice Concentration Grid: light cyan / blue fill (12-18% opacity)
          if (ly.seaIce && sic > 5) {
            let col: string;
            if (sic >= state.vessel.safeSicThresholdPercent || risk.totalRisk >= 70) col = 'rgba(201, 75, 75, 0.18)';
            else if (sic >= 60 || risk.totalRisk >= 50)  col = 'rgba(217, 119, 50, 0.16)';
            else if (sic >= 30 || risk.totalRisk >= 30)  col = 'rgba(216, 155, 43, 0.14)';
            else                                           col = 'rgba(47, 128, 201, 0.12)';
            const f = new Feature({ geometry: new Polygon([poly]) });
            f.setStyle(new Style({
              fill: new Fill({ color: col }),
              stroke: new Stroke({ color: 'rgba(47, 128, 201, 0.10)', width: 0.3 }),
            }));
            s.seaIce.addFeature(f);
          }
        }
      }
    }

    // ── Icebergs (Crisp diamond markers; uncertainty ONLY for selected iceberg) ──
    s.iceberg.clear(); s.uncertainty.clear();
    if (ly.icebergs) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isSelected = state.selectedIcebergId ? state.selectedIcebergId === berg.id : isB22;

        // Historical track
        if (ly.icebergForecast && berg.historicalTrack.length > 1) {
          const f = new Feature({ geometry: new LineString(berg.historicalTrack.map(p => to3031(p.longitude, p.latitude))) });
          f.setStyle(new Style({ stroke: new Stroke({ color: 'rgba(112, 151, 210, 0.40)', width: 1.2 }) }));
          s.iceberg.addFeature(f);
        }
        // Forecast track (dashed for selected iceberg)
        if (ly.icebergForecast && isSelected && berg.forecastTrack.length > 1) {
          const f = new Feature({ geometry: new LineString(berg.forecastTrack.map(p => to3031(p.longitude, p.latitude))) });
          f.setStyle(new Style({ stroke: new Stroke({ color: '#3B8FC4', width: 1.8, lineDash: [5, 4] }) }));
          s.iceberg.addFeature(f);
        }

        // Uncertainty Envelopes — ONLY DRAWN FOR SELECTED ICEBERG TO PREVENT MAP CLUTTER
        if (ly.icebergUncertainty && isSelected) {
          berg.forecastTrack.forEach(pt => {
            if (!pt.horizonHours) return;
            const rad = (pt.uncertaintyRadiusKm || 5) * 1000;
            const f = new Feature({ geometry: new CircleGeom(to3031(pt.longitude, pt.latitude), rad) });
            f.setStyle(new Style({
              fill: new Fill({ color: 'rgba(124, 104, 200, 0.08)' }),
              stroke: new Stroke({ color: '#7C68C8', width: 1.2, lineDash: [3, 4] }),
            }));
            s.uncertainty.addFeature(f);
          });
        }

        // Iceberg position diamond marker
        const f = new Feature({ geometry: new Point(to3031(berg.currentPosition.longitude, berg.currentPosition.latitude)) });
        f.set('icebergId', berg.id);
        f.setStyle(new Style({
          image: new RegularShape({
            points: 4,
            radius: isSelected ? 7 : 5,
            angle: Math.PI / 4,
            fill: new Fill({ color: isSelected ? '#3B8FC4' : '#7097D2' }),
            stroke: new Stroke({ color: '#FFFFFF', width: 1.5 }),
          }),
          text: isSelected ? new Text({
            text: berg.name,
            font: 'bold 10px "Inter",sans-serif',
            fill: new Fill({ color: 'var(--navy-800)' }),
            stroke: new Stroke({ color: '#FFFFFF', width: 2.5 }),
            offsetX: 12, offsetY: -8,
          }) : undefined,
        }));
        s.iceberg.addFeature(f);
      });
    }

    // ── Routes (Clean, scientific lines) ───────────────────────────────────
    s.route.clear();
    state.routes.forEach((route) => {
      if (route.type === 'SHORTEST_REJECTED' && !ly.shortestRoute) return;
      if (route.type === 'SAFE_A'            && !ly.recommendedRoute) return;
      if (route.type === 'ALTERNATIVE_B'     && !ly.alternativeRoute) return;

      const isRej = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';
      const isSel = route.id === state.selectedRouteId;

      let col: string, w: number, dash: number[] | undefined;
      if (route.type === 'SAFE_A') {
        col = '#2F80C9'; w = isSel ? 3.5 : 3.0;
      } else if (route.type === 'ALTERNATIVE_B') {
        col = '#D89B2B'; w = 2.0; dash = [6, 4];
      } else if (isRej) {
        col = '#7A8795'; w = 2.0; dash = [3, 4];
      } else {
        col = '#2F80C9'; w = 2.5;
      }

      const f = new Feature({ geometry: new LineString(route.waypoints.map(wp => to3031(wp.longitude, wp.latitude))) });
      f.setStyle(new Style({ stroke: new Stroke({ color: col, width: w, lineDash: dash }) }));
      s.route.addFeature(f);
    });

    // Scenario Counterfactual Route
    if (state.activeWhatIfResult?.scenario_optimization?.candidate_routes) {
      const opt = state.activeWhatIfResult.scenario_optimization;
      const cands: any[] = opt.candidate_routes || [];
      const rec = cands.find((c: any) => c.route_id === opt.recommended_route_id) || cands[0];
      if (rec?.waypoints?.length) {
        const f = new Feature({ geometry: new LineString(rec.waypoints.map((wp: any) => to3031(wp.longitude, wp.latitude))) });
        f.setStyle(new Style({ stroke: new Stroke({ color: '#7C68C8', width: 2.5, lineDash: [6, 5] }) }));
        s.route.addFeature(f);
      }
    }

    // ── Vessel Position ────────────────────────────────────────────────────
    s.vessel.clear();
    const vLat = state.departureLocation?.latitude ?? -63.0;
    const vLon = state.departureLocation?.longitude ?? 0.0;
    const vf = new Feature({ geometry: new Point(to3031(vLon, vLat)) });
    vf.setStyle(new Style({
      image: new RegularShape({
        points: 3,
        radius: 9,
        angle: 0,
        fill: new Fill({ color: '#0EA5E9' }),
        stroke: new Stroke({ color: '#0E2360', width: 2 }),
      }),
      text: new Text({
        text: 'VESSEL',
        font: 'bold 9px "JetBrains Mono",monospace',
        fill: new Fill({ color: '#0EA5E9' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 2.5 }),
        offsetY: -18,
      }),
    }));
    s.vessel.addFeature(vf);

    // ── Destination Location ───────────────────────────────────────────────
    s.dest.clear();
    if (state.destinationLocation) {
      const dLat = state.destinationLocation.latitude;
      const dLon = state.destinationLocation.longitude;
      const df = new Feature({ geometry: new Point(to3031(dLon, dLat)) });
      df.setStyle(new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: '#D89B2B' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 1.5 }),
        }),
        text: new Text({
          text: state.destinationLocation.name,
          font: '9px "Inter",sans-serif',
          fill: new Fill({ color: '#0E2360' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 2 }),
          offsetY: 16,
        }),
      }));
      s.dest.addFeature(df);
    }
  }, [state]);

  // ─── BASEMAP SWITCH ───────────────────────────────────────────────────────
  const switchBasemap = (type: BasemapSourceType) => {
    setBasemapType(type);
    setShowBasemapMenu(false);
    providerRef.current.setSourceType(type);
    const map = mapRef.current;
    const s = srcRef.current;
    if (map && s.basemapLayer) {
      map.removeLayer(s.basemapLayer);
      const newLayer = providerRef.current.createBasemapLayer();
      map.getLayers().insertAt(1, newLayer);
      s.basemapLayer = newLayer;
    }
  };

  const dms = (deg: number, isLat: boolean) => {
    const a = Math.abs(deg);
    const d = Math.floor(a); const m = Math.floor((a - d) * 60); const sec = Math.round(((a - d) * 60 - m) * 60);
    const dir = isLat ? (deg < 0 ? 'S' : 'N') : deg < 0 ? 'W' : 'E';
    return `${d}° ${m}' ${sec}" ${dir}`;
  };

  const inspection = state.selectedCellInspection;

  return (
    <div ref={wrapperRef} className="map-viewport-container" style={{ position: 'relative', width: '100%', height: '100%', background: '#DCEAF0', overflow: 'hidden' }}>
      {/* OpenLayers Map Canvas */}
      <div ref={mapDivRef} style={{ width: '100%', height: '100%', zIndex: 0 }} />

      {/* ── Left Toolbar (Light Polar Operations Style) ── */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 6,
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 6, boxShadow: 'var(--shadow-md)',
      }}>
        {[
          { icon: <ZoomIn style={{ width: 16, height: 16 }} />, onClick: () => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() ?? 2) + 0.4), title: 'Zoom In' },
          { icon: <ZoomOut style={{ width: 16, height: 16 }} />, onClick: () => mapRef.current?.getView().setZoom((mapRef.current.getView().getZoom() ?? 2) - 0.4), title: 'Zoom Out' },
          { icon: <RotateCcw style={{ width: 16, height: 16 }} />, onClick: () => mapRef.current && fitAntarctica(mapRef.current), title: 'Fit Full Antarctica' },
          {
            icon: <Navigation style={{ width: 16, height: 16 }} />,
            onClick: () => {
              const vLat = state.departureLocation?.latitude ?? -63;
              const vLon = state.departureLocation?.longitude ?? 0;
              mapRef.current?.getView().animate({ center: to3031(vLon, vLat), zoom: 5, duration: 600 });
            },
            title: 'Locate Vessel',
          },
          {
            icon: <Ruler style={{ width: 16, height: 16 }} />,
            onClick: () => {
              const next = !isMeasuring;
              setIsMeasuring(next);
              (window as any).__pol_measuring = next;
              if (!next) { measurePtsRef.current = []; setMeasureNm(0); srcRef.current.measure.clear(); }
            },
            title: 'Measure Distance',
          },
          {
            icon: isFullscreen ? <Minimize2 style={{ width: 16, height: 16 }} /> : <Maximize2 style={{ width: 16, height: 16 }} />,
            onClick: () => {
              if (!document.fullscreenElement) { wrapperRef.current?.requestFullscreen(); setIsFullscreen(true); }
              else { document.exitFullscreen(); setIsFullscreen(false); }
            },
            title: 'Fullscreen',
          },
        ].map((btn, idx) => (
          <button key={idx} onClick={btn.onClick} title={btn.title}
            style={{
              padding: 8, borderRadius: 'var(--r-md)', border: 'none',
              background: isMeasuring && btn.title === 'Measure Distance' ? 'var(--blue-500)' : 'transparent',
              color: isMeasuring && btn.title === 'Measure Distance' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { if (!(isMeasuring && btn.title === 'Measure Distance')) e.currentTarget.style.background = 'var(--surface-alt)'; }}
            onMouseLeave={(e) => { if (!(isMeasuring && btn.title === 'Measure Distance')) e.currentTarget.style.background = 'transparent'; }}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      {/* ── Top-Right Map Controls ── */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20, display: 'flex', gap: 8 }}>
        {[
          { label: 'Basemap', icon: <Globe style={{ width: 14, height: 14 }} />, active: showBasemapMenu, onClick: () => { setShowBasemapMenu(v => !v); setShowLayerControls(false); setShowLegend(false); setShowDebug(false); } },
          { label: 'Layers', icon: <Layers style={{ width: 14, height: 14 }} />, active: showLayerControls, onClick: () => { setShowLayerControls(v => !v); setShowBasemapMenu(false); setShowLegend(false); setShowDebug(false); } },
          { label: 'Legend', icon: <HelpCircle style={{ width: 14, height: 14 }} />, active: showLegend, onClick: () => { setShowLegend(v => !v); setShowLayerControls(false); setShowBasemapMenu(false); setShowDebug(false); } },
          { label: 'Debug', icon: <Compass style={{ width: 14, height: 14 }} />, active: showDebug, onClick: () => { setShowDebug(v => !v); setShowLegend(false); setShowLayerControls(false); setShowBasemapMenu(false); } },
        ].map((btn, i) => (
          <button key={i} onClick={btn.onClick}
            style={{
              padding: '6px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)',
              background: btn.active ? 'var(--blue-500)' : 'var(--surface-card)',
              color: btn.active ? 'white' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 650, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s',
            }}
          >
            {btn.icon}<span>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* Popovers */}
      {showBasemapMenu && (
        <div style={{
          position: 'absolute', top: 56, right: 16, zIndex: 20, width: 260,
          background: 'var(--surface-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: 12, boxShadow: 'var(--shadow-md)',
          display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12,
        }}>
          <span className="section-label" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>BASEMAP SOURCE — EPSG:3031</span>
          {[
            ['BAS_ANTARCTIC', '🗺️ BAS Antarctic Tile Provider', '(Official Antarctic Basemap)'],
            ['NASA_GIBS_WMTS', '🌍 NASA GIBS Blue Marble', '(Bathymetry & Hillshade)'],
          ].map(([type, label, sub]) => (
            <button key={type} onClick={() => switchBasemap(type as BasemapSourceType)}
              style={{
                padding: '8px 10px', borderRadius: 'var(--r-md)', textAlign: 'left', border: '1px solid',
                background: basemapType === type ? 'var(--blue-50)' : 'var(--surface)',
                borderColor: basemapType === type ? 'var(--blue-200)' : 'var(--border)',
                color: basemapType === type ? 'var(--navy-800)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>
            </button>
          ))}
        </div>
      )}

      {showLayerControls && (
        <div style={{ position: 'absolute', top: 56, right: 16, zIndex: 20 }}>
          <MapLayerControls
            layers={state.mapLayers}
            onToggleLayer={(k) => polarisStore.toggleMapLayer(k)}
            sarAvailable={state.sentinel1ImageAvailable}
            sarProvenance="RECENT"
            hasScenarioRoute={!!state.activeWhatIfResult?.scenario_optimization}
          />
        </div>
      )}

      {showLegend && (
        <div style={{ position: 'absolute', top: 56, right: 16, zIndex: 20 }}>
          <MapLegend />
        </div>
      )}

      {showDebug && (
        <div style={{
          position: 'absolute', top: 56, right: 16, zIndex: 20, width: 300,
          background: 'var(--surface-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: 12, boxShadow: 'var(--shadow-md)',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--navy-800)', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 8 }}>
            🛠 COORDINATE PIPELINE DEBUG
          </div>
          <div>EPSG:3031 Nav Extent: ±3,700,000 m</div>
          <div>Model Grid: {GRID_ROWS}×{GRID_COLS} cells</div>
          <div>Cursor: {cursorCoords ? `${cursorCoords.lat.toFixed(3)}°S, ${cursorCoords.lon.toFixed(3)}°E` : 'Move mouse'}</div>
        </div>
      )}

      {/* Measure HUD */}
      {isMeasuring && (
        <div style={{
          position: 'absolute', top: 16, left: 70, zIndex: 20,
          background: 'var(--surface-card)', border: '1px solid var(--warning-border)',
          borderRadius: 'var(--r-md)', padding: '6px 12px', fontSize: 12, fontWeight: 600,
          color: 'var(--warning)', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>📏 Distance: <strong>{measureNm.toFixed(1)} NM</strong> ({(measureNm * 1.852).toFixed(1)} km)</span>
          <button onClick={() => { measurePtsRef.current = []; setMeasureNm(0); srcRef.current.measure.clear(); }} className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: 10 }}>Clear</button>
        </div>
      )}

      {/* ── Cell Click Inspector Popover ── */}
      {inspection && selectedCellInfo && (
        <div style={{
          position: 'absolute', top: 16, right: showLayerControls || showLegend || showBasemapMenu ? 310 : 16, zIndex: 30,
          width: 300, background: 'var(--surface-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 14, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>CELL INSPECTION</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                R{selectedCellInfo.row} C{selectedCellInfo.col} ({Math.abs(selectedCellInfo.lat).toFixed(2)}°S, {Math.abs(selectedCellInfo.lon).toFixed(2)}°E)
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCellInfo(null);
                polarisStore.clearCellInspection();
                srcRef.current.selection.clear();
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* Inspection details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Safety Status</span>
              <span className={`badge ${inspection.safety_status === 'NO_GO' ? 'badge-critical' : 'badge-safe'}`}>
                {inspection.safety_status}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Fused Risk</span>
              <span style={{ fontWeight: 700, color: inspection.total_risk >= 70 ? 'var(--critical)' : inspection.total_risk >= 40 ? 'var(--warning)' : 'var(--success)' }}>
                {inspection.total_risk ?? '—'}/100
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Sea-Ice Concentration</span>
              <span style={{ fontWeight: 600 }}>{inspection.sic_percent?.toFixed(0) ?? '—'}%</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Wave Height</span>
              <span style={{ fontWeight: 600 }}>{inspection.wave_height_meters?.toFixed(1) ?? '—'} m</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Ocean Current</span>
              <span style={{ fontWeight: 600 }}>{inspection.current_speed_knots?.toFixed(1) ?? '—'} kn</span>
            </div>

            {inspection.blocking_reasons && inspection.blocking_reasons.length > 0 && (
              <div style={{
                marginTop: 4, padding: 8, borderRadius: 'var(--r-md)',
                background: 'var(--critical-bg)', border: '1px solid var(--critical-border)',
                color: 'var(--critical)', fontSize: 11, fontWeight: 600,
              }}>
                🚫 {inspection.blocking_reasons.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Live Coordinate & System HUD ── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 20,
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)', padding: '8px 12px', boxShadow: 'var(--shadow-md)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', minWidth: 260,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--navy-800)', fontSize: 10, letterSpacing: '0.05em' }}>
            POSITION HUD
          </span>
          <span className="badge badge-navy" style={{ fontSize: 8 }}>EPSG:3031</span>
        </div>
        {cursorCoords ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>LAT</span>
              <span style={{ fontWeight: 600, color: 'var(--navy-800)' }}>{Math.abs(cursorCoords.lat).toFixed(3)}°{cursorCoords.lat < 0 ? 'S' : 'N'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>LON</span>
              <span style={{ fontWeight: 600, color: 'var(--navy-800)' }}>{Math.abs(cursorCoords.lon).toFixed(3)}°{cursorCoords.lon >= 0 ? 'E' : 'W'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 2, marginTop: 2 }}>
              <span>DMS</span>
              <span>{dms(cursorCoords.lat, true)}, {dms(cursorCoords.lon, false)}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>Hover over map for live coordinates</div>
        )}
      </div>
    </div>
  );
};
