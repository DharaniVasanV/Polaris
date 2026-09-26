/**
 * POLARIS: Global Reactive State Store
 * Central state management for authentication, 4D simulation, A* routing,
 * scenario overlays, alerts, audit logging, and SIH demo director.
 */

import { PolarisAppState, AppScreen, ForecastHorizonDay, MapLayerState } from '../types/state';
import { VesselProfile, Route, Iceberg, PolarisAlert, EventLogEntry, DemonstrationFleetVessel, ResearchStation, RouteStatus } from '../types/domain';
import { ValidTimeHorizon, RiskWeights } from '../types/risk';
import { ScenarioId, ScenarioOverlay } from '../types/scenario';
import { BASELINE_ENVIRONMENT_GRID } from '../data/baselineEnvironment';
import { BASELINE_ICEBERGS } from '../data/icebergs';
import { DEMO_RESEARCH_STATIONS } from '../data/stations';
import { DEMO_FLEET_VESSELS } from '../data/fleet';
import { DEFAULT_RISK_WEIGHTS } from '../simulation/riskEngine';
import { SCENARIO_PRESETS, applyScenarioToEnvironment, applyScenarioToIcebergs } from '../simulation/scenarioEngine';
import { generatePolarisRoutes } from '../simulation/routeEngine';
import { HAZARD_SIMULATION_STEPS, createHazardAlert, createHazardEventLogs } from '../simulation/hazardSimulation';
import { checkModelServerHealth } from '../services/aiModelService';
import { updateIcebergForecastWithGRU } from '../services/forecastEngineIntegration';
import { fetchSeaIceForecast, checkSeaIceServerHealth, ForecastHorizon } from '../services/seaIceModelService';
import { fetchWeatherForecast, checkWeatherServerHealth, WeatherGridResponse } from '../services/weatherModelService';
import { fetchSentinel1Latest, fetchSentinel1ImageMetadata, getSentinel1ImageUrl, Sentinel1StatusResponse } from '../services/sentinel1Service';
import { optimizeRoutesViaBackend } from '../services/routeOptimizationService';
import { simulateScenarioViaBackend, runSensitivitySweepViaBackend } from '../services/scenarioService';
import { BackendScenarioType, BackendScenarioParameters } from '../types/scenario';
import {
  fetchRiskTwinSummary,
  fetchSystemEngineHealth,
  fetchCellInspection,
} from '../services/riskTwinService';
import {
  RiskTwinSummaryResponse,
  CellInspectionData,
  SystemEngineHealth,
} from '../types/riskTwin';

export const DEFAULT_VESSEL_PROFILE: VesselProfile = {
  id: 'VESSEL_POLARIS_01',
  name: 'MV Polaris Explorer',
  type: 'Antarctic Research Vessel',
  iceClass: 'PC3',
  draftMeters: 7.8,
  safetyDepthMarginMeters: 2.5, // Required Depth = 10.3m
  nominalSpeedKnots: 14.0,
  fuelCapacityTonnes: 1200,
  safeSicThresholdPercent: 70,  // Configured vessel threshold
  icebergSafetyBufferKm: 12.0,  // Configurable safety buffer
  maxSafeWaveHeightMeters: 4.0, // Configurable max wave limit
  riskPreference: 'MAX_SAFETY',
};

const DEFAULT_MAP_LAYERS: MapLayerState = {
  seaIce: true,
  icebergs: true,
  icebergForecast: true,
  icebergUncertainty: true,
  weather: true,
  oceanCurrent: true,
  bathymetry: true,
  noGoZones: true,
  recommendedRoute: true,
  alternativeRoute: true,
  shortestRoute: true,
  researchStations: true,
  fleetVessels: true,
  sentinel1Sar: false,
};

function createInitialState(): PolarisAppState {
  const initialScenario = SCENARIO_PRESETS.NORMAL;
  const initialEnv = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, initialScenario);
  const initialIcebergs = applyScenarioToIcebergs(BASELINE_ICEBERGS, initialScenario);
  const initialRoutes = generatePolarisRoutes(initialEnv, DEFAULT_VESSEL_PROFILE, initialIcebergs, initialScenario);

  const initialAlerts: PolarisAlert[] = [
    {
      id: 'alert_init_1',
      severity: 'INFO',
      title: 'Polar Telemetry Synchronized',
      description: 'Satellite SAR ice concentration and iceberg drift vectors synchronized at 12:40 UTC.',
      actionRequired: 'Proceed with voyage planning or monitoring',
      timestampUtc: new Date().toISOString(),
      isAcknowledged: false,
      sourceModule: 'Data Telemetry Ingestion',
    },
  ];

  const initialLogs: EventLogEntry[] = [
    {
      id: 'log_0',
      timestampUtc: new Date().toISOString(),
      simulationTimeFormatted: '12:40 UTC',
      category: 'SYSTEM',
      message: 'POLARIS system initialized. Antarctic demonstration corridor active.',
      severity: 'NORMAL',
    },
  ];

  return {
    isAuthenticated: false,
    userEmail: 'captain@polaris.ai',
    offlineMode: false,
    demoMode: true,
    presentationMode: false,
    activeScreen: 'LANDING',

    snapshotTimeUtc: '12:40 UTC',
    simulationTimeHours: 0,
    forecastHorizon: 'TODAY',

    vessel: { ...DEFAULT_VESSEL_PROFILE },
    departureLocation: { name: 'Antarctic Mission Corridor (Start)', latitude: -63.0, longitude: 0.0 },
    destinationLocation: { name: 'Larsemann Hills / Bharati Base', latitude: -68.8, longitude: 74.0 },

    routes: initialRoutes,
    selectedRouteId: initialRoutes[0]?.id ?? 'route_safe_a',
    activeRouteStatus: 'RECOMMENDED',

    icebergs: initialIcebergs,
    activeScenarioId: 'NORMAL',
    activeScenario: initialScenario,

    alerts: initialAlerts,
    eventLog: initialLogs,
    fleet: [...DEMO_FLEET_VESSELS],
    researchStations: [...DEMO_RESEARCH_STATIONS],

    riskWeights: { ...DEFAULT_RISK_WEIGHTS },
    mapLayers: { ...DEFAULT_MAP_LAYERS },

    isHazardSimulationRunning: false,
    hazardSimulationStep: 0,

    isGeneratingRoute: false,
    routeGenerationStage: '',

    aiModelStatus: 'CONNECTING',
    lastAiModelSync: undefined,
    seaIceModelStatus: 'CONNECTING',
    seaIceForecastData: null,
    selectedSeaIceHorizon: '24h',
    lastSeaIceSync: undefined,
    weatherModelStatus: 'CONNECTING',
    weatherForecastData: null,
    lastWeatherSync: undefined,

    // Phase 10A & 10B: Sentinel-1
    sentinel1Status: 'CONNECTING',
    sentinel1Data: null,
    lastSentinel1Sync: undefined,

    sentinel1ImageAvailable: false,
    sentinel1ImageUrl: null,
    sentinel1ImageBbox: null,
    sentinel1ImageMetadata: null,
    sentinel1ImageLoading: false,
    sentinel1ImageError: null,
    sentinel1Opacity: 0.70,
  };
}

class PolarisStore {
  private state: PolarisAppState;
  private listeners: Set<(state: PolarisAppState) => void> = new Set();

  constructor() {
    this.state = createInitialState();
    this.initAiModelConnection();
  }

  public getState(): PolarisAppState {
    return this.state;
  }

  public subscribe(listener: (state: PolarisAppState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public setState(updater: (prev: PolarisAppState) => Partial<PolarisAppState>) {
    const partial = updater(this.state);
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  // --- Actions ---

  public login(email: string, password: string): boolean {
    this.setState((prev) => ({
      isAuthenticated: true,
      userEmail: email || 'captain@polaris.ai',
      offlineMode: false,
      activeScreen: 'DASHBOARD',
    }));
    this.addEventLog('SYSTEM', `User ${email} signed in via primary satellite link.`, 'NORMAL');
    return true;
  }

  public emergencyOfflineLogin(): boolean {
    this.setState((prev) => ({
      isAuthenticated: true,
      userEmail: 'captain.offline@polaris.ai',
      offlineMode: true,
      activeScreen: 'DASHBOARD',
    }));
    this.addEventLog('SYSTEM', 'EMERGENCY OFFLINE LOGIN activated. Using cached Antarctic environmental snapshot.', 'WARNING');
    return true;
  }

  public logout() {
    this.setState(() => ({
      isAuthenticated: false,
      activeScreen: 'LANDING',
    }));
    this.addEventLog('SYSTEM', 'User signed out. Session cleared.', 'NORMAL');
  }

  public setScreen(screen: AppScreen) {
    this.setState(() => ({ activeScreen: screen }));
  }

  public setSimulationTime(hours: ValidTimeHorizon) {
    this.setState(() => ({ simulationTimeHours: hours }));
  }

  public setForecastHorizon(horizon: ForecastHorizonDay) {
    this.setState(() => ({ forecastHorizon: horizon }));
  }

  public toggleMapLayer(layerKey: keyof MapLayerState) {
    this.setState((prev) => ({
      mapLayers: {
        ...prev.mapLayers,
        [layerKey]: !prev.mapLayers[layerKey],
      },
    }));
  }

  public setVesselProfile(vesselUpdate: Partial<VesselProfile>) {
    const updatedVessel = { ...this.state.vessel, ...vesselUpdate };
    this.setState(() => ({ vessel: updatedVessel }));
    this.addEventLog('ROUTE', `Vessel profile updated (SIC limit: ${updatedVessel.safeSicThresholdPercent}%, Buffer: ${updatedVessel.icebergSafetyBufferKm}km, Draft: ${updatedVessel.draftMeters}m). Recomputing routes...`, 'NORMAL');
    this.generateRoutesAsync();
  }

  public loadDemoVoyage() {
    this.setState(() => ({
      departureLocation: { name: 'Antarctic Mission Corridor (Start)', latitude: -63.0, longitude: 0.0 },
      destinationLocation: { name: 'Larsemann Hills / Bharati Base', latitude: -68.8, longitude: 74.0 },
      vessel: { ...DEFAULT_VESSEL_PROFILE },
    }));
    this.addEventLog('ROUTE', 'Demo Voyage loaded: Queen Maud Land to Bharati Station Corridor.', 'NORMAL');
  }

  public generateRoutesAsync(onComplete?: () => void) {
    this.setState(() => ({
      isGeneratingRoute: true,
      routeGenerationStage: 'Synchronizing environmental layers (Sea Ice, Icebergs, Weather, Bathymetry)...',
    }));

    const stages = [
      { msg: 'BUILDING SPATIOTEMPORAL RISK FIELD: Risk(Location, Time)...', delay: 400 },
      { msg: 'ESTIMATING ARRIVAL TIMES AT TRANSIT WAYPOINTS...', delay: 800 },
      { msg: 'EVALUATING HAZARD INTERSECTIONS & HARD NO-GO MASKS...', delay: 1200 },
      { msg: 'RUNNING TIME-AWARE A* MULTI-OBJECTIVE OPTIMIZER...', delay: 1600 },
      { msg: 'RANKING ROUTE ALTERNATIVES & EXPLANATIONS...', delay: 2000 },
    ];

    for (const st of stages) {
      setTimeout(() => {
        this.setState(() => ({ routeGenerationStage: st.msg }));
      }, st.delay);
    }

    // Invoke authoritative backend Multi-Objective Route Optimizer
    optimizeRoutesViaBackend({
      departureLocation: this.state.departureLocation,
      destinationLocation: this.state.destinationLocation,
      vessel: this.state.vessel,
      riskWeights: this.state.riskWeights,
    }).then((result) => {
      setTimeout(() => {
        if (result && result.routes.length > 0) {
          this.setState(() => ({
            isGeneratingRoute: false,
            routeGenerationStage: '',
            routes: result.routes,
            selectedRouteId: result.recommendedRouteId,
            activeRouteStatus: 'RECOMMENDED',
          }));

          this.addEventLog('ROUTE', `POLARIS optimization completed: ${result.recommendationReason}`, 'NORMAL');
        } else {
          // Client-side fallback for offline demonstration mode
          const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, this.state.activeScenario);
          const bergs = applyScenarioToIcebergs(this.state.icebergs.length > 0 ? this.state.icebergs : BASELINE_ICEBERGS, this.state.activeScenario);
          const routes = generatePolarisRoutes(env, this.state.vessel, bergs, this.state.activeScenario);

          this.setState(() => ({
            isGeneratingRoute: false,
            routeGenerationStage: '',
            routes,
            selectedRouteId: routes[0]?.id ?? 'route_safe_a',
            activeRouteStatus: 'RECOMMENDED',
          }));

          this.addEventLog('ROUTE', 'POLARIS client-side analysis completed (offline fallback). Safe Route recommended.', 'NORMAL');
        }
        if (onComplete) onComplete();
      }, 2200);
    }).catch((err) => {
      console.warn('[POLARIS] Route optimization error, falling back to local simulation:', err);
      setTimeout(() => {
        const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, this.state.activeScenario);
        const bergs = applyScenarioToIcebergs(this.state.icebergs.length > 0 ? this.state.icebergs : BASELINE_ICEBERGS, this.state.activeScenario);
        const routes = generatePolarisRoutes(env, this.state.vessel, bergs, this.state.activeScenario);

        this.setState(() => ({
          isGeneratingRoute: false,
          routeGenerationStage: '',
          routes,
          selectedRouteId: routes[0]?.id ?? 'route_safe_a',
          activeRouteStatus: 'RECOMMENDED',
        }));
        if (onComplete) onComplete();
      }, 2200);
    });
  }

  public selectRoute(routeId: string) {
    const route = this.state.routes.find((r) => r.id === routeId);
    this.setState(() => ({
      selectedRouteId: routeId,
      activeRouteStatus: route ? route.status : 'AVAILABLE',
    }));
  }

  public approveRoute(routeId: string) {
    this.setState((prev) => ({
      routes: prev.routes.map((r) =>
        r.id === routeId ? { ...r, status: 'APPROVED_BY_HUMAN' } : r
      ),
      activeRouteStatus: 'APPROVED_BY_HUMAN',
    }));
    this.addEventLog('DECISION', `Captain approved route ${routeId} for operational execution.`, 'NORMAL');
  }

  public applyScenario(scenarioId: ScenarioId) {
    const scenario = SCENARIO_PRESETS[scenarioId] ?? SCENARIO_PRESETS.NORMAL;
    const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, scenario);
    const bergs = applyScenarioToIcebergs(BASELINE_ICEBERGS, scenario);
    const routes = generatePolarisRoutes(env, this.state.vessel, bergs, scenario);

    const isNoSafe = scenarioId === 'NO_SAFE_ROUTE';
    const isShift = scenarioId === 'ICEBERG_SHIFT';

    this.setState(() => ({
      activeScenarioId: scenarioId,
      activeScenario: scenario,
      icebergs: bergs,
      routes,
      selectedRouteId: isNoSafe ? 'route_safe_a' : isShift ? 'route_alternative_b' : 'route_safe_a',
      activeRouteStatus: isNoSafe ? 'REJECTED' : isShift ? 'RECOMMENDED' : 'RECOMMENDED',
    }));

    this.addEventLog('ENV', `What-If scenario applied: ${scenario.title}.`, isNoSafe ? 'CRITICAL' : 'WARNING');
  }

  public runHazardSimulation(onComplete?: () => void) {
    if (this.state.isHazardSimulationRunning) return;

    this.setState(() => ({
      isHazardSimulationRunning: true,
      hazardSimulationStep: 1,
    }));

    let currentDelay = 0;
    HAZARD_SIMULATION_STEPS.forEach((step, idx) => {
      currentDelay += step.durationMs;
      setTimeout(() => {
        this.setState(() => ({ hazardSimulationStep: step.stepNumber }));

        if (step.stageName === 'CRITICAL_ALERT') {
          const alert = createHazardAlert();
          this.setState((prev) => ({
            alerts: [alert, ...prev.alerts],
          }));
        }

        if (step.stageName === 'AUTO_REPLANNING') {
          // Shift scenario to ICEBERG_SHIFT
          const scenario = SCENARIO_PRESETS.ICEBERG_SHIFT;
          const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, scenario);
          const bergs = applyScenarioToIcebergs(BASELINE_ICEBERGS, scenario);
          const routes = generatePolarisRoutes(env, this.state.vessel, bergs, scenario);

          this.setState(() => ({
            activeScenarioId: 'ICEBERG_SHIFT',
            activeScenario: scenario,
            icebergs: bergs,
            routes,
            selectedRouteId: 'route_alternative_b',
            activeRouteStatus: 'RECOMMENDED',
          }));
        }

        if (idx === HAZARD_SIMULATION_STEPS.length - 1) {
          const newLogs = createHazardEventLogs();
          this.setState((prev) => ({
            isHazardSimulationRunning: false,
            hazardSimulationStep: 0,
            eventLog: [...newLogs, ...prev.eventLog],
          }));
          if (onComplete) onComplete();
        }
      }, currentDelay);
    });
  }

  public resetDemo() {
    const initialState = createInitialState();
    this.state = {
      ...initialState,
      isAuthenticated: true,
      activeScreen: 'DASHBOARD',
    };
    this.notify();
    this.addEventLog('SYSTEM', 'Demo reset to initial baseline state.', 'NORMAL');
    this.initAiModelConnection();
  }

  public togglePresentationMode() {
    this.setState((prev) => ({ presentationMode: !prev.presentationMode }));
  }

  public acknowledgeAlert(alertId: string) {
    this.setState((prev) => ({
      alerts: prev.alerts.map((a) => (a.id === alertId ? { ...a, isAcknowledged: true } : a)),
    }));
  }

  public addEventLog(
    category: 'ENV' | 'ICEBERG' | 'ROUTE' | 'DECISION' | 'SYSTEM',
    message: string,
    severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'NORMAL' = 'NORMAL'
  ) {
    const now = new Date();
    const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;
    const newEntry: EventLogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestampUtc: now.toISOString(),
      simulationTimeFormatted: timeStr,
      category,
      message,
      severity,
    };
    this.setState((prev) => ({
      eventLog: [newEntry, ...prev.eventLog.slice(0, 49)],
    }));
  }

  // --- AI Model Backend Methods ---

  public async initAiModelConnection() {
    const isHealthy = await this.checkAiModelHealth();
    if (isHealthy) {
      await this.syncAllIcebergsWithGRUModel();
    }
    await this.syncSeaIceForecast();
    await this.syncWeatherForecast();
    await this.syncSentinel1();
    await this.syncRiskTwinSummary();
    await this.syncSystemHealth();
  }

  public async checkAiModelHealth(): Promise<boolean> {
    try {
      const health = await checkModelServerHealth();
      const isOnline = health !== null && health.status === 'HEALTHY';
      this.setState(() => ({
        aiModelStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      }));
      return isOnline;
    } catch {
      this.setState(() => ({ aiModelStatus: 'OFFLINE' }));
      return false;
    }
  }

  public async checkSeaIceHealth(): Promise<boolean> {
    try {
      const isOnline = await checkSeaIceServerHealth();
      this.setState(() => ({
        seaIceModelStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      }));
      return isOnline;
    } catch {
      this.setState(() => ({ seaIceModelStatus: 'OFFLINE' }));
      return false;
    }
  }

  public async checkWeatherHealth(): Promise<boolean> {
    try {
      const isOnline = await checkWeatherServerHealth();
      this.setState(() => ({
        weatherModelStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      }));
      return isOnline;
    } catch {
      this.setState(() => ({ weatherModelStatus: 'OFFLINE' }));
      return false;
    }
  }

  public async syncAllIcebergsWithGRUModel(safetyMarginKm: number = 30.0) {
    const currentIcebergs = this.state.icebergs;
    if (!currentIcebergs || currentIcebergs.length === 0) return;

    try {
      const updatedIcebergs = await Promise.all(
        currentIcebergs.map((berg) => updateIcebergForecastWithGRU(berg, 5, safetyMarginKm))
      );

      const now = new Date();
      const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

      this.setState(() => ({
        icebergs: updatedIcebergs,
        aiModelStatus: 'ONLINE',
        lastAiModelSync: timeStr,
      }));

      this.addEventLog('ICEBERG', `Synchronized ${updatedIcebergs.length} iceberg drift tracks with trained GRU neural model.`, 'NORMAL');
    } catch (err) {
      console.warn('[POLARIS] Error syncing icebergs with GRU model:', err);
      this.setState(() => ({ aiModelStatus: 'OFFLINE' }));
    }
  }

  public async syncSeaIceForecast() {
    try {
      this.setState(() => ({ seaIceModelStatus: 'CONNECTING' }));
      const { data, isLive } = await fetchSeaIceForecast();

      const horizons: ForecastHorizon[] = ['0h', '6h', '12h', '18h', '24h'];
      const horizonMap: Record<ForecastHorizon, ValidTimeHorizon> = {
        '0h': 0,
        '6h': 6,
        '12h': 12,
        '18h': 18,
        '24h': 24,
      };

      let updatedCount = 0;
      for (const h of horizons) {
        const numH = horizonMap[h];
        const cells = data.forecast[h] || [];
        for (const cell of cells) {
          if (
            cell.prediction_status === 'PREDICTED' &&
            cell.sic_percent !== null &&
            BASELINE_ENVIRONMENT_GRID[cell.row] &&
            BASELINE_ENVIRONMENT_GRID[cell.row][cell.column] &&
            !BASELINE_ENVIRONMENT_GRID[cell.row][cell.column].isLand
          ) {
            BASELINE_ENVIRONMENT_GRID[cell.row][cell.column].sicValues[numH] = Math.round(cell.sic_percent);
            if (cell.confidence !== null) {
              BASELINE_ENVIRONMENT_GRID[cell.row][cell.column].confidencePercent[numH] = Math.round(cell.confidence);
            }
            if (h === '24h') updatedCount++;
          }
        }
      }

      const now = new Date();
      const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

      const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, this.state.activeScenario);
      const bergs = applyScenarioToIcebergs(this.state.icebergs, this.state.activeScenario);
      const routes = generatePolarisRoutes(env, this.state.vessel, bergs, this.state.activeScenario);

      this.setState(() => ({
        seaIceModelStatus: isLive ? 'ONLINE' : 'OFFLINE',
        seaIceForecastData: data,
        lastSeaIceSync: timeStr,
        routes,
        selectedRouteId: routes[0]?.id ?? 'route_safe_a',
      }));

      this.addEventLog(
        'ENV',
        `Synchronized ${updatedCount} Queen Maud Land sector cells across 5 horizons with ConvLSTM2D model (${isLive ? 'live server' : 'bundled static export'}).`,
        'NORMAL'
      );
    } catch (err) {
      console.warn('[POLARIS] Error syncing ConvLSTM sea-ice forecast:', err);
      this.setState(() => ({ seaIceModelStatus: 'OFFLINE' }));
    }
  }

  public setSeaIceHorizon(horizon: ForecastHorizon) {
    this.setState(() => ({ selectedSeaIceHorizon: horizon }));
    const hourMap: Record<ForecastHorizon, ValidTimeHorizon> = {
      '0h': 0,
      '6h': 6,
      '12h': 12,
      '18h': 18,
      '24h': 24,
    };
    if (hourMap[horizon] !== undefined) {
      this.setSimulationTime(hourMap[horizon]);
    }
  }

  public async syncWeatherForecast() {
    try {
      this.setState(() => ({ weatherModelStatus: 'CONNECTING' }));
      const { data, isLive } = await fetchWeatherForecast();

      let updatedCount = 0;
      const cells = data.cells || [];
      for (const cell of cells) {
        if (
          BASELINE_ENVIRONMENT_GRID[cell.row] &&
          BASELINE_ENVIRONMENT_GRID[cell.row][cell.column] &&
          !BASELINE_ENVIRONMENT_GRID[cell.row][cell.column].isLand
        ) {
          // Weather risk score [0, 1] scales 6h wind and wave environment dynamically
          const calculatedWind = Math.round(20 + cell.riskScore * 60);
          BASELINE_ENVIRONMENT_GRID[cell.row][cell.column].windValues[6] = calculatedWind;
          updatedCount++;
        }
      }

      const now = new Date();
      const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

      const env = applyScenarioToEnvironment(BASELINE_ENVIRONMENT_GRID, this.state.activeScenario);
      const bergs = applyScenarioToIcebergs(this.state.icebergs, this.state.activeScenario);
      const routes = generatePolarisRoutes(env, this.state.vessel, bergs, this.state.activeScenario);

      this.setState(() => ({
        weatherModelStatus: isLive ? 'ONLINE' : 'OFFLINE',
        weatherForecastData: data,
        lastWeatherSync: timeStr,
        routes,
        selectedRouteId: routes[0]?.id ?? 'route_safe_a',
      }));

      this.addEventLog(
        'ENV',
        `Synchronized ${updatedCount} corridor cells with PyTorch Weather Risk MLP model (${isLive ? 'live server' : 'bundled static export'}).`,
        'NORMAL'
      );
    } catch (err) {
      console.warn('[POLARIS] Error syncing Weather Risk forecast:', err);
      this.setState(() => ({ weatherModelStatus: 'OFFLINE' }));
    }
  }

  // Phase 10C: Manual Vessel Position Update
  // Phase 10C: Manual Vessel Position Update
  public updateVesselPosition(latitude: number, longitude: number, updateSatellite: boolean = true) {
    if (isNaN(latitude) || latitude < -90 || latitude > 90 || isNaN(longitude) || longitude < -180 || longitude > 180) {
      this.setState(() => ({
        sentinel1ImageAvailable: false,
        sentinel1ImageUrl: null,
        sentinel1ImageBbox: null,
        sentinel1ImageMetadata: null,
        sentinel1ImageLoading: false,
        sentinel1ImageError: 'INVALID_COORDINATES: Latitude must be between -90 and 90, and longitude between -180 and 180.',
      }));
      return;
    }

    // Invalidate stale satellite imagery immediately upon coordinate change
    this.setState((prev) => ({
      departureLocation: {
        ...prev.departureLocation,
        latitude,
        longitude,
      },
      sentinel1ImageAvailable: false,
      sentinel1ImageUrl: null,
      sentinel1ImageBbox: null,
      sentinel1ImageMetadata: null,
      sentinel1ImageLoading: updateSatellite,
      sentinel1ImageError: null,
    }));

    this.addEventLog(
      'ROUTE',
      `Manual Vessel Position set to (${latitude >= 0 ? latitude.toFixed(2) + '°N' : Math.abs(latitude).toFixed(2) + '°S'}, ${longitude >= 0 ? longitude.toFixed(2) + '°E' : Math.abs(longitude).toFixed(2) + '°W'}) [SIMULATED / MANUAL POSITION].`,
      'NORMAL'
    );

    if (updateSatellite) {
      this.syncSentinel1(latitude, longitude);
    }
  }

  private sentinel1SyncInProgress = false;
  private sentinel1ImageSyncInProgress = false;

  // Phase 10A & 10C: Sentinel-1 GRD Recent Observation Sync
  public async syncSentinel1(lat?: number, lon?: number, radiusKm: number = 250) {
    if (this.sentinel1SyncInProgress) {
      return;
    }
    this.sentinel1SyncInProgress = true;
    try {
      // Invalidate old SAR image state to avoid stale display
      this.setState(() => ({
        sentinel1Status: 'CONNECTING',
        sentinel1ImageAvailable: false,
        sentinel1ImageUrl: null,
        sentinel1ImageBbox: null,
        sentinel1ImageMetadata: null,
        sentinel1ImageLoading: true,
        sentinel1ImageError: null,
      }));
      const targetLat = typeof lat === 'number' ? lat : this.state.departureLocation.latitude;
      const targetLon = typeof lon === 'number' ? lon : this.state.departureLocation.longitude;

      if (isNaN(targetLat) || targetLat < -90 || targetLat > 90 || isNaN(targetLon) || targetLon < -180 || targetLon > 180) {
        this.setState(() => ({
          sentinel1Status: 'OFFLINE',
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'INVALID_COORDINATES: Coordinates outside valid ranges.',
        }));
        return;
      }

      const result = await fetchSentinel1Latest(targetLat, targetLon, radiusKm);

      const now = new Date();
      const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

      let status: PolarisAppState['sentinel1Status'];
      switch (result.status) {
        case 'OK':
          status = 'ONLINE';
          break;
        case 'NO_RECENT_COVERAGE':
        case 'NO_DATA':
          status = 'NO_DATA';
          break;
        case 'NOT_CONFIGURED':
          status = 'NOT_CONFIGURED';
          break;
        case 'OFFLINE':
        case 'UNAVAILABLE':
        case 'ERROR':
        default:
          status = 'OFFLINE';
      }

      this.setState(() => ({
        sentinel1Status: status,
        sentinel1Data: result,
        lastSentinel1Sync: timeStr,
      }));

      if (result.status === 'OK' && result.observation) {
        this.addEventLog(
          'ENV',
          `Sentinel-1 GRD observation retrieved for local AOI (${targetLat.toFixed(2)}°, ${targetLon.toFixed(2)}°): ${result.observation.product_id} acquired at ${result.observation.acquisition_time} (RECENT — not LIVE).`,
          'NORMAL'
        );
        // Sync SAR Image metadata for local AOI
        await this.syncSentinel1Image(targetLat, targetLon, radiusKm);
      } else if (result.status === 'NO_RECENT_COVERAGE' || result.status === 'NO_DATA') {
        this.addEventLog(
          'ENV',
          `Sentinel-1: No recent satellite coverage over vessel position (${targetLat.toFixed(2)}°, ${targetLon.toFixed(2)}°) within ${radiusKm} km search radius.`,
          'NORMAL'
        );
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'NO_RECENT_COVERAGE: No recent Sentinel-1 acquisition covers this location.',
        }));
      } else if (result.status === 'NOT_CONFIGURED') {
        this.addEventLog('ENV', 'Sentinel-1: Copernicus credentials not configured.', 'NORMAL');
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'Copernicus credentials not configured.',
        }));
      } else {
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: result.message || 'Sentinel-1 service unavailable',
        }));
      }
    } catch (err) {
      console.warn('[POLARIS] Error syncing Sentinel-1 data:', err);
      this.setState(() => ({
        sentinel1Status: 'OFFLINE',
        sentinel1ImageAvailable: false,
        sentinel1ImageUrl: null,
        sentinel1ImageBbox: null,
        sentinel1ImageMetadata: null,
        sentinel1ImageLoading: false,
        sentinel1ImageError: 'POLARIS backend is offline.',
      }));
    } finally {
      this.sentinel1SyncInProgress = false;
    }
  }

  // Phase 10B & 10C: Sentinel-1 SAR Image Sync
  public async syncSentinel1Image(lat?: number, lon?: number, radiusKm: number = 250) {
    if (this.sentinel1ImageSyncInProgress) {
      return;
    }
    this.sentinel1ImageSyncInProgress = true;
    try {
      this.setState(() => ({
        sentinel1ImageLoading: true,
        sentinel1ImageError: null,
        sentinel1ImageAvailable: false,
        sentinel1ImageUrl: null,
        sentinel1ImageBbox: null,
        sentinel1ImageMetadata: null,
      }));
      const targetLat = typeof lat === 'number' ? lat : this.state.departureLocation.latitude;
      const targetLon = typeof lon === 'number' ? lon : this.state.departureLocation.longitude;

      if (isNaN(targetLat) || targetLat < -90 || targetLat > 90 || isNaN(targetLon) || targetLon < -180 || targetLon > 180) {
        this.setState(() => ({
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'INVALID_COORDINATES: Coordinates outside valid ranges.',
        }));
        return;
      }

      const imgRes = await fetchSentinel1ImageMetadata(targetLat, targetLon, radiusKm);

      if (imgRes.status === 'OK' && imgRes.metadata && imgRes.metadata.image_available) {
        const imageUrl = getSentinel1ImageUrl(targetLat, targetLon, radiusKm);
        this.setState(() => ({
          sentinel1ImageAvailable: true,
          sentinel1ImageUrl: imageUrl,
          sentinel1ImageBbox: imgRes.metadata!.image_bbox,
          sentinel1ImageMetadata: imgRes.metadata,
          sentinel1ImageLoading: false,
          sentinel1ImageError: null,
        }));
        this.addEventLog(
          'ENV',
          `Sentinel-1 SAR image layer ready for local vessel map overlay (${imgRes.metadata.polarization} polarization, local AOI synced).`,
          'NORMAL'
        );
      } else if (imgRes.status === 'NO_RECENT_COVERAGE' || imgRes.status === 'NO_DATA') {
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'NO_RECENT_COVERAGE: No recent Sentinel-1 acquisition covers this location.',
        }));
      } else if (imgRes.status === 'PROCESSING_ERROR') {
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: `PROCESSING_ERROR: ${imgRes.message || 'SAR image generation failed.'}`,
        }));
      } else if (imgRes.status === 'INVALID_COORDINATES') {
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: 'INVALID_COORDINATES: Coordinates outside valid ranges.',
        }));
      } else {
        this.setState(() => ({
          sentinel1ImageAvailable: false,
          sentinel1ImageUrl: null,
          sentinel1ImageBbox: null,
          sentinel1ImageMetadata: null,
          sentinel1ImageLoading: false,
          sentinel1ImageError: imgRes.message || 'SAR image unavailable',
        }));
      }
    } catch (err) {
      console.warn('[POLARIS] Error syncing Sentinel-1 SAR image metadata:', err);
      this.setState(() => ({
        sentinel1ImageAvailable: false,
        sentinel1ImageUrl: null,
        sentinel1ImageBbox: null,
        sentinel1ImageMetadata: null,
        sentinel1ImageLoading: false,
        sentinel1ImageError: 'PROCESSING_ERROR: Failed to fetch SAR image metadata',
      }));
    } finally {
      this.sentinel1ImageSyncInProgress = false;
    }
  }

  public setSentinel1Opacity(opacity: number) {
    const clamped = Math.max(0.30, Math.min(0.90, opacity));
    this.setState(() => ({ sentinel1Opacity: clamped }));
  }


  public async simulateWhatIfScenario(scenarioType: BackendScenarioType, parameters?: BackendScenarioParameters) {
    this.setState(() => ({ isSimulatingWhatIf: true }));
    try {
      const firstWp = this.state.routes[0]?.waypoints[0];
      const lastWp = this.state.routes[0]?.waypoints[this.state.routes[0].waypoints.length - 1];
      const departure = firstWp ? { latitude: firstWp.latitude, longitude: firstWp.longitude } : { latitude: -63.0, longitude: 7.0 };
      const destination = lastWp ? { latitude: lastWp.latitude, longitude: lastWp.longitude } : { latitude: -66.0, longitude: 23.0 };

      const result = await simulateScenarioViaBackend({
        departureLocation: departure,
        destinationLocation: destination,
        vessel: this.state.vessel,
        scenarioType,
        parameters,
        departureDelayHours: this.state.activeScenario.departureDelayHours || 0.0,
      });

      this.setState(() => ({
        activeWhatIfResult: result,
        isSimulatingWhatIf: false,
      }));

      if (result) {
        this.addEventLog(
          'ROUTE',
          `What-If simulation (${scenarioType}) complete: ${result.dynamic_decision_explanation}`,
          result.comparison?.route_changed ? 'CRITICAL' : 'NORMAL'
        );
      }
    } catch (err) {
      console.error('[POLARIS] Error simulating What-If scenario:', err);
      this.setState(() => ({ isSimulatingWhatIf: false }));
    }
  }

  public async runSensitivitySweep(sweepType: BackendScenarioType, parameterValues?: number[]) {
    try {
      const firstWp = this.state.routes[0]?.waypoints[0];
      const lastWp = this.state.routes[0]?.waypoints[this.state.routes[0].waypoints.length - 1];
      const departure = firstWp ? { latitude: firstWp.latitude, longitude: firstWp.longitude } : { latitude: -63.0, longitude: 7.0 };
      const destination = lastWp ? { latitude: lastWp.latitude, longitude: lastWp.longitude } : { latitude: -66.0, longitude: 23.0 };

      const result = await runSensitivitySweepViaBackend({
        departureLocation: departure,
        destinationLocation: destination,
        vessel: this.state.vessel,
        sweepType,
        parameterValues,
      });

      this.setState(() => ({ activeSensitivityResult: result }));
    } catch (err) {
      console.error('[POLARIS] Error running sensitivity sweep:', err);
    }
  }

  public clearWhatIfSimulation() {
    this.setState(() => ({ activeWhatIfResult: null, activeSensitivityResult: null }));
  }

  // --- Phase 8: Antarctic Risk Twin Methods ---

  public async syncRiskTwinSummary() {
    this.setState(() => ({ isSyncingRiskTwin: true }));
    try {
      const summary = await fetchRiskTwinSummary({
        departureLocation: this.state.departureLocation,
        destinationLocation: this.state.destinationLocation,
        vessel: this.state.vessel,
        activeScenarioResult: this.state.activeWhatIfResult ? (this.state.activeWhatIfResult as any) : null,
      });

      if (summary) {
        this.setState(() => ({
          riskTwinSummary: summary,
          isSyncingRiskTwin: false,
        }));
      } else {
        this.setState(() => ({ isSyncingRiskTwin: false }));
      }
    } catch (err) {
      console.warn('[POLARIS] Error syncing Risk Twin summary:', err);
      this.setState(() => ({ isSyncingRiskTwin: false }));
    }
  }

  public async syncSystemHealth() {
    try {
      const engines = await fetchSystemEngineHealth();
      if (engines) {
        this.setState(() => ({ systemEngineHealth: engines }));
      }
    } catch (err) {
      console.warn('[POLARIS] Error syncing 7-engine system health:', err);
    }
  }

  public async inspectCell(row: number, column: number, horizonHours?: number) {
    const h = horizonHours ?? this.state.simulationTimeHours;
    try {
      const cellData = await fetchCellInspection(
        row,
        column,
        h,
        this.state.vessel.safeSicThresholdPercent,
        this.state.vessel.draftMeters
      );
      if (cellData) {
        this.setState(() => ({ selectedCellInspection: cellData }));
      }
    } catch (err) {
      console.warn('[POLARIS] Error inspecting cell:', err);
    }
  }

  public clearCellInspection() {
    this.setState(() => ({ selectedCellInspection: null }));
  }

  public setSelectedIceberg(id: string | null) {
    this.setState(() => ({ selectedIcebergId: id }));
  }

  public generateRoutes(onComplete?: () => void) {
    return this.generateRoutesAsync(onComplete);
  }
}

export const polarisStore = new PolarisStore();
