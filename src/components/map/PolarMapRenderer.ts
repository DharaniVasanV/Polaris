/**
 * POLARIS: High-Precision Antarctic Polar Map Renderer
 * Canvas & SVG geospatial visualization engine with independent togglable layers,
 * spatiotemporal hazard grids, dynamic ice edge, iceberg uncertainty corridors,
 * vessel tracking, and interactive waypoint inspection.
 */

import { PolarisAppState } from '../../types/state';
import { Route, Iceberg, GeoPoint, RouteWaypoint } from '../../types/domain';
import { EnvironmentalCell, RiskCell, ValidTimeHorizon } from '../../types/risk';
import { polarGeoToCanvas, polarCanvasToGeo, haversineDistanceKm } from '../../utils/geo';
import { evaluateCellRisk } from '../../simulation/riskEngine';
import { BASELINE_ENVIRONMENT_GRID } from '../../data/baselineEnvironment';
import { applyScenarioToEnvironment } from '../../simulation/scenarioEngine';

export interface PolarMapRendererProps {
  state: PolarisAppState;
  onWaypointSelect?: (wp: RouteWaypoint) => void;
  onCellSelect?: (cell: EnvironmentalCell, risk: RiskCell) => void;
  onIcebergSelect?: (berg: Iceberg) => void;
  selectedWaypoint?: RouteWaypoint | null;
  selectedIceberg?: Iceberg | null;
  zoomScale?: number;
  panOffset?: { x: number; y: number };
}

export class PolarMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private props: PolarMapRendererProps;
  private animationFrameId: number | null = null;
  private radarAngle: number = 0;
  private sarImage: HTMLImageElement | null = null;
  private sarImageUrl: string | null = null;

  constructor(canvas: HTMLCanvasElement, props: PolarMapRendererProps) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot get 2D canvas context');
    this.ctx = context;
    this.props = props;
    this.startRadarAnimation();
  }

  public updateProps(newProps: PolarMapRendererProps) {
    this.props = newProps;
    this.render();
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private startRadarAnimation() {
    const loop = () => {
      this.radarAngle = (this.radarAngle + 0.03) % (Math.PI * 2);
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private getZoomScale(): number {
    return this.props.zoomScale ?? 1.0;
  }

  private getPanOffset(): { x: number; y: number } {
    return this.props.panOffset ?? { x: 0, y: 0 };
  }

  private project(point: GeoPoint, w: number, h: number): { x: number; y: number } {
    return polarGeoToCanvas(point, w, h, this.getZoomScale(), this.getPanOffset(), -90, -50);
  }

  public render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const state = this.props.state;
    const layers = state.mapLayers;
    const timeHorizon: ValidTimeHorizon = state.simulationTimeHours;

    // 1. Clear background (Midnight Antarctic Deep Ocean)
    ctx.fillStyle = '#060B14';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Polar Coordinate Grid (Latitude rings & Longitude meridians)
    this.renderPolarGrid(ctx, width, height);

    // 3. Render Bathymetry Depth Gradients
    if (layers.bathymetry) {
      this.renderBathymetry(ctx, width, height);
    }

    // 3.5. Render Phase 10B Sentinel-1 SAR Backscatter Image Overlay
    if (layers.sentinel1Sar) {
      this.renderSentinel1SarLayer(ctx, width, height, state);
    }

    // 4. Render Sea-Ice Concentration Grid Cells & Ice Edge
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);
    if (layers.seaIce) {
      this.renderSeaIceGrid(ctx, width, height, envGrid, timeHorizon, state);
    }

    // 5. Render Coastline & Permanent Ice Shelves
    this.renderContinentalCoastline(ctx, width, height);

    // 6. Render Hard No-Go Hazard Zones
    if (layers.noGoZones) {
      this.renderNoGoZones(ctx, width, height, envGrid, timeHorizon, state);
    }

    // 7. Render Ocean Current & Wind Vectors
    if (layers.oceanCurrent || layers.weather) {
      this.renderVectors(ctx, width, height, envGrid, timeHorizon, layers.oceanCurrent, layers.weather);
    }

    // 8. Render Research Stations (Bharati, Maitri, McMurdo, Amundsen-Scott, etc.)
    if (layers.researchStations) {
      this.renderResearchStations(ctx, width, height, state.researchStations);
    }

    // 9. Render Icebergs, Historical Tracks, Forecast Tracks & Uncertainty Corridors
    if (layers.icebergs) {
      this.renderIcebergs(ctx, width, height, state.icebergs, timeHorizon, layers);
    }

    // 10. Render Planned, Alternative & Scenario Routes
    this.renderRoutes(ctx, width, height, state.routes, state.selectedRouteId, layers, state.activeWhatIfResult);

    // 11. Render Destination & Vessel Marker with Radar Ring
    this.renderDestination(ctx, width, height, state.destinationLocation);
    this.renderVessel(ctx, width, height, state.departureLocation, state.routes[0]?.waypoints[0]);
  }

  private renderPolarGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    const zoom = this.getZoomScale();
    const pan = this.getPanOffset();
    const cx = w / 2 + pan.x;
    const cy = h / 2 + pan.y;
    const maxR = (Math.min(w, h) / 2 - 25) * zoom;

    // 1. Draw Outer Polar Circular Ocean Boundary
    ctx.fillStyle = '#061325';
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 2. Concentric Latitude Rings (-80°, -70°, -66.56° Antarctic Circle, -60°, -50°)
    const latRings = [
      { lat: -80, label: '80° S', color: '#38BDF8', opacity: 0.35, dash: [3, 4] },
      { lat: -70, label: '70° S', color: '#38BDF8', opacity: 0.45, dash: [3, 4] },
      { lat: -66.562, label: "Antarctic Circle (66°34' S)", color: '#F59E0B', opacity: 0.85, dash: [6, 6] },
      { lat: -60, label: '60° S', color: '#38BDF8', opacity: 0.55, dash: [4, 4] },
      { lat: -50, label: '50° S (Outer Ocean)', color: '#38BDF8', opacity: 0.70, dash: [] },
    ];

    latRings.forEach((ring) => {
      const normR = (ring.lat - -90) / (-50 - -90);
      const r = normR * maxR;

      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.opacity;
      ctx.lineWidth = ring.lat === -66.562 ? 1.8 : 1.0;
      ctx.setLineDash(ring.dash);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = ring.color;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(ring.label, cx + 8, cy - r + 3);
    });

    // 3. Radial Longitude Meridians (0°, 45°E, 90°E, 135°E, 180°, 135°W, 90°W, 45°W)
    const meridians = [
      { lon: 0, label: '0° (Prime)' },
      { lon: 45, label: '45° E' },
      { lon: 90, label: '90° E' },
      { lon: 135, label: '135° E' },
      { lon: 180, label: '180°' },
      { lon: -135, label: '135° W' },
      { lon: -90, label: '90° W' },
      { lon: -45, label: '45° W' },
    ];

    meridians.forEach((m) => {
      const rad = (m.lon * Math.PI) / 180;
      const x2 = cx + maxR * Math.sin(rad);
      const y2 = cy - maxR * Math.cos(rad);

      ctx.strokeStyle = '#38BDF8';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 4]);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const lx = cx + (maxR + 14) * Math.sin(rad);
      const ly = cy - (maxR + 14) * Math.cos(rad);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#7DD3FC';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, lx, ly + 4);
    });

    // 4. Geographic Region Text Labels matching reference image
    const regions = [
      { name: 'SOUTHERN OCEAN', lat: -54.0, lon: 0.0, color: '#38BDF8', font: 'black 12px Inter, sans-serif' },
      { name: 'SOUTHERN OCEAN', lat: -54.0, lon: 180.0, color: '#38BDF8', font: 'black 12px Inter, sans-serif' },
      { name: 'SOUTHERN OCEAN', lat: -54.0, lon: 90.0, color: '#38BDF8', font: 'black 12px Inter, sans-serif' },
      { name: 'SOUTHERN OCEAN', lat: -54.0, lon: -90.0, color: '#38BDF8', font: 'black 12px Inter, sans-serif' },
      { name: 'WEDDELL SEA', lat: -74.0, lon: -40.0, color: '#60A5FA', font: 'bold 11px Inter, sans-serif' },
      { name: 'ROSS SEA', lat: -76.0, lon: 175.0, color: '#60A5FA', font: 'bold 11px Inter, sans-serif' },
      { name: 'AMUNDSEN SEA', lat: -72.0, lon: -110.0, color: '#60A5FA', font: 'bold 11px Inter, sans-serif' },
      { name: 'BELLINGSHAUSEN SEA', lat: -71.0, lon: -85.0, color: '#60A5FA', font: 'bold 11px Inter, sans-serif' },
      { name: 'EAST ANTARCTICA', lat: -78.0, lon: 75.0, color: '#94A3B8', font: 'bold 11px Inter, sans-serif' },
      { name: 'WEST ANTARCTICA', lat: -78.0, lon: -105.0, color: '#94A3B8', font: 'bold 11px Inter, sans-serif' },
      { name: 'ANTARCTIC PENINSULA', lat: -68.0, lon: -65.0, color: '#CBD5E1', font: 'bold 10px Inter, sans-serif' },
      { name: 'SOUTH POLE (-90°S)', lat: -90.0, lon: 0.0, color: '#EF4444', font: 'black 11px Inter, sans-serif' },
    ];

    regions.forEach((r) => {
      const p = this.project({ latitude: r.lat, longitude: r.lon }, w, h);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = r.color;
      ctx.font = r.font;
      ctx.textAlign = 'center';
      ctx.fillText(r.name, p.x, p.y);
    });

    ctx.restore();
  }

  private renderBathymetry(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const zoom = this.getZoomScale();
    const pan = this.getPanOffset();
    const cx = w / 2 + pan.x;
    const cy = h / 2 + pan.y;
    const maxR = (Math.min(w, h) / 2 - 25) * zoom;

    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.3, cx, cy, maxR);
    grad.addColorStop(0, 'rgba(12, 32, 54, 0.0)');
    grad.addColorStop(1, 'rgba(14, 45, 78, 0.40)');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderSentinel1SarLayer(ctx: CanvasRenderingContext2D, w: number, h: number, state: PolarisAppState) {
    const imageUrl = state.sentinel1ImageUrl;
    if (!imageUrl || !state.sentinel1ImageAvailable) return;

    if (this.sarImageUrl !== imageUrl) {
      this.sarImageUrl = imageUrl;
      this.sarImage = null;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      img.onload = () => {
        this.sarImage = img;
      };
      img.onerror = () => {
        this.sarImage = null;
      };
    }

    if (!this.sarImage || !this.sarImage.complete || this.sarImage.naturalWidth === 0) return;

    const bbox = state.sentinel1ImageBbox || state.sentinel1ImageMetadata?.image_bbox;
    if (!bbox) return;

    const pNW = this.project({ latitude: bbox.max_lat, longitude: bbox.min_lon }, w, h);
    const pSE = this.project({ latitude: bbox.min_lat, longitude: bbox.max_lon }, w, h);

    const imgX = Math.min(pNW.x, pSE.x);
    const imgY = Math.min(pNW.y, pSE.y);
    const imgW = Math.abs(pSE.x - pNW.x);
    const imgH = Math.abs(pSE.y - pNW.y);

    ctx.save();
    ctx.globalAlpha = state.sentinel1Opacity ?? 0.70;
    ctx.drawImage(this.sarImage, imgX, imgY, imgW, imgH);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(imgX, imgY, imgW, imgH);
    ctx.restore();
  }

  private renderSeaIceGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    grid: EnvironmentalCell[][],
    horizon: ValidTimeHorizon,
    state: PolarisAppState
  ) {
    ctx.save();
    const threshold = state.vessel.safeSicThresholdPercent;

    for (let r = 0; r < grid.length - 1; r++) {
      for (let c = 0; c < grid[r].length - 1; c++) {
        const cell = grid[r][c];
        if (cell.isLand || cell.isIceShelf) continue;

        const sic = cell.sicValues[horizon] ?? cell.sicValues[0];
        if (sic < 10) continue;

        const p1 = this.project(grid[r][c], w, h);
        const p2 = this.project(grid[r][c + 1], w, h);
        const p3 = this.project(grid[r + 1][c + 1], w, h);
        const p4 = this.project(grid[r + 1][c], w, h);

        let fillStyle = 'rgba(6, 182, 212, 0.15)';
        if (sic >= threshold) fillStyle = 'rgba(239, 68, 68, 0.40)';
        else if (sic >= 50) fillStyle = 'rgba(245, 158, 11, 0.30)';
        else if (sic >= 25) fillStyle = 'rgba(14, 116, 144, 0.25)';

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderContinentalCoastline(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.fillStyle = '#0F1E36';
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.6;

    const coastPoints: GeoPoint[] = [
      { latitude: -69.2, longitude: -25.0 },
      { latitude: -75.0, longitude: -40.0 },
      { latitude: -74.0, longitude: -60.0 },
      { latitude: -65.0, longitude: -64.0 },
      { latitude: -70.0, longitude: -80.0 },
      { latitude: -73.0, longitude: -110.0 },
      { latitude: -77.0, longitude: -160.0 },
      { latitude: -78.0, longitude: 170.0 },
      { latitude: -67.0, longitude: 140.0 },
      { latitude: -66.5, longitude: 110.0 },
      { latitude: -69.0, longitude: 76.0 },
      { latitude: -67.0, longitude: 50.0 },
      { latitude: -70.0, longitude: 12.0 },
      { latitude: -69.2, longitude: -25.0 },
    ];

    ctx.beginPath();
    coastPoints.forEach((pt, i) => {
      const p = this.project(pt, w, h);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private renderNoGoZones(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    grid: EnvironmentalCell[][],
    horizon: ValidTimeHorizon,
    state: PolarisAppState
  ) {
    ctx.save();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell.isLand || cell.isIceShelf) continue;
        const risk = evaluateCellRisk(cell, horizon, state.vessel, state.icebergs);

        if (risk.isNoGo) {
          const pt = this.project(cell, w, h);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(pt.x - 3, pt.y - 3);
          ctx.lineTo(pt.x + 3, pt.y + 3);
          ctx.moveTo(pt.x + 3, pt.y - 3);
          ctx.lineTo(pt.x - 3, pt.y + 3);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  private renderVectors(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    grid: EnvironmentalCell[][],
    horizon: ValidTimeHorizon,
    showCurrent: boolean,
    _showWind: boolean
  ) {
    ctx.save();
    for (let r = 1; r < grid.length; r += 3) {
      for (let c = 1; c < grid[r].length; c += 3) {
        const cell = grid[r][c];
        if (cell.isLand) continue;
        const pt = this.project(cell, w, h);

        if (showCurrent) {
          const u = cell.currentUValues[horizon] ?? 1.0;
          const v = cell.currentVValues[horizon] ?? 0.0;
          const len = Math.min(14, Math.sqrt(u * u + v * v) * 8);

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + u * len, pt.y - v * len);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  private renderResearchStations(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    stations: import('../../types/domain').ResearchStation[]
  ) {
    ctx.save();
    for (const st of stations) {
      const pt = this.project(st.position, w, h);
      const isIndian = st.country === 'India';

      ctx.strokeStyle = isIndian ? '#F59E0B' : '#94A3B8';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = isIndian ? '#78350F' : '#1E293B';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isIndian ? '#FBBF24' : '#F8FAFC';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isIndian ? '#FDE68A' : '#CBD5E1';
      ctx.font = isIndian ? 'bold 10px Inter, sans-serif' : '9px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(st.name, pt.x + 8, pt.y + 3);
    }
    ctx.restore();
  }

  private renderIcebergs(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    icebergs: Iceberg[],
    _horizon: ValidTimeHorizon,
    layers: import('../../types/state').MapLayerState
  ) {
    ctx.save();

    for (const berg of icebergs) {
      const isB22 = berg.id === 'B-22';

      if (layers.icebergForecast && berg.historicalTrack.length > 1) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        berg.historicalTrack.forEach((pt, i) => {
          const p = this.project(pt, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      if (layers.icebergForecast && berg.forecastTrack.length > 1) {
        ctx.strokeStyle = isB22 && berg.riskLevel === 'CRITICAL' ? '#F59E0B' : '#06B6D4';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        berg.forecastTrack.forEach((pt, i) => {
          const p = this.project(pt, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      if (layers.icebergUncertainty) {
        berg.forecastTrack.forEach((pt) => {
          if (pt.horizonHours === 0) return;
          const p = this.project(pt, w, h);
          const visualRadius = Math.min(65, Math.max(8, Math.sqrt(pt.uncertaintyRadiusKm) * 1.5));

          ctx.fillStyle = isB22 && pt.horizonHours >= 24 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(6, 182, 212, 0.10)';
          ctx.strokeStyle = isB22 && pt.horizonHours >= 24 ? 'rgba(239, 68, 68, 0.50)' : 'rgba(6, 182, 212, 0.40)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);

          ctx.beginPath();
          ctx.arc(p.x, p.y, visualRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }

      const currPos = berg.currentPosition;
      const cp = this.project(currPos, w, h);

      ctx.fillStyle = isB22 ? '#EF4444' : '#38BDF8';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);

      ctx.beginPath();
      const s = isB22 ? 8 : 6;
      ctx.moveTo(cp.x, cp.y - s);
      ctx.lineTo(cp.x + s, cp.y);
      ctx.lineTo(cp.x, cp.y + s);
      ctx.lineTo(cp.x - s, cp.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const isAI = berg.modelSource === 'POLARIS_GRU_Neural_Network';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 10px Inter, sans-serif';
      const aiTag = isAI ? ' [AI GRU]' : '';
      ctx.fillText(`${berg.name}${aiTag}`, cp.x + 10, cp.y - 4);
    }
    ctx.restore();
  }

  private renderRoutes(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    routes: Route[],
    selectedRouteId: string | null,
    layers: import('../../types/state').MapLayerState,
    activeWhatIfResult?: any
  ) {
    ctx.save();

    for (const route of routes) {
      if (route.type === 'SHORTEST_REJECTED' && !layers.shortestRoute) continue;
      if (route.type === 'SAFE_A' && !layers.recommendedRoute) continue;
      if (route.type === 'ALTERNATIVE_B' && !layers.alternativeRoute) continue;

      const isSelected = route.id === selectedRouteId;
      const isRejected = route.type === 'SHORTEST_REJECTED' || route.status === 'REJECTED';

      ctx.strokeStyle = route.color;
      ctx.lineWidth = isSelected ? 3.5 : 2.0;
      ctx.setLineDash(isRejected ? [8, 6] : []);

      ctx.beginPath();
      route.waypoints.forEach((wp, i) => {
        const p = this.project(wp, w, h);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      route.waypoints.forEach((wp) => {
        const p = this.project(wp, w, h);

        if (wp.isNoGo || wp.segmentRisk >= 80) {
          ctx.fillStyle = '#EF4444';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = isSelected ? '#FFFFFF' : route.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, isSelected ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    ctx.restore();
  }

  private renderDestination(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dest: { name: string; latitude: number; longitude: number }
  ) {
    ctx.save();
    const p = this.project(dest, w, h);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TARGET: ' + dest.name, p.x + 18, p.y + 4);
    ctx.restore();
  }

  private renderVessel(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    start: GeoPoint,
    currentWp?: RouteWaypoint
  ) {
    ctx.save();
    const pos = currentWp ? { latitude: currentWp.latitude, longitude: currentWp.longitude } : start;
    const p = this.project(pos, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
    ctx.stroke();

    const rx = p.x + Math.cos(this.radarAngle) * 22;
    const ry = p.y + Math.sin(this.radarAngle) * 22;
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 8);
    ctx.lineTo(p.x + 6, p.y + 6);
    ctx.lineTo(p.x, p.y + 3);
    ctx.lineTo(p.x - 6, p.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('MV POLARIS EXPLORER', p.x + 16, p.y - 6);

    ctx.restore();
  }
}
