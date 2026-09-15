/**
 * POLARIS: Demonstration Antarctic Stations & Sampling Sites
 * Realistic coordinates for Indian Antarctic Program (Bharati, Maitri) and international stations
 */

import { ResearchStation } from '../types/domain';

export const DEMO_RESEARCH_STATIONS: ResearchStation[] = [
  {
    id: 'BHARATI',
    name: 'Bharati Station',
    country: 'India',
    operator: 'NCPOR / MoES',
    position: { latitude: -69.41, longitude: 76.19 }, // Larsemann Hills
    elevationMeters: 35,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'SAFE',
    environmentalStabilityPercent: 88,
  },
  {
    id: 'MAITRI',
    name: 'Maitri Station',
    country: 'India',
    operator: 'NCPOR / MoES',
    position: { latitude: -70.77, longitude: 11.73 }, // Schirmacher Oasis
    elevationMeters: 130,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'SAFE',
    environmentalStabilityPercent: 92,
  },
  {
    id: 'NEUMAYER_III',
    name: 'Neumayer-Station III',
    country: 'Germany',
    operator: 'AWI',
    position: { latitude: -70.67, longitude: -8.27 }, // Ekström Ice Shelf
    elevationMeters: 40,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'SAFE',
    environmentalStabilityPercent: 85,
  },
  {
    id: 'TROLL',
    name: 'Troll Research Station',
    country: 'Norway',
    operator: 'NPI',
    position: { latitude: -72.01, longitude: 2.53 }, // Queen Maud Land
    elevationMeters: 1275,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'MODERATE',
    environmentalStabilityPercent: 79,
  },
  {
    id: 'HALLEY_VI',
    name: 'Halley VI Research Station',
    country: 'UK',
    operator: 'BAS',
    position: { latitude: -75.58, longitude: -26.66 }, // Brunt Ice Shelf
    elevationMeters: 30,
    type: 'SUMMER_ONLY',
    accessRiskLevel: 'RESTRICTED',
    environmentalStabilityPercent: 64,
  },
  {
    id: 'SYOWA',
    name: 'Syowa Station',
    country: 'Japan',
    operator: 'NIPR',
    position: { latitude: -69.00, longitude: 39.58 }, // East Ongul Island
    elevationMeters: 29,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'SAFE',
    environmentalStabilityPercent: 86,
  },
  {
    id: 'DAVIS',
    name: 'Davis Station',
    country: 'Australia',
    operator: 'AAD',
    position: { latitude: -68.58, longitude: 77.97 }, // Vestfold Hills
    elevationMeters: 18,
    type: 'YEAR_ROUND',
    accessRiskLevel: 'SAFE',
    environmentalStabilityPercent: 90,
  },
];
