/**
 * POLARIS: High-Precision Antarctic Polar Map Renderer
 * Canvas & SVG geospatial visualization engine with independent togglable layers,
 * spatiotemporal hazard grids, dynamic ice edge, iceberg uncertainty corridors,
 * vessel tracking, and interactive waypoint inspection.
 */

import { PolarisAppState } from '../../types/state';
import { Route, Iceberg, GeoPoint, RouteWaypoint } from '../../types/domain';
import { EnvironmentalCell, RiskCell, ValidTimeHorizon } from '../../types/risk';
import { geoToMap, haversineDistanceKm } from '../../utils/geo';
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
}

export class PolarMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private props: PolarMapRendererProps;
  private animationFrameId: number | null = null;
  private radarAngle: number = 0;

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

  public render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const state = this.props.state;
    const layers = state.mapLayers;
    const timeHorizon: ValidTimeHorizon = state.simulationTimeHours;

    // 1. Clear background (Midnight Antarctic Ocean)
    ctx.fillStyle = '#060B14';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Polar Coordinate Grid (Latitude rings & Longitude meridians)
    this.renderPolarGrid(ctx, width, height);

    // 3. Render Bathymetry Depth Gradients
    if (layers.bathymetry) {
      this.renderBathymetry(ctx, width, height);
    }

    // 4. Render Sea-Ice Concentration Grid Cells & Ice Edge
    const envGrid = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, state.activeScenario);
    if (layers.seaIce) {
      this.renderSeaIceGrid(ctx, width, height, envGrid, timeHorizon, state);
    }

    // 5. Render Coastline & Permanent Ice Shelves
    this.renderContinentalCoastline(ctx, width, height);

    // 6. Render Hard No-Go Zones
    if (layers.noGoZones) {
      this.renderNoGoZones(ctx, width, height, envGrid, timeHorizon, state);
    }

    // 7. Render Ocean Current & Wind Vectors
    if (layers.oceanCurrent || layers.weather) {
      this.renderVectors(ctx, width, height, envGrid, timeHorizon, layers.oceanCurrent, layers.weather);
    }

    // 8. Render Research Stations (Bharati, Maitri, etc.)
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
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);

    // Latitude arcs (-60°, -65°, -70°, -75°)
    const lats = [-60, -65, -70, -75];
    for (const lat of lats) {
      ctx.beginPath();
      for (let lon = -25; lon <= 75; lon += 2) {
        const pt = geoToMap({ latitude: lat, longitude: lon }, w, h);
        if (lon === -25) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Label latitude
      const lblPt = geoToMap({ latitude: lat, longitude: -23 }, w, h);
      ctx.fillStyle = '#475569';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${Math.abs(lat)}°S`, lblPt.x, lblPt.y - 4);
    }

    // Longitude meridians (-20°, 0°, 20°, 40°, 60°, 75°)
    const lons = [-20, 0, 20, 40, 60, 75];
    for (const lon of lons) {
      ctx.beginPath();
      for (let lat = -58; lat >= -75; lat -= 1) {
        const pt = geoToMap({ latitude: lat, longitude: lon }, w, h);
        if (lat === -58) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      const lblPt = geoToMap({ latitude: -58.5, longitude: lon }, w, h);
      ctx.fillStyle = '#475569';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${lon >= 0 ? lon + '°E' : Math.abs(lon) + '°W'}`, lblPt.x - 10, lblPt.y);
    }
    ctx.restore();
  }

  private renderBathymetry(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Subtle continental shelf bathymetry tint in the south
    const shelfTop = geoToMap({ latitude: -66.5, longitude: 0 }, w, h);
    const shelfBot = geoToMap({ latitude: -75.0, longitude: 0 }, w, h);

    const grad = ctx.createLinearGradient(0, shelfTop.y, 0, shelfBot.y);
    grad.addColorStop(0, 'rgba(12, 32, 54, 0.0)');
    grad.addColorStop(1, 'rgba(14, 45, 78, 0.35)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, shelfTop.y, w, shelfBot.y - shelfTop.y + 40);
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
        if (sic < 10) continue; // Open water

        const p1 = geoToMap(grid[r][c], w, h);
        const p2 = geoToMap(grid[r][c + 1], w, h);
        const p3 = geoToMap(grid[r + 1][c + 1], w, h);
        const p4 = geoToMap(grid[r + 1][c], w, h);

        let fillStyle = 'rgba(6, 182, 212, 0.12)'; // 10-25% Low
        if (sic >= threshold) {
          fillStyle = 'rgba(239, 68, 68, 0.40)'; // > Threshold Critical
        } else if (sic >= 50) {
          fillStyle = 'rgba(245, 158, 11, 0.30)'; // 50-70% High
        } else if (sic >= 25) {
          fillStyle = 'rgba(14, 116, 144, 0.22)'; // 25-50% Moderate
        }

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        // Subtle cell border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Dynamic Forecast Ice Edge (SIC >= 15% contour line)
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    let edgeStarted = false;

    for (let c = 0; c < grid[0].length; c++) {
      for (let r = 0; r < grid.length; r++) {
        const cell = grid[r][c];
        const sic = cell.sicValues[horizon] ?? cell.sicValues[0];
        if (sic >= 15 && !cell.isLand) {
          const pt = geoToMap(cell, w, h);
          if (!edgeStarted) {
            ctx.moveTo(pt.x, pt.y);
            edgeStarted = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
          break;
        }
      }
    }
    ctx.stroke();

    // ConvLSTM Spatiotemporal Model Coverage Sector Outline (Queen Maud Land: -70° to -60°S, 0° to 30°E)
    const pNW = geoToMap({ latitude: -60.0, longitude: 0.0 }, w, h);
    const pNE = geoToMap({ latitude: -60.0, longitude: 30.0 }, w, h);
    const pSE = geoToMap({ latitude: -70.0, longitude: 30.0 }, w, h);
    const pSW = geoToMap({ latitude: -70.0, longitude: 0.0 }, w, h);

    ctx.strokeStyle = 'rgba(20, 184, 166, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pNW.x, pNW.y);
    ctx.lineTo(pNE.x, pNE.y);
    ctx.lineTo(pSE.x, pSE.y);
    ctx.lineTo(pSW.x, pSW.y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 184, 166, 0.05)';
    ctx.fill();

    ctx.fillStyle = '#2dd4bf';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('CONVLSTM AI SECTOR [0°E-30°E, 60°S-70°S]', pNW.x + 6, pNW.y + 14);

    ctx.restore();
  }

  private renderContinentalCoastline(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    // Solid Antarctic Continent Body
    ctx.fillStyle = '#0F1A2E';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    const coastPoints: GeoPoint[] = [
      { latitude: -69.2, longitude: -25.0 },
      { latitude: -70.4, longitude: -10.0 },
      { latitude: -70.7, longitude: 10.0 }, // Maitri region
      { latitude: -69.8, longitude: 25.0 },
      { latitude: -68.5, longitude: 40.0 }, // Syowa region
      { latitude: -67.2, longitude: 55.0 },
      { latitude: -69.0, longitude: 70.0 },
      { latitude: -69.5, longitude: 76.0 }, // Bharati region
      { latitude: -75.0, longitude: 75.0 },
      { latitude: -75.0, longitude: -25.0 },
    ];

    coastPoints.forEach((pt, i) => {
      const p = geoToMap(pt, w, h);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Permanent Ice Shelves (Fimbul & Amery Ice Shelves in white/cyan tint)
    ctx.fillStyle = 'rgba(203, 213, 225, 0.18)';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    const shelfPoints: GeoPoint[] = [
      { latitude: -69.5, longitude: -5.0 },
      { latitude: -70.8, longitude: 5.0 },
      { latitude: -71.2, longitude: 18.0 },
      { latitude: -70.0, longitude: 12.0 },
      { latitude: -69.5, longitude: -5.0 },
    ];
    ctx.beginPath();
    shelfPoints.forEach((pt, i) => {
      const p = geoToMap(pt, w, h);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.fill();
    ctx.stroke();

    // Label Continent
    const labelPos = geoToMap({ latitude: -73.2, longitude: 25.0 }, w, h);
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EAST ANTARCTICA (QUEEN MAUD LAND)', labelPos.x, labelPos.y);

    const shelfPos = geoToMap({ latitude: -70.3, longitude: 6.0 }, w, h);
    ctx.font = 'italic 10px Inter, sans-serif';
    ctx.fillText('Fimbul Ice Shelf', shelfPos.x, shelfPos.y);

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
          const pt = geoToMap(cell, w, h);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
          ctx.fill();

          // Small warning cross
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
          ctx.lineWidth = 1.5;
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
        const pt = geoToMap(cell, w, h);

        if (showCurrent) {
          const u = cell.currentUValues[horizon] ?? 1.0;
          const v = cell.currentVValues[horizon] ?? 0.0;
          const len = Math.min(14, Math.sqrt(u * u + v * v) * 8);

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + u * len, pt.y - v * len);
          ctx.stroke();
        }

        if (_showWind) {
          const wind = cell.windValues[horizon] ?? 30;
          const windDirRad = ((cell.longitude + 30) * Math.PI) / 180;
          const wu = Math.cos(windDirRad);
          const wv = Math.sin(windDirRad);
          const wlen = Math.min(16, (wind / 50) * 12);

          ctx.strokeStyle = wind >= 55 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(168, 85, 247, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + wu * wlen, pt.y - wv * wlen);
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
      const pt = geoToMap(st.position, w, h);
      const isIndian = st.country === 'India';

      // Outer ring
      ctx.strokeStyle = isIndian ? '#F59E0B' : '#94A3B8';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = isIndian ? '#78350F' : '#1E293B';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = isIndian ? '#FBBF24' : '#F8FAFC';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // Label
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

      // 1. Historical Track (Solid gray line)
      if (layers.icebergForecast && berg.historicalTrack.length > 1) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        berg.historicalTrack.forEach((pt, i) => {
          const p = geoToMap(pt, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      // 2. Forecast Trajectory (Dashed Cyan/Amber line)
      if (layers.icebergForecast && berg.forecastTrack.length > 1) {
        ctx.strokeStyle = isB22 && berg.riskLevel === 'CRITICAL' ? '#F59E0B' : '#06B6D4';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        berg.forecastTrack.forEach((pt, i) => {
          const p = geoToMap(pt, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      // 3. Expanding Uncertainty Envelopes (Calibrated visual scaling)
      if (layers.icebergUncertainty) {
        berg.forecastTrack.forEach((pt) => {
          if (pt.horizonHours === 0) return; // Skip 0h anchor
          const p = geoToMap(pt, w, h);
          // Visual radius smoothly scaled between 8px and 65px so it indicates expanding uncertainty without occluding the canvas
          const visualRadius = Math.min(65, Math.max(8, Math.sqrt(pt.uncertaintyRadiusKm) * 1.5));

          ctx.fillStyle = isB22 && pt.horizonHours >= 24 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(6, 182, 212, 0.10)';
          ctx.strokeStyle = isB22 && pt.horizonHours >= 24 ? 'rgba(239, 68, 68, 0.50)' : 'rgba(6, 182, 212, 0.40)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);

          ctx.beginPath();
          ctx.arc(p.x, p.y, visualRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Forecast node timestamp label (+24h, +48h or Day +1)
          const nodeLabel = pt.stepLabel ? `${pt.stepLabel}` : `+${pt.horizonHours}h`;
          ctx.fillStyle = isB22 && pt.horizonHours >= 24 ? '#FCA5A5' : '#7DD3FC';
          ctx.font = 'bold 8.5px Inter, sans-serif';
          ctx.fillText(nodeLabel, p.x + visualRadius + 3, p.y + 3);
        });
      }

      // 4. Current Iceberg Diamond Marker
      const currPos = berg.currentPosition;
      const cp = geoToMap(currPos, w, h);

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

      // Iceberg Name & Size Tag with AI Model indicator
      const isAI = berg.modelSource === 'POLARIS_GRU_Neural_Network';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 10px Inter, sans-serif';
      const aiTag = isAI ? ' [AI GRU]' : '';
      ctx.fillText(`${berg.name}${aiTag} (${berg.driftDirectionLabel} ${berg.speedKmh}km/h)`, cp.x + 10, cp.y - 4);
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

      // Outer glow for selected route
      if (isSelected) {
        ctx.strokeStyle = isRejected ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)';
        ctx.lineWidth = 8;
        ctx.setLineDash([]);
        ctx.beginPath();
        route.waypoints.forEach((wp, i) => {
          const p = geoToMap(wp, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      // Main Route Polyline
      ctx.strokeStyle = route.color;
      ctx.lineWidth = isSelected ? 3.5 : 2.0;
      if (isRejected) {
        ctx.setLineDash([8, 6]); // Dashed line for rejected shortest route
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      route.waypoints.forEach((wp, i) => {
        const p = geoToMap(wp, w, h);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Waypoint Dots & Critical Hazard Badges
      route.waypoints.forEach((wp) => {
        const p = geoToMap(wp, w, h);

        if (wp.isNoGo || wp.segmentRisk >= 80) {
          // Critical Hazard Dot
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

    // 10. Scenario Route Layer (from active What-If simulation)
    if (activeWhatIfResult && activeWhatIfResult.scenario_optimization) {
      const opt = activeWhatIfResult.scenario_optimization;
      const candidates: any[] = opt.candidate_routes || [];
      const recId = opt.recommended_route_id;
      const recRoute = candidates.find((c) => c.route_id === recId) || candidates[0];

      if (recRoute && recRoute.waypoints && recRoute.waypoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#8B5CF6'; // purple-500
        ctx.lineWidth = 3.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        recRoute.waypoints.forEach((wp: any, i: number) => {
          const p = geoToMap(wp, w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Scenario waypoints
        recRoute.waypoints.forEach((wp: any) => {
          const p = geoToMap(wp, w, h);
          ctx.fillStyle = '#A78BFA';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        // Scenario Route Indicator Label
        if (recRoute.waypoints.length > 1) {
          const midWp = recRoute.waypoints[Math.floor(recRoute.waypoints.length / 2)];
          const pMid = geoToMap(midWp, w, h);
          ctx.fillStyle = '#8B5CF6';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('⚡ SCENARIO ROUTE', pMid.x + 8, pMid.y - 8);
        }
        ctx.restore();
      }
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
    const p = geoToMap(dest, w, h);

    // Glowing target concentric rings
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Destination Flag Banner
    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DESTINATION: ' + dest.name, p.x + 18, p.y + 4);
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
    const p = geoToMap(pos, w, h);

    // Radar Sweep Ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
    ctx.stroke();

    // Radar beam
    const rx = p.x + Math.cos(this.radarAngle) * 24;
    const ry = p.y + Math.sin(this.radarAngle) * 24;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    // Ship Chevron Marker
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

    // Vessel Label
    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('MV POLARIS EXPLORER', p.x + 16, p.y - 6);

    ctx.restore();
  }
}
