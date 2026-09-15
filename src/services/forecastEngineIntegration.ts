/**
 * POLARIS: GRU Model Forecast Engine Integration
 * Transforms trained neural network multi-step predictions into domain Iceberg forecast tracks.
 */

import { Iceberg, IcebergTrackPoint } from '../types/domain';
import { getIcebergGRUPrediction, GeoPointPayload } from './aiModelService';

/**
 * Updates an Iceberg object with real GRU neural model predictions.
 */
export async function updateIcebergForecastWithGRU(
  iceberg: Iceberg,
  forecastDays: number = 5,
  safetyMarginKm: number = 30.0
): Promise<Iceberg> {
  try {
    const historyPayload: GeoPointPayload[] = iceberg.historicalTrack.map((pt) => ({
      lat: pt.latitude,
      lon: pt.longitude,
    }));

    // Query the trained GRU model via FastAPI
    const prediction = await getIcebergGRUPrediction(
      iceberg.id,
      historyPayload,
      forecastDays,
      safetyMarginKm
    );

    const nowBaseTime = new Date().getTime();

    // Map response to IcebergTrackPoint
    const realForecastTrack: IcebergTrackPoint[] = prediction.forecast_steps.map((step) => {
      const stepHours = step.step_index * 24; // 24h, 48h, 72h, 96h, 120h
      const stepDate = new Date(nowBaseTime + stepHours * 3600 * 1000).toISOString();

      return {
        latitude: step.latitude,
        longitude: step.longitude,
        horizonHours: stepHours,
        uncertaintyRadiusKm: step.empirical_error_radius_km,
        stepLabel: step.step,
        empiricalErrorRadiusKm: step.empirical_error_radius_km,
        vesselSafetyMarginKm: step.vessel_safety_margin_km,
        totalHazardRadiusKm: step.total_hazard_zone_radius_km,
        timestampUtc: stepDate,
      };
    });

    // Include the anchor point (Now / 0h)
    const anchorPoint: IcebergTrackPoint = {
      latitude: iceberg.currentPosition.latitude,
      longitude: iceberg.currentPosition.longitude,
      horizonHours: 0,
      uncertaintyRadiusKm: 2.5,
      stepLabel: 'Now',
      empiricalErrorRadiusKm: 0,
      vesselSafetyMarginKm: safetyMarginKm,
      totalHazardRadiusKm: safetyMarginKm + 2.5,
      timestampUtc: new Date().toISOString(),
    };

    return {
      ...iceberg,
      forecastTrack: [anchorPoint, ...realForecastTrack],
      modelSource: 'POLARIS_GRU_Neural_Network',
      modelName: prediction.model_name,
      forecastHorizonDays: prediction.forecast_horizon_days,
      lastInferenceUtc: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[POLARIS AI] Could not query GRU model for ${iceberg.id}, keeping baseline track.`, err);
    return iceberg;
  }
}
