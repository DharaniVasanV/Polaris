import { ForecastHorizonDay } from '../types/state';

export interface HorizonMetrics {
  label: string;
  horizonHours: number;
  confidencePercent: number;
  iceGrowthDescription: string;
  meanDriftSpeed: string;
  driftDirection: string;
  meanWaveHeightMeters: number;
  meanWindSpeedKmh: number;
  temperatureCelsius: number;
  iceDensityDescription: string;
  leadClosureProbability: string;
  uncertaintyBufferKm: number;
  narrativeNote: string;
}

export const FORECAST_HORIZON_DATA: Record<ForecastHorizonDay, HorizonMetrics> = {
  TODAY: {
    label: 'TODAY (0h)',
    horizonHours: 0,
    confidencePercent: 94,
    iceGrowthDescription: 'Stable (+0.2% change)',
    meanDriftSpeed: '0.42 km/h',
    driftDirection: 'ENE (065°)',
    meanWaveHeightMeters: 1.8,
    meanWindSpeedKmh: 22.4,
    temperatureCelsius: -14.2,
    iceDensityDescription: 'Dense Consolidated Pack (0.91 g/cm³)',
    leadClosureProbability: '12% (LOW)',
    uncertaintyBufferKm: 2.5,
    narrativeNote: 'High radar certainty. Ice edge stable near 63.8°S. Navigation channels clear.'
  },
  PLUS_1_DAY: {
    label: '+1 DAY (+24h)',
    horizonHours: 24,
    confidencePercent: 89,
    iceGrowthDescription: 'Consolidating (+4.8% growth)',
    meanDriftSpeed: '0.51 km/h',
    driftDirection: 'NE (045°)',
    meanWaveHeightMeters: 2.3,
    meanWindSpeedKmh: 28.1,
    temperatureCelsius: -16.8,
    iceDensityDescription: 'First-Year Pack with Multi-Year Inclusions',
    leadClosureProbability: '28% (MODERATE)',
    uncertaintyBufferKm: 15.0,
    narrativeNote: 'Minor compression along Princess Astrid Coast. B-22 drift vectors steady.'
  },
  PLUS_3_DAYS: {
    label: '+3 DAYS (+72h)',
    horizonHours: 72,
    confidencePercent: 78,
    iceGrowthDescription: 'Accelerated Drift (+12.4% expansion)',
    meanDriftSpeed: '0.68 km/h',
    driftDirection: 'NNE (030°)',
    meanWaveHeightMeters: 3.1,
    meanWindSpeedKmh: 36.5,
    temperatureCelsius: -19.5,
    iceDensityDescription: 'Heavy Ridge Formation in Riiser-Larsen Corridor',
    leadClosureProbability: '54% (HIGH)',
    uncertaintyBufferKm: 24.0,
    narrativeNote: 'Katabatic wind event approaching from Antarctic Plateau. Southern leads closing.'
  },
  PLUS_7_DAYS: {
    label: '+7 DAYS (+168h)',
    horizonHours: 168,
    confidencePercent: 63,
    iceGrowthDescription: 'Severe Pack Consolidation (+26.0%)',
    meanDriftSpeed: '0.85 km/h',
    driftDirection: 'N (010°)',
    meanWaveHeightMeters: 4.2,
    meanWindSpeedKmh: 45.0,
    temperatureCelsius: -24.1,
    iceDensityDescription: 'Dynamic Multi-Year Pressure Ridges',
    leadClosureProbability: '76% (VERY HIGH)',
    uncertaintyBufferKm: 38.0,
    narrativeNote: 'Extensive synoptic storm impact. Unescorted passage in southern approaches non-viable.'
  }
};

export function getForecastForHorizon(horizon: ForecastHorizonDay): HorizonMetrics {
  return FORECAST_HORIZON_DATA[horizon] || FORECAST_HORIZON_DATA.TODAY;
}
