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
import { AntarcticBasemapProvider, BasemapSourceType } from '../../services/basemapProvider';
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
  HelpCircle,
  Globe,
} from 'lucide-react';

// ─── Register EPSG:3031 (WGS 84 / Antarctic Polar Stereographic) ───────────
proj4.defs(
  'EPSG:3031',
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
);
register(proj4);
const proj3031 = getProjection('EPSG:3031');
if (proj3031) {
  proj3031.setExtent([-4194304, -4194304, 4194304, 4194304]);
}

interface OpenLayersPolarMapProps {
  state: PolarisAppState;
  width?: number | string;
  height?: number | string;
}

export const OpenLayersPolarMap: React.FC<OpenLayersPolarMapProps> = ({
  state,
  width = '100%',
  height = '100%',
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Mouse Coordinate Readout HUD State (WGS84)
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Basemap Provider Selection State
  const [basemapSourceType, setBasemapSourceType] = useState<BasemapSourceType>('ESRI_POLAR_BASE');
  const basemapProviderRef = useRef<AntarcticBasemapProvider>(new AntarcticBasemapProvider({ sourceType: 'ESRI_POLAR_BASE' }));

  // Compact Popover Controls UI State
  const [showLayerControls, setShowLayerControls] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(false);
  const [showBasemapMenu, setShowBasemapMenu] = useState<boolean>(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Measurement Tool state
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<number[][]>([]);
  const [measureDistanceNm, setMeasureDistanceNm] = useState<number>(0);

  // OpenLayers Vector & Image Sources
  const sourcesRef = useRef<{
    graticuleSource: VectorSource;
    seaIceSource: VectorSource;
    riskSource: VectorSource;
    noGoSource: VectorSource;
    icebergSource: VectorSource;
    uncertaintySource: VectorSource;
    routeSource: VectorSource;
    vesselSource: VectorSource;
    destinationSource: VectorSource;
    measureSource: VectorSource;
    basemapLayer?: any;
    sarLayer?: ImageLayer<ImageStatic>;
  }>({
    graticuleSource: new VectorSource(),
    seaIceSource: new VectorSource(),
    riskSource: new VectorSource(),
    noGoSource: new VectorSource(),
    icebergSource: new VectorSource(),
    uncertaintySource: new VectorSource(),
    routeSource: new VectorSource(),
    vesselSource: new VectorSource(),
    destinationSource: new VectorSource(),
    measureSource: new VectorSource(),
  });

  const measurePointsRef = useRef<number[][]>([]);
  measurePointsRef.current = measurePoints;

  // Transform WGS84 [lon, lat] to EPSG:3031 [x, y]
  const to3031 = (lon: number, lat: number): [number, number] => {
    return transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];
  };

  // Transform EPSG:3031 [x, y] back to WGS84 [lon, lat]
  const toWgs84 = (x: number, y: number): [number, number] => {
    return transform([x, y], 'EPSG:3031', 'EPSG:4326') as [number, number];
  };

  // 1. Initialize OpenLayers Map with EPSG:3031 Projection
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const sources = sourcesRef.current;

    // Basemap Layer from AntarcticBasemapProvider
    const basemapLayer = basemapProviderRef.current.createBasemapLayer();
    sources.basemapLayer = basemapLayer;

    // EPSG:3031 Genuine Polar Graticule Layer (Z-Index 3)
    const graticuleLayer = new VectorLayer({
      source: sources.graticuleSource,
      zIndex: 3,
    });

    // Sea-Ice Grid Layer (Z-Index 5)
    const seaIceLayer = new VectorLayer({
      source: sources.seaIceSource,
      zIndex: 5,
    });

    // Risk Heatmap Layer (Z-Index 6)
    const riskLayer = new VectorLayer({
      source: sources.riskSource,
      zIndex: 6,
    });

    // NO-GO Safety Hazard Layer (Z-Index 7)
    const noGoLayer = new VectorLayer({
      source: sources.noGoSource,
      zIndex: 7,
    });

    // Iceberg Tracks Layer (Z-Index 8)
    const icebergLayer = new VectorLayer({
      source: sources.icebergSource,
      zIndex: 8,
    });

    // Uncertainty Circles Layer (Z-Index 9)
    const uncertaintyLayer = new VectorLayer({
      source: sources.uncertaintySource,
      zIndex: 9,
    });

    // Navigation Routes Layer (Z-Index 10)
    const routeLayer = new VectorLayer({
      source: sources.routeSource,
      zIndex: 10,
    });

    // Vessel Layer (Z-Index 11)
    const vesselLayer = new VectorLayer({
      source: sources.vesselSource,
      zIndex: 11,
    });

    // Destination Target & Research Stations Layer (Z-Index 12)
    const destinationLayer = new VectorLayer({
      source: sources.destinationSource,
      zIndex: 12,
    });

    // Distance Measurement Layer (Z-Index 13)
    const measureLayer = new VectorLayer({
      source: sources.measureSource,
      zIndex: 13,
    });

    // OpenLayers Map Instance in Native EPSG:3031 Projection
    const map = new Map({
      target: mapContainerRef.current,
      layers: [
        basemapLayer,
        graticuleLayer,
        seaIceLayer,
        riskLayer,
        noGoLayer,
        icebergLayer,
        uncertaintyLayer,
        routeLayer,
        vesselLayer,
        destinationLayer,
        measureLayer,
      ],
      view: new View({
        projection: 'EPSG:3031',
        center: [0, 0], // South Pole [-90°S] is at exact visual center!
        zoom: 2.1, // Initial extent: 60°S to 90°S showing complete Antarctica
        minZoom: 1.0,
        maxZoom: 8.0,
      }),
      controls: [],
    });

    // Render Genuine Geographic Graticules (Concentric Rings & Radial Spokes)
    renderPolarGraticule(sources.graticuleSource);

    // Continuous Mouse Pointer Movement Coordinate Readout (WGS84 Lat/Lon)
    map.on('pointermove', (evt) => {
      const coord3031 = evt.coordinate;
      if (coord3031) {
        const [lon, lat] = toWgs84(coord3031[0], coord3031[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          setCursorCoords({ lat, lng: lon });
        }
      }
    });

    // Click Handler for Distance Measurement Tool
    map.on('singleclick', (evt) => {
      if ((window as any).__polaris_ol_measuring && evt.coordinate) {
        const newPts = [...measurePointsRef.current, evt.coordinate];
        setMeasurePoints(newPts);
        renderMeasurementTool(sources.measureSource, newPts);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Basemap Provider Switch
  const handleSwitchBasemap = (type: BasemapSourceType) => {
    setBasemapSourceType(type);
    setShowBasemapMenu(false);
    basemapProviderRef.current.setSourceType(type);

    const map = mapInstanceRef.current;
    const sources = sourcesRef.current;
    if (map && sources.basemapLayer) {
      map.removeLayer(sources.basemapLayer);
      const newBasemap = basemapProviderRef.current.createBasemapLayer();
      map.getLayers().insertAt(0, newBasemap);
      sources.basemapLayer = newBasemap;
    }
  };

  // ─── Function: Render Genuine EPSG:3031 Polar Graticule ───────────────────
  const renderPolarGraticule = (source: VectorSource) => {
    source.clear();

    // 1. Concentric Latitude Rings (60°S, 65°S, 70°S, 75°S, 80°S, 85°S, 90°S)
    const lats = [-60, -65, -70, -75, -80, -85];
    lats.forEach((lat) => {
      const ringPts: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        ringPts.push(to3031(lon, lat));
      }

      const ringFeature = new Feature({
        geometry: new Polygon([ringPts]),
      });

      const isCircle = lat === -65 || lat === -66.562;
      ringFeature.setStyle(
        new Style({
          stroke: new Stroke({
            color: isCircle ? '#F59E0B' : '#0284C7',
            width: isCircle ? 1.8 : 1.0,
            lineDash: isCircle ? [6, 6] : [3, 4],
          }),
        })
      );
      source.addFeature(ringFeature);

      // Label at 0° and 90°E meridians
      [0, 90].forEach((lblLon) => {
        const lblPt = to3031(lblLon, lat);
        const lblFeat = new Feature({
          geometry: new Point(lblPt),
        });

        const labelText = lat === -66.562 ? "Antarctic Circle (66°34'S)" : `${Math.abs(lat)}°S`;
        lblFeat.setStyle(
          new Style({
            text: new Text({
              text: labelText,
              font: 'bold 10px "JetBrains Mono", monospace',
              fill: new Fill({ color: isCircle ? '#F59E0B' : '#38BDF8' }),
              stroke: new Stroke({ color: '#060B14', width: 2.5 }),
              offsetY: -8,
            }),
          })
        );
        source.addFeature(lblFeat);
      });
    });

    // 2. Radial Longitude Spokes (0°, 30°E, 60°E, 90°E, 120°E, 150°E, 180°, 150°W, 120°W, 90°W, 60°W, 30°W)
    const lons = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30];
    lons.forEach((lon) => {
      const spokePts: [number, number][] = [];
      for (let lat = -90; lat <= -55; lat += 2) {
        spokePts.push(to3031(lon, lat));
      }

      const spokeFeature = new Feature({
        geometry: new LineString(spokePts),
      });

      spokeFeature.setStyle(
        new Style({
          stroke: new Stroke({
            color: '#0284C7',
            width: 1.0,
            lineDash: [3, 4],
          }),
        })
      );
      source.addFeature(spokeFeature);

      // Outer Meridian Label
      const outerPt = to3031(lon, -56);
      const outerFeat = new Feature({
        geometry: new Point(outerPt),
      });

      const lonText = lon === 0 ? '0° (Prime)' : lon === 180 ? '180°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;
      outerFeat.setStyle(
        new Style({
          text: new Text({
            text: lonText,
            font: 'bold 11px "JetBrains Mono", monospace',
            fill: new Fill({ color: '#7DD3FC' }),
            stroke: new Stroke({ color: '#060B14', width: 3 }),
          }),
        })
      );
      source.addFeature(outerFeat);
    });
  };

  // ─── Function: Render Distance Measurement Tool in EPSG:3031 ─────────────
  const renderMeasurementTool = (source: VectorSource, pts: number[][]) => {
    source.clear();
    if (pts.length === 0) return;

    pts.forEach((pt3031, idx) => {
      const feat = new Feature({
        geometry: new Point(pt3031),
      });
      feat.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: '#F59E0B' }),
            stroke: new Stroke({ color: '#FFFFFF', width: 1.5 }),
          }),
          text: new Text({
            text: `P${idx + 1}`,
            font: 'bold 10px monospace',
            fill: new Fill({ color: '#F59E0B' }),
            offsetY: -12,
          }),
        })
      );
      source.addFeature(feat);
    });

    if (pts.length > 1) {
      const lineFeat = new Feature({
        geometry: new LineString(pts),
      });

      lineFeat.setStyle(
        new Style({
          stroke: new Stroke({
            color: '#F59E0B',
            width: 3,
            lineDash: [6, 6],
          }),
        })
      );
      source.addFeature(lineFeat);

      let totNm = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [lon1, lat1] = toWgs84(pts[i][0], pts[i][1]);
        const [lon2, lat2] = toWgs84(pts[i + 1][0], pts[i + 1][1]);
        totNm += haversineDistanceNm(
          { latitude: lat1, longitude: lon1 },
          { latitude: lat2, longitude: lon2 }
        );
      }
      setMeasureDistanceNm(totNm);
    }
  };

  // 2. Update Overlays & Vector Layers on State Changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const sources = sourcesRef.current;
    if (!map) return;

    const layers: MapLayerState = state.mapLayers;
    const timeHorizon = state.simulationTimeHours;
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 3: Sentinel-1 SAR Raster Overlay (ONLY when checkbox is ON)
    // ─────────────────────────────────────────────────────────────────────────
    if (sources.sarLayer) {
      map.removeLayer(sources.sarLayer);
      sources.sarLayer = undefined;
    }

    if (layers.sentinel1Sar && state.sentinel1ImageAvailable && state.sentinel1ImageUrl) {
      const bbox = state.sentinel1ImageBbox || state.sentinel1ImageMetadata?.image_bbox;
      if (bbox) {
        const minExtent = to3031(bbox.min_lon, bbox.min_lat);
        const maxExtent = to3031(bbox.max_lon, bbox.max_lat);

        const sarLayer = new ImageLayer({
          source: new ImageStatic({
            url: state.sentinel1ImageUrl,
            projection: 'EPSG:3031',
            imageExtent: [
              Math.min(minExtent[0], maxExtent[0]),
              Math.min(minExtent[1], maxExtent[1]),
              Math.max(minExtent[0], maxExtent[0]),
              Math.max(minExtent[1], maxExtent[1]),
            ],
            crossOrigin: 'anonymous',
          }),
          opacity: state.sentinel1Opacity ?? 0.70,
          zIndex: 4,
        });

        map.addLayer(sarLayer);
        sources.sarLayer = sarLayer;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 4 & 5: Sea-Ice Concentration Grid & Fused Risk Heatmap Polygons
    // ─────────────────────────────────────────────────────────────────────────
    sources.seaIceSource.clear();
    sources.riskSource.clear();
    sources.noGoSource.clear();

    if (layers.seaIce || layers.noGoZones) {
      const threshold = state.vessel.safeSicThresholdPercent;

      for (let r = 0; r < envGrid.length - 1; r++) {
        for (let c = 0; c < envGrid[r].length - 1; c++) {
          const cell = envGrid[r][c];
          if (cell.isLand || cell.isIceShelf) continue;

          const sic = cell.sicValues[timeHorizon] ?? cell.sicValues[0];
          const risk = evaluateCellRisk(cell, timeHorizon, state.vessel, state.icebergs);

          const poly3031: [number, number][] = [
            to3031(envGrid[r][c].longitude, envGrid[r][c].latitude),
            to3031(envGrid[r][c + 1].longitude, envGrid[r][c + 1].latitude),
            to3031(envGrid[r + 1][c + 1].longitude, envGrid[r + 1][c + 1].latitude),
            to3031(envGrid[r + 1][c].longitude, envGrid[r + 1][c].latitude),
            to3031(envGrid[r][c].longitude, envGrid[r][c].latitude),
          ];

          // ───────────────────────────────────────────────────────────────────
          // LAYER 7: NO-GO Safety Hazard Overlay (Transparent Dark Red)
          // ───────────────────────────────────────────────────────────────────
          if (layers.noGoZones && risk.isNoGo) {
            const noGoFeature = new Feature({
              geometry: new Polygon([poly3031]),
            });

            noGoFeature.setStyle(
              new Style({
                fill: new Fill({ color: 'rgba(239, 68, 68, 0.35)' }),
                stroke: new Stroke({ color: '#DC2626', width: 1.5, lineDash: [4, 4] }),
              })
            );
            sources.noGoSource.addFeature(noGoFeature);
          }

          // Fused Risk Heatmap Polygons
          if (layers.seaIce) {
            let fillColor = 'rgba(16, 185, 129, 0.18)'; // Green Safe
            if (risk.totalRisk >= 70 || sic >= threshold) fillColor = 'rgba(239, 68, 68, 0.38)'; // Red Critical
            else if (risk.totalRisk >= 50 || sic >= 50) fillColor = 'rgba(249, 115, 22, 0.30)'; // Orange High
            else if (risk.totalRisk >= 30 || sic >= 25) fillColor = 'rgba(245, 158, 11, 0.25)'; // Yellow Moderate

            const iceFeature = new Feature({
              geometry: new Polygon([poly3031]),
            });

            iceFeature.setStyle(
              new Style({
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.04)', width: 0.5 }),
              })
            );
            sources.seaIceSource.addFeature(iceFeature);
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 8 & 9: Icebergs, Tracks & Uncertainty Circles in EPSG:3031
    // ─────────────────────────────────────────────────────────────────────────
    sources.icebergSource.clear();
    sources.uncertaintySource.clear();

    if (layers.icebergs) {
      state.icebergs.forEach((berg) => {
        const isB22 = berg.id === 'B-22';
        const isCritical = berg.riskLevel === 'CRITICAL';

        // Historical Track Line
        if (layers.icebergForecast && berg.historicalTrack.length > 1) {
          const histPts3031 = berg.historicalTrack.map((pt) => to3031(pt.longitude, pt.latitude));
          const histFeat = new Feature({
            geometry: new LineString(histPts3031),
          });
          histFeat.setStyle(
            new Style({
              stroke: new Stroke({ color: '#64748B', width: 1.8 }),
            })
          );
          sources.icebergSource.addFeature(histFeat);
        }

        // Forecast Track Line
        if (layers.icebergForecast && berg.forecastTrack.length > 1) {
          const fcstPts3031 = berg.forecastTrack.map((pt) => to3031(pt.longitude, pt.latitude));
          const fcstFeat = new Feature({
            geometry: new LineString(fcstPts3031),
          });
          fcstFeat.setStyle(
            new Style({
              stroke: new Stroke({
                color: isCritical ? '#F59E0B' : '#06B6D4',
                width: 2.2,
                lineDash: [5, 5],
              }),
            })
          );
          sources.icebergSource.addFeature(fcstFeat);
        }

        // Uncertainty Region Circles
        if (layers.icebergUncertainty) {
          berg.forecastTrack.forEach((pt) => {
            if (pt.horizonHours === 0) return;
            const center3031 = to3031(pt.longitude, pt.latitude);
            const radiusMeters = (pt.uncertaintyRadiusKm || 5) * 1000;

            const circleFeat = new Feature({
              geometry: new CircleGeom(center3031, radiusMeters),
            });

            circleFeat.setStyle(
              new Style({
                fill: new Fill({ color: isB22 && pt.horizonHours >= 24 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(6, 182, 212, 0.10)' }),
                stroke: new Stroke({ color: isB22 && pt.horizonHours >= 24 ? '#EF4444' : '#0284C7', width: 1.2, lineDash: [3, 3] }),
              })
            );
            sources.uncertaintySource.addFeature(circleFeat);
          });
        }

        // Current Iceberg Diamond Marker
        const cp3031 = to3031(berg.currentPosition.longitude, berg.currentPosition.latitude);
        const bergFeat = new Feature({
          geometry: new Point(cp3031),
        });

        const isAI = berg.modelSource === 'POLARIS_GRU_Neural_Network';
        bergFeat.setStyle(
          new Style({
            image: new CircleStyle({
              radius: isB22 ? 8 : 6,
              fill: new Fill({ color: isB22 ? '#EF4444' : '#38BDF8' }),
              stroke: new Stroke({ color: '#FFFFFF', width: 2 }),
            }),
            text: new Text({
              text: `${berg.name}${isAI ? ' [AI GRU]' : ''}`,
              font: 'bold 10px "Inter", sans-serif',
              fill: new Fill({ color: '#FFFFFF' }),
              stroke: new Stroke({ color: '#060B14', width: 2.5 }),
              offsetX: 12,
              offsetY: -2,
            }),
          })
        );
        sources.icebergSource.addFeature(bergFeat);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 10: Navigation Routes (Time-Aware A* Engine) in EPSG:3031
    // ─────────────────────────────────────────────────────────────────────────
    sources.routeSource.clear();

    state.routes.forEach((route) => {
      if (route.type === 'SHORTEST_REJECTED' && !layers.shortestRoute) return;
      if (route.type === 'SAFE_A' && !layers.recommendedRoute) return;
      if (route.type === 'ALTERNATIVE_B' && !layers.alternativeRoute) return;

      const isSelected = route.id === state.selectedRouteId;
      const isRejected = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';

      let color = '#0284C7';
      let width = isSelected ? 5.5 : 3.5;
      let lineDash: number[] | undefined = undefined;

      if (route.type === 'SAFE_A') {
        color = '#0284C7'; // Cyan Recommended
        width = 5.5;
      } else if (route.type === 'ALTERNATIVE_B') {
        color = '#D97706'; // Amber Alternative
        lineDash = [6, 6];
        width = 4.0;
      } else if (isRejected) {
        color = '#64748B'; // Gray Shortest
        lineDash = [4, 4];
        width = 3.0;
      }

      const routePts3031 = route.waypoints.map((wp) => to3031(wp.longitude, wp.latitude));
      const routeFeat = new Feature({
        geometry: new LineString(routePts3031),
      });

      routeFeat.setStyle(
        new Style({
          stroke: new Stroke({ color, width, lineDash }),
        })
      );
      sources.routeSource.addFeature(routeFeat);
    });

    // Counterfactual Route Layer (What-If Scenario Active)
    if (state.activeWhatIfResult?.scenario_optimization?.candidate_routes) {
      const opt = state.activeWhatIfResult.scenario_optimization;
      const candidates: any[] = opt.candidate_routes || [];
      const recRoute = candidates.find((c) => c.route_id === opt.recommended_route_id) || candidates[0];

      if (recRoute && recRoute.waypoints && recRoute.waypoints.length > 0) {
        const scenarioPts3031 = recRoute.waypoints.map((wp: any) => to3031(wp.longitude, wp.latitude));
        const scenarioFeat = new Feature({
          geometry: new LineString(scenarioPts3031),
        });

        scenarioFeat.setStyle(
          new Style({
            stroke: new Stroke({ color: '#7C3AED', width: 4.5, lineDash: [6, 6] }),
          })
        );
        sources.routeSource.addFeature(scenarioFeat);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LAYER 11 & 12: Vessel & Destination Target Base Station Markers
    // ─────────────────────────────────────────────────────────────────────────
    sources.vesselSource.clear();
    sources.destinationSource.clear();

    const vLat = state.departureLocation?.latitude ?? -66.5;
    const vLon = state.departureLocation?.longitude ?? 25.0;
    const vesselPt3031 = to3031(vLon, vLat);

    const vesselFeat = new Feature({
      geometry: new Point(vesselPt3031),
    });

    vesselFeat.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 9,
          fill: new Fill({ color: '#38BDF8' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 2.5 }),
        }),
        text: new Text({
          text: `VESSEL\n${vLat.toFixed(2)}°, ${vLon.toFixed(2)}°\nMANUAL / SIMULATED POSITION`,
          font: 'bold 10px "JetBrains Mono", monospace',
          fill: new Fill({ color: '#38BDF8' }),
          stroke: new Stroke({ color: '#060B14', width: 3 }),
          offsetY: -28,
        }),
      })
    );
    sources.vesselSource.addFeature(vesselFeat);

    // Destination Base Station Marker
    if (state.destinationLocation) {
      const dLat = state.destinationLocation.latitude;
      const dLon = state.destinationLocation.longitude;
      const destPt3031 = to3031(dLon, dLat);

      const destFeat = new Feature({
        geometry: new Point(destPt3031),
      });

      const distNm = haversineDistanceNm({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });
      const bearing = calculateBearing({ latitude: vLat, longitude: vLon }, { latitude: dLat, longitude: dLon });

      destFeat.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#F59E0B' }),
            stroke: new Stroke({ color: '#FFFFFF', width: 2 }),
          }),
          text: new Text({
            text: `TARGET: ${state.destinationLocation.name}\n${distNm.toFixed(0)} NM @ ${bearing.toFixed(0)}°`,
            font: 'bold 10px "Inter", sans-serif',
            fill: new Fill({ color: '#FDE68A' }),
            stroke: new Stroke({ color: '#060B14', width: 3 }),
            offsetY: 22,
          }),
        })
      );
      sources.destinationSource.addFeature(destFeat);
    }
  }, [state]);

  // Toolbar Actions
  const handleZoomIn = () => mapInstanceRef.current?.getView().setZoom((mapInstanceRef.current?.getView().getZoom() || 2.1) + 0.4);
  const handleZoomOut = () => mapInstanceRef.current?.getView().setZoom((mapInstanceRef.current?.getView().getZoom() || 2.1) - 0.4);
  const handleResetView = () => {
    mapInstanceRef.current?.getView().animate({
      center: [0, 0],
      zoom: 2.1,
      duration: 800,
    });
  };
  const handleLocateVessel = () => {
    const vLat = state.departureLocation?.latitude ?? -66.5;
    const vLon = state.departureLocation?.longitude ?? 25.0;
    const pt3031 = to3031(vLon, vLat);
    mapInstanceRef.current?.getView().animate({
      center: pt3031,
      zoom: 4.5,
      duration: 800,
    });
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
    (window as any).__polaris_ol_measuring = nextVal;
    if (!nextVal) {
      setMeasurePoints([]);
      setMeasureDistanceNm(0);
      sourcesRef.current.measureSource.clear();
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
    <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center">
      {/* OpenLayers Map Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ width, height }} />

      {/* Map Control Toolbar (Compact Top-Left) */}
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
          title="Reset to Antarctic View (South Pole Centered)"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-amber-400 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={handleLocateVessel}
          title="Locate Vessel"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-emerald-400 transition-colors"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          onClick={handleToggleMeasure}
          title="Distance Measurement Tool"
          className={`p-2 rounded-lg transition-colors ${
            isMeasuring ? 'bg-amber-500 text-white' : 'bg-slate-800/80 hover:bg-slate-700/80 text-amber-400'
          }`}
        >
          <Ruler className="w-4 h-4" />
        </button>
        <button
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Compact Popover Controls Buttons (Top-Right) */}
      <div className="absolute top-4 right-4 z-[1000] flex gap-2">
        <button
          onClick={() => {
            setShowBasemapMenu(!showBasemapMenu);
            setShowLayerControls(false);
            setShowLegend(false);
          }}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xl backdrop-blur-md flex items-center gap-1.5 ${
            showBasemapMenu
              ? 'bg-sky-600 border-sky-400 text-white'
              : 'bg-slate-900/90 border-slate-800 text-sky-400 hover:bg-slate-800/90'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Basemap</span>
        </button>

        <button
          onClick={() => {
            setShowLayerControls(!showLayerControls);
            setShowLegend(false);
            setShowBasemapMenu(false);
          }}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xl backdrop-blur-md flex items-center gap-1.5 ${
            showLayerControls
              ? 'bg-sky-600 border-sky-400 text-white'
              : 'bg-slate-900/90 border-slate-800 text-sky-400 hover:bg-slate-800/90'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers</span>
        </button>

        <button
          onClick={() => {
            setShowLegend(!showLegend);
            setShowLayerControls(false);
            setShowBasemapMenu(false);
          }}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xl backdrop-blur-md flex items-center gap-1.5 ${
            showLegend
              ? 'bg-sky-600 border-sky-400 text-white'
              : 'bg-slate-900/90 border-slate-800 text-sky-400 hover:bg-slate-800/90'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Legend</span>
        </button>
      </div>

      {/* Popover Basemap Menu */}
      {showBasemapMenu && (
        <div className="absolute top-14 right-4 z-[1000] w-[260px] bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 text-xs">
          <span className="font-bold text-slate-300 border-b border-slate-800 pb-1 uppercase text-[10px] tracking-wider">
            Antarctic Basemap Provider (EPSG:3031)
          </span>
          <button
            onClick={() => handleSwitchBasemap('ESRI_POLAR_BASE')}
            className={`p-2 rounded-lg text-left transition-colors flex items-center justify-between ${
              basemapSourceType === 'ESRI_POLAR_BASE' ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span>ESRI Polar Antarctic Base</span>
            {basemapSourceType === 'ESRI_POLAR_BASE' && <span className="text-[9px] bg-sky-800 px-1.5 py-0.5 rounded">Active</span>}
          </button>
          <button
            onClick={() => handleSwitchBasemap('NASA_BLUE_MARBLE_BATHYMETRY')}
            className={`p-2 rounded-lg text-left transition-colors flex items-center justify-between ${
              basemapSourceType === 'NASA_BLUE_MARBLE_BATHYMETRY' ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span>NASA GIBS Blue Marble Bathymetry</span>
            {basemapSourceType === 'NASA_BLUE_MARBLE_BATHYMETRY' && <span className="text-[9px] bg-sky-800 px-1.5 py-0.5 rounded">Active</span>}
          </button>
          <button
            onClick={() => handleSwitchBasemap('BAS_CARTOGRAPHIC_TILE')}
            className={`p-2 rounded-lg text-left transition-colors flex items-center justify-between ${
              basemapSourceType === 'BAS_CARTOGRAPHIC_TILE' ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span>BAS Cartographic Tiles</span>
            {basemapSourceType === 'BAS_CARTOGRAPHIC_TILE' && <span className="text-[9px] bg-sky-800 px-1.5 py-0.5 rounded">Active</span>}
          </button>
          <button
            onClick={() => handleSwitchBasemap('OFFLINE_VECTOR')}
            className={`p-2 rounded-lg text-left transition-colors flex items-center justify-between ${
              basemapSourceType === 'OFFLINE_VECTOR' ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span>Offline Mission Vector Mode</span>
            {basemapSourceType === 'OFFLINE_VECTOR' && <span className="text-[9px] bg-sky-800 px-1.5 py-0.5 rounded">Offline</span>}
          </button>
        </div>
      )}

      {/* Popover Layer Controls */}
      {showLayerControls && (
        <div className="absolute top-14 right-4 z-[1000] max-w-[320px]">
          <MapLayerControls
            layers={state.mapLayers}
            onToggleLayer={handleToggleLayer}
            sarAvailable={state.sentinel1ImageAvailable}
            sarProvenance="RECENT"
            hasScenarioRoute={!!state.activeWhatIfResult?.scenario_optimization}
          />
        </div>
      )}

      {/* Popover Map Legend */}
      {showLegend && (
        <div className="absolute top-14 right-4 z-[1000] max-w-[320px]">
          <MapLegend />
        </div>
      )}

      {/* Measurement Active HUD */}
      {isMeasuring && (
        <div className="absolute top-4 left-16 z-[1000] bg-amber-900/90 border border-amber-500 rounded-xl px-3 py-1.5 text-white font-mono text-xs shadow-xl backdrop-blur-md flex items-center gap-3">
          <span>📏 Distance: <b>{measureDistanceNm.toFixed(1)} NM</b> ({(measureDistanceNm * 1.852).toFixed(1)} km)</span>
          <button
            onClick={() => {
              setMeasurePoints([]);
              setMeasureDistanceNm(0);
              sourcesRef.current.measureSource.clear();
            }}
            className="text-[10px] bg-amber-700 hover:bg-amber-600 px-2 py-0.5 rounded font-bold"
          >
            Clear
          </button>
        </div>
      )}

      {/* Continuous Live Cursor Lat/Lon Readout HUD */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-sky-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs text-slate-200 flex flex-col gap-1 min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
          <span className="font-bold text-sky-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            WGS 84 / Antarctic Polar Stereographic
          </span>
          <span className="text-[9px] bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded border border-sky-600/30">
            EPSG:3031
          </span>
        </div>

        {cursorCoords ? (
          <>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 font-sans">Cursor Position:</span>
              <span className="font-bold text-cyan-300">
                LAT {Math.abs(cursorCoords.lat).toFixed(2)}°S, LON {cursorCoords.lng >= 0 ? `${cursorCoords.lng.toFixed(2)}°E` : `${Math.abs(cursorCoords.lng).toFixed(2)}°W`}
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Decimal Degrees:</span>
              <span className="text-slate-300">
                {cursorCoords.lat.toFixed(4)}°, {cursorCoords.lng.toFixed(4)}°
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-800 pt-1 mt-0.5">
              <span>DMS Format:</span>
              <span className="text-slate-300 font-bold">
                {formatDms(cursorCoords.lat, true)}, {formatDms(cursorCoords.lng, false)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-center py-1 text-[11px]">
            Move mouse over polar chart for continuous Lat/Lon readout
          </div>
        )}
      </div>
    </div>
  );
};
