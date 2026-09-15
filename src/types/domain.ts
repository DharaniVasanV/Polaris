/**
 * POLARIS: Domain Types & Interfaces
 * Strict TypeScript models for Antarctic Maritime Decision-Support
 */

export type IceClass = 'PC1' | 'PC2' | 'PC3' | 'PC4' | 'PC5' | 'PC6' | 'PC7' | '1A-Super' | '1A';

export interface VesselProfile {
  id: string;
  name: string;
  type: string;
  iceClass: IceClass;
  draftMeters: number;
  safetyDepthMarginMeters: number; // Prototype bathymetry constraint: depth < draft + margin => NO-GO
  nominalSpeedKnots: number;
  fuelCapacityTonnes: number;
  safeSicThresholdPercent: number; // Configurable vessel threshold (default: 70%)
  icebergSafetyBufferKm: number;   // Configurable buffer (default: 12 km)
  maxSafeWaveHeightMeters: number; // Configurable max wave (default: 4.0 m)
  riskPreference: 'MAX_SAFETY' | 'BALANCED' | 'FUEL_EFFICIENCY';
}

export interface GeoPoint {
  latitude: number;   // -90 to 0 (Antarctic hemisphere)
  longitude: number;  // -180 to 180
}

export interface IcebergTrackPoint extends GeoPoint {
  timestampUtc: string;
  horizonHours: number; // 0 for NOW, 6, 12, 24
  uncertaintyRadiusKm: number; // expands with horizon (e.g. 0h: 2km, 6h: 5km, 12h: 10km, 24h: 15km)
  stepLabel?: string; // e.g. "Day +1", "Day +2"
  empiricalErrorRadiusKm?: number; // from trained GRU benchmark evaluation (e.g. 168km, 605km)
  vesselSafetyMarginKm?: number; // vessel safety buffer (default 30km)
  totalHazardRadiusKm?: number; // empiricalErrorRadiusKm + vesselSafetyMarginKm
}

export interface Iceberg {
  id: string;
  name: string;
  currentPosition: GeoPoint;
  lengthKm: number;
  widthKm: number;
  speedKmh: number;
  driftDirectionDeg: number;
  driftDirectionLabel: string; // e.g. "ENE"
  confidencePercent: number;
  historicalTrack: IcebergTrackPoint[];
  forecastTrack: IcebergTrackPoint[];
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'CALVING' | 'GROUNDED';
  modelSource?: string; // e.g. 'POLARIS_GRU_Neural_Network'
  modelName?: string;
  forecastHorizonDays?: number;
  lastInferenceUtc?: string;
}

export type RouteType = 'SHORTEST_REJECTED' | 'SAFE_A' | 'FASTEST_SAFE' | 'FUEL_EFFICIENT' | 'ALTERNATIVE_B';

export type RouteStatus = 
  | 'DRAFT'
  | 'CALCULATING'
  | 'AVAILABLE'
  | 'RECOMMENDED'
  | 'UNDER_REVIEW'
  | 'AT_RISK'
  | 'REJECTED'
  | 'REPLANNING'
  | 'REPLACED'
  | 'APPROVED_BY_HUMAN';

export interface RouteWaypoint extends GeoPoint {
  id: string;
  name?: string;
  segmentIndex: number;
  cumulativeDistanceNm: number;
  estimatedArrivalHours: number; // relative to departure (e.g. +12.5h)
  estimatedArrivalTimeUtc: string;
  // Queried spatiotemporal conditions at arrival time:
  sicAtArrival: number;
  waveAtArrival: number;
  windAtArrival: number;
  currentAtArrival: number;
  nearestIcebergClearanceKm: number;
  segmentRisk: number;
  isNoGo: boolean;
  confidencePercent: number;
}

export interface RouteMetrics {
  totalDistanceNm: number;
  estimatedTransitHours: number;
  estimatedTransitFormatted: string;
  estimatedFuelIndex: number; // Prototype Fuel Index: dist * (1 + avgSIC/100 + avgWave/10)
  averageRisk: number;
  maxRisk: number;
  maxSicPercent: number;
  averageSicPercent: number;
  minIcebergClearanceKm: number;
  waveExposureIndex: number;
  uncertaintyExposure: number;
  confidencePercent: number;
  criticalCellsCount: number;
  highRiskCellsCount: number;
}

export interface RouteRejectionDetails {
  isRejected: boolean;
  primaryReason: string;
  violatingHazards: string[];
  recommendationAlternative: string;
}

export interface Route {
  id: string;
  type: RouteType;
  title: string;
  description: string;
  color: string;
  status: RouteStatus;
  waypoints: RouteWaypoint[];
  metrics: RouteMetrics;
  rejectionDetails?: RouteRejectionDetails;
  dynamicExplanation: string;
  tradeOffVsShortest: {
    distanceDiffNm: number;
    etaDiffHours: number;
    hazardExposureReductionPercent: number;
  };
}

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface PolarisAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionRequired: string;
  timestampUtc: string;
  isAcknowledged: boolean;
  sourceModule: string;
}

export interface ResearchStation {
  id: string;
  name: string;
  country: string;
  operator: string;
  position: GeoPoint;
  elevationMeters: number;
  type: 'YEAR_ROUND' | 'SUMMER_ONLY';
  accessRiskLevel: 'SAFE' | 'MODERATE' | 'RESTRICTED';
  environmentalStabilityPercent: number;
}

export interface DemonstrationFleetVessel {
  id: string;
  name: string;
  type: string;
  iceClass: IceClass;
  currentPosition: GeoPoint;
  destination: string;
  riskIndex: number;
  etaFormatted: string;
  fuelRemainingPercent: number;
  satelliteStatus: 'CONNECTED' | 'OFFLINE';
  routeConfidencePercent: number;
  status: 'NAVIGATING' | 'SAMPLING' | 'MOORED' | 'STATION_KEEPING';
}

export interface EventLogEntry {
  id: string;
  timestampUtc: string;
  simulationTimeFormatted: string;
  category: 'ENV' | 'ICEBERG' | 'ROUTE' | 'DECISION' | 'SYSTEM';
  message: string;
  severity: AlertSeverity | 'NORMAL';
}
