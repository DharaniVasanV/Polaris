import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import { Style, Fill, Stroke, Text } from 'ol/style';
import { transform } from 'ol/proj';

export type BasemapSourceType = 'ESRI_POLAR_BASE' | 'NASA_BLUE_MARBLE_BATHYMETRY' | 'BAS_CARTOGRAPHIC_TILE' | 'OFFLINE_VECTOR';

export interface BasemapProviderConfig {
  sourceType: BasemapSourceType;
  offlineCachePath?: string;
}

export class AntarcticBasemapProvider {
  private config: BasemapProviderConfig;

  constructor(config: BasemapProviderConfig = { sourceType: 'ESRI_POLAR_BASE' }) {
    this.config = config;
  }

  public setSourceType(sourceType: BasemapSourceType) {
    this.config.sourceType = sourceType;
  }

  /**
   * Creates the primary basemap layer for EPSG:3031 projection
   */
  public createBasemapLayer(): TileLayer<XYZ> | VectorLayer<VectorSource> {
    if (this.config.sourceType === 'ESRI_POLAR_BASE') {
      return new TileLayer({
        source: new XYZ({
          url: 'https://services.arcgisonline.com/arcgis/rest/services/Polar/Antarctic_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
          projection: 'EPSG:3031',
          maxZoom: 8,
          crossOrigin: 'anonymous',
        }),
        zIndex: 1,
      });
    }

    if (this.config.sourceType === 'NASA_BLUE_MARBLE_BATHYMETRY') {
      return new TileLayer({
        source: new XYZ({
          url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
          projection: 'EPSG:3031',
          maxZoom: 9,
          crossOrigin: 'anonymous',
        }),
        zIndex: 1,
      });
    }

    if (this.config.sourceType === 'BAS_CARTOGRAPHIC_TILE') {
      return new TileLayer({
        source: new XYZ({
          url: 'https://tile.gbif.org/3031/omt/{z}/{x}/{y}@1x.png?style=gbif-dark',
          projection: 'EPSG:3031',
          maxZoom: 7,
          crossOrigin: 'anonymous',
        }),
        zIndex: 1,
      });
    }

    // Fallback: Offline Vector Basemap Layer
    return this.createOfflineVectorBasemapLayer();
  }

  /**
   * Creates a vector basemap layer for offline mission mode
   */
  private createOfflineVectorBasemapLayer(): VectorLayer<VectorSource> {
    const source = new VectorSource();
    const to3031 = (lon: number, lat: number) => transform([lon, lat], 'EPSG:4326', 'EPSG:3031');

    // Ocean boundary
    const oceanRing: number[][] = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      oceanRing.push(to3031(lon, -50));
    }
    const oceanFeat = new Feature({ geometry: new Polygon([oceanRing]) });
    oceanFeat.setStyle(new Style({ fill: new Fill({ color: '#061325' }) }));
    source.addFeature(oceanFeat);

    // High-resolution Antarctic Continent outline
    const antarcticGeoPoints: [number, number][] = [
      [-25.0, -69.2], [-40.0, -75.0], [-60.0, -74.0], [-64.0, -65.0],
      [-80.0, -70.0], [-110.0, -73.0], [-160.0, -77.0], [170.0, -78.0],
      [140.0, -67.0], [110.0, -66.5], [76.0, -69.0], [50.0, -67.0],
      [12.0, -70.0], [-25.0, -69.2]
    ];
    const poly3031 = antarcticGeoPoints.map(([lon, lat]) => to3031(lon, lat));
    const landFeat = new Feature({ geometry: new Polygon([poly3031]) });
    landFeat.setStyle(
      new Style({
        fill: new Fill({ color: 'rgba(224, 242, 254, 0.95)' }),
        stroke: new Stroke({ color: '#0284C7', width: 2.0 }),
      })
    );
    source.addFeature(landFeat);

    return new VectorLayer({ source, zIndex: 1 });
  }
}
