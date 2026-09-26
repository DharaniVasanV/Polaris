/**
 * POLARIS: Application & UI State Interfaces
 */

import { VesselProfile, Route, Iceberg, PolarisAlert, EventLogEntry, DemonstrationFleetVessel, ResearchStation } from './domain';
import { RiskWeights, ValidTimeHorizon } from './risk';
import { ScenarioId, ScenarioOverlay } from './scenario';

export type AppScreen = 
  | 'LANDING'
  | 'LOGIN'
  | 'DASHBOARD'
  | 'MAP'
  | 'VOYAGE_PLANNER'
  | 'ICE_INTELLIGENCE'
  | 'DECISION_CENTER'
  | 'ROUTES'
  | 'WHAT_IF'
  | 'FLEET'
  | 'RESEARCH'
  | 'SETTINGS';

export type ForecastHorizonDay = 'TODAY' | 'PLUS_1_DAY' | 'PLUS_3_DAYS' | 'PLUS_7_DAYS';

export interface MapLayerState {
  seaIce: boolean;
  icebergs: boolean;
  icebergForecast: boolean;
  icebergUncertainty: boolean;
  weather: boolean;
  oceanCurrent: boolean;
  bathymetry: boolean;
  noGoZones: boolean;
  recommendedRoute: boolean;
  alternativeRoute: boolean;
  shortestRoute: boolean;
  researchStations: boolean;
  fleetVessels: boolean;
  // Phase 10B: Sentinel-1 SAR observation layer
  sentinel1Sar: boolean;
}

export interface PolarisAppState {
  // Auth & Mode
  isAuthenticated: boolean;
  userEmail: string;
  offlineMode: boolean;
  demoMode: boolean;
  presentationMode: boolean;
  activeScreen: AppScreen;

  // Clocks & Timelines (Separated per architecture revision)
  snapshotTimeUtc: string;      // e.g. "12:40 UTC"
  simulationTimeHours: ValidTimeHorizon; // 0, 6, 12, 18, 24
  forecastHorizon: ForecastHorizonDay;   // TODAY, +1D, +3D, +7D

  // Core domain entities
  vessel: VesselProfile;
  departureLocation: { name: string; latitude: number; longitude: number };
  destinationLocation: { name: string; latitude: number; longitude: number };
  
  // Routes & Selection
  routes: Route[];
  selectedRouteId: string | null;
  activeRouteStatus: import('./domain').RouteStatus;
  
  // Environmental entities (Derived from baseline + scenario overlay)
  icebergs: Iceberg[];
  selectedIcebergId?: string | null;
  activeScenarioId: ScenarioId;
  activeScenario: ScenarioOverlay;
  
  // Real-time operations
  alerts: PolarisAlert[];
  eventLog: EventLogEntry[];
  fleet: DemonstrationFleetVessel[];
  researchStations: ResearchStation[];
  
  // Risk Weights & Settings
  riskWeights: RiskWeights;
  mapLayers: MapLayerState;
  
  // Hazard Simulation animation state
  isHazardSimulationRunning: boolean;
  hazardSimulationStep: number;
  
  // AI Pipeline state
  isGeneratingRoute: boolean;
  routeGenerationStage: string;
  aiModelStatus: 'CONNECTING' | 'ONLINE' | 'OFFLINE';
  lastAiModelSync?: string;
  seaIceModelStatus: 'CONNECTING' | 'ONLINE' | 'OFFLINE';
  seaIceForecastData: import('../services/seaIceModelService').PolarisSeaIceForecast | null;
  selectedSeaIceHorizon: import('../services/seaIceModelService').ForecastHorizon;
  lastSeaIceSync?: string;
  weatherModelStatus: 'CONNECTING' | 'ONLINE' | 'OFFLINE';
  weatherForecastData: import('../services/weatherModelService').WeatherGridResponse | null;
  lastWeatherSync?: string;

  // Phase 10A: Sentinel-1 GRD Recent Observation (Copernicus Data Space)
  sentinel1Status: 'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'NOT_CONFIGURED' | 'NO_DATA';
  sentinel1Data: import('../services/sentinel1Service').Sentinel1StatusResponse | null;
  lastSentinel1Sync?: string;

  // Phase 10B: Sentinel-1 SAR Image (Copernicus Sentinel Hub Process API)
  sentinel1ImageAvailable: boolean;
  sentinel1ImageUrl: string | null;       // Backend URL for the PNG image
  sentinel1ImageBbox: {
    min_lon: number; min_lat: number;
    max_lon: number; max_lat: number;
  } | null;
  sentinel1ImageMetadata: import('../services/sentinel1Service').Sentinel1ImageMeta | null;
  sentinel1ImageLoading: boolean;
  sentinel1ImageError: string | null;
  sentinel1Opacity: number;                // 0.30 - 0.90, default 0.70

  // What-If Scenario Simulation (Phase 7)
  activeWhatIfResult?: import('./scenario').BackendScenarioSimulateResponse | null;
  activeSensitivityResult?: import('./scenario').BackendSensitivitySweepResponse | null;
  isSimulatingWhatIf?: boolean;

  // Antarctic Risk Twin & Operational Decision Dashboard (Phase 8)
  riskTwinSummary?: import('./riskTwin').RiskTwinSummaryResponse | null;
  systemEngineHealth?: Record<string, import('./riskTwin').SystemEngineHealth> | null;
  selectedCellInspection?: import('./riskTwin').CellInspectionData | null;
  isSyncingRiskTwin?: boolean;
}
