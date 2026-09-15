/**
 * POLARIS: Deterministic 4D Environmental Dataset & Antarctic Grid
 * Spans Antarctic Demonstration Corridor: Lat -58°S to -75°S, Lon -25°W to +75°E
 * Defines spatial features: Open water corridor, dense pack ice, high wave zones,
 * coastline, ice shelves (Ekström, Riiser-Larsen, Fimbul, Amery), bathymetry depths.
 */

import { EnvironmentalCell } from '../types/risk';

export const GRID_ROWS = 18;
export const GRID_COLS = 26;

export const LAT_MIN = -75.0; // South
export const LAT_MAX = -58.0; // North
export const LON_MIN = -25.0; // West
export const LON_MAX = +75.0; // East

/**
 * Procedural generation of calibrated deterministic 4D baseline grid
 */
export function generateBaselineEnvironmentGrid(): EnvironmentalCell[][] {
  const grid: EnvironmentalCell[][] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    const rowCells: EnvironmentalCell[] = [];
    const lat = LAT_MAX - (r / (GRID_ROWS - 1)) * (LAT_MAX - LAT_MIN);

    for (let c = 0; c < GRID_COLS; c++) {
      const lon = LON_MIN + (c / (GRID_COLS - 1)) * (LON_MAX - LON_MIN);
      const cellId = `cell_${r}_${c}`;

      // Geography: Continental Antarctica is south of ~ -69°S to -72°S depending on longitude
      const continentalBoundaryLat = -69.0 - Math.sin((lon * Math.PI) / 60) * 2.5;
      const isLand = lat < continentalBoundaryLat - 1.2;
      const isIceShelf = !isLand && lat < continentalBoundaryLat + 0.5 && (lon > -10 && lon < 45);

      // Bathymetry (Depth in meters): Continental shelf (< 400m) vs deep ocean (2000m - 4500m)
      let waterDepth = 3800 - Math.abs(lat - -60) * 180;
      if (isIceShelf) waterDepth = 150;
      else if (lat < -67.5) waterDepth = 420 - (lat + 67.5) * 80;
      if (isLand) waterDepth = 0;

      // Deterministic Sea-Ice Concentration (SIC %) gradient & pack ice dynamics:
      // High SIC in Weddell Sea (lon < 0) and coastal fringe (lat < -65°S)
      // Open water corridor around lat -62°S to -65°S between lon 0°E and 50°E
      const baseSicRaw = Math.max(
        0,
        Math.min(
          98,
          (Math.abs(lat - -58) / 16) * 75 +
            (lon < 5 ? 22 : -8) +
            Math.sin((lon + 15) * 0.1) * 14
        )
      );

      // 4-Temporal evolution (0h, 6h, 12h, 18h, 24h)
      // Ice drifts north-eastward over 24h, increasing SIC in specific transit corridors
      const driftDelta6h = Math.sin((lon - 10) * 0.15) * 4;
      const driftDelta12h = Math.sin((lon - 10) * 0.15) * 9 + (lat < -64 ? 6 : 0);
      const driftDelta18h = Math.sin((lon - 10) * 0.15) * 13 + (lat < -64 ? 10 : 0);
      const driftDelta24h = Math.sin((lon - 10) * 0.15) * 17 + (lat < -64 ? 14 : 0);

      const sic0 = isLand ? 0 : Math.round(Math.max(0, Math.min(95, baseSicRaw)));
      const sic6 = isLand ? 0 : Math.round(Math.max(0, Math.min(96, baseSicRaw + driftDelta6h)));
      const sic12 = isLand ? 0 : Math.round(Math.max(0, Math.min(98, baseSicRaw + driftDelta12h)));
      const sic18 = isLand ? 0 : Math.round(Math.max(0, Math.min(99, baseSicRaw + driftDelta18h)));
      const sic24 = isLand ? 0 : Math.round(Math.max(0, Math.min(100, baseSicRaw + driftDelta24h)));

      // Waves (meters): Roaring Forties / Furious Fifties wave action in northern sector
      const baseWave = Math.max(1.2, 5.2 - Math.abs(lat - -58) * 0.22 + Math.cos(lon * 0.08) * 0.8);
      const wave0 = Number(baseWave.toFixed(1));
      const wave6 = Number((baseWave + 0.3).toFixed(1));
      const wave12 = Number((baseWave + 0.6).toFixed(1));
      const wave18 = Number((baseWave + 0.4).toFixed(1));
      const wave24 = Number((baseWave - 0.2).toFixed(1));

      // Wind (km/h): Katabatic winds off ice cap & maritime gales
      const baseWind = 24 + Math.abs(lat - -65) * 2.2 + Math.sin(lon * 0.1) * 6;
      const wind0 = Math.round(baseWind);
      const wind6 = Math.round(baseWind + 4);
      const wind12 = Math.round(baseWind + 8);
      const wind18 = Math.round(baseWind + 6);
      const wind24 = Math.round(baseWind + 2);

      // Currents (knots): Antarctic Circumpolar Current (eastward U > 0) and Coastal Current (westward U < 0 near coast)
      const currentU = lat < -67 ? -0.8 : 1.4 + Math.sin(lon * 0.05) * 0.3;
      const currentV = -0.2 + Math.cos(lon * 0.08) * 0.3;

      rowCells.push({
        id: cellId,
        row: r,
        col: c,
        latitude: Number(lat.toFixed(2)),
        longitude: Number(lon.toFixed(2)),
        sicValues: { 0: sic0, 6: sic6, 12: sic12, 18: sic18, 24: sic24 },
        waveValues: { 0: wave0, 6: wave6, 12: wave12, 18: wave18, 24: wave24 },
        windValues: { 0: wind0, 6: wind6, 12: wind12, 18: wind18, 24: wind24 },
        currentUValues: { 0: currentU, 6: currentU, 12: currentU, 18: currentU, 24: currentU },
        currentVValues: { 0: currentV, 6: currentV, 12: currentV, 18: currentV, 24: currentV },
        waterDepthMeters: Math.round(waterDepth),
        isLand,
        isIceShelf,
        confidencePercent: { 0: 94, 6: 91, 12: 86, 18: 80, 24: 74 },
      });
    }
    grid.push(rowCells);
  }

  return grid;
}

export const BASELINE_ENVIRONMENT_GRID = generateBaselineEnvironmentGrid();
