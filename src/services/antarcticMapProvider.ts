import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Style, Fill, Stroke, Text } from 'ol/style';
import { transform } from 'ol/proj';

export type BasemapSourceType = 'BAS_ANTARCTIC' | 'NASA_GIBS_WMTS' | 'OFFLINE_VECTOR';

export interface BasemapProviderConfig {
  sourceType: BasemapSourceType;
}

/**
 * AntarcticMapProvider
 *
 * Abstraction for Antarctic basemap tiles in EPSG:3031.
 *
 * Online:  BAS Antarctic & Southern Ocean basemap (real tile service)
 * Fallback: NASA GIBS Blue Marble
 * Offline: Vector drawing mode
 */
export class AntarcticMapProvider {
  private config: BasemapProviderConfig;

  constructor(config: BasemapProviderConfig = { sourceType: 'BAS_ANTARCTIC' }) {
    this.config = config;
  }

  public setSourceType(sourceType: BasemapSourceType) {
    this.config.sourceType = sourceType;
  }

  public getSourceType(): BasemapSourceType {
    return this.config.sourceType;
  }

  /**
   * Creates the primary basemap layer in native EPSG:3031.
   */
  public createBasemapLayer(): TileLayer<XYZ> | VectorLayer<VectorSource> {
    if (this.config.sourceType === 'BAS_ANTARCTIC') {
      return this.createBASLayer();
    }

    if (this.config.sourceType === 'NASA_GIBS_WMTS') {
      return this.createNASAGIBSLayer();
    }

    return this.createOfflineVectorLayer();
  }

  // ─── BAS Antarctic & Southern Ocean (Official Tile Service) ────────────────
  private createBASLayer(): TileLayer<XYZ> {
    // Tile metadata retrieved from:
    // https://tiles.arcgis.com/tiles/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/Antarctica_and_the_Southern_Ocean/MapServer?f=pjson
    const origin: [number, number] = [-30635955.4472718, 30635955.4472718];
    const resolutions = [
      239343.40193181095, // Level 0
      119671.70096590547, // Level 1
      59835.85048295274,  // Level 2
      29917.92524147637,  // Level 3
      14958.962620738184, // Level 4
       7479.481310369092, // Level 5
       3739.740655184546, // Level 6
       1869.870327592273, // Level 7
        934.9351637961365, // Level 8
    ];

    const basTileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [256, 256],
      extent: [-4898635.244666592, -4898635.24466659, 4898635.24466659, 4898635.244666592],
    });

    return new TileLayer({
      source: new XYZ({
        url: 'https://tiles.arcgis.com/tiles/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/Antarctica_and_the_Southern_Ocean/MapServer/tile/{z}/{y}/{x}',
        projection: 'EPSG:3031',
        tileGrid: basTileGrid,
        crossOrigin: 'anonymous',
        // attributions: '© British Antarctic Survey | IBCSO v2 Bathymetry | REMA Hillshade | SCAR ADD v7.10',
      }),
      zIndex: 1,
    });
  }

  // ─── NASA GIBS BlueMarble Shaded Relief Bathymetry in EPSG:3031 ──────────────
  private createNASAGIBSLayer(): TileLayer<XYZ> {
    // GIBS EPSG:3031 '500m' TileMatrixSet — verified from GetCapabilities:
    // https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities
    //
    // The 500m TileMatrixSet has EXACTLY 5 valid TileMatrix IDs: 0, 1, 2, 3, 4.
    // Requesting TileMatrix 5 or higher returns HTTP 400.
    // The old code had 8 resolutions [32768...256], causing OL to generate
    // TileMatrix URLs 5, 6, 7 — all invalid.
    //
    // Fix: use only 5 resolutions so OL tile grid index 0→4 = GIBS TileMatrix 0→4.
    //
    // Geometry (from capabilities BoundingBox crs='EPSG::3031'):
    //   extent: [-4194304, -4194304, 4194304, 4194304]
    //   origin: [-4194304, 4194304]  (top-left)
    //   tile size: 512×512 px
    //
    // Resolutions (m/px for each TileMatrix level):
    //   TileMatrix 0: 8192 m/px  (2×2 tiles at 512px = 8388608m coverage)
    //   TileMatrix 1: 4096 m/px
    //   TileMatrix 2: 2048 m/px
    //   TileMatrix 3: 1024 m/px
    //   TileMatrix 4:  512 m/px  ← finest level for this product
    const origin: [number, number] = [-4194304, 4194304];
    const resolutions = [8192, 4096, 2048, 1024, 512]; // EXACTLY 5 levels: TileMatrix 0-4

    const gibsTileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [512, 512],
      extent: [-4194304, -4194304, 4194304, 4194304],
    });

    return new TileLayer({
      source: new XYZ({
        // REST URL: .../500m/{TileMatrix}/{TileRow}/{TileCol}.jpeg
        // OL maps {z}=0 → TileMatrix 0, {z}=4 → TileMatrix 4
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
        projection: 'EPSG:3031',
        tileGrid: gibsTileGrid,
        crossOrigin: 'anonymous',
      }),
      zIndex: 1,
    });
  }

  // ─── Offline Mission Vector Layer (no network tiles required) ─────────────
  private createOfflineVectorLayer(): VectorLayer<VectorSource> {
    const source = new VectorSource();
    const to3031 = (lon: number, lat: number) =>
      transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];

    // Southern Ocean background
    const oceanRing: number[][] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      oceanRing.push(to3031(lon, -50));
    }
    const oceanFeat = new Feature({ geometry: new Polygon([oceanRing]) });
    oceanFeat.setStyle(new Style({ fill: new Fill({ color: '#0C1B33' }) }));
    source.addFeature(oceanFeat);

    // Antarctic continent outline (simplified, 14 control points)
    const pts: [number, number][] = [
      [-25.0, -69.2], [-40.0, -75.0], [-60.0, -74.0],
      [-64.0, -65.0], [-80.0, -70.0], [-110.0, -73.0],
      [-160.0, -77.0], [170.0, -78.0], [140.0, -67.0],
      [110.0, -66.5], [76.0, -69.0], [50.0, -67.0],
      [12.0, -70.0], [-25.0, -69.2],
    ];
    const contPoly = pts.map(([lon, lat]) => to3031(lon, lat));
    const landFeat = new Feature({ geometry: new Polygon([contPoly]) });
    landFeat.setStyle(
      new Style({
        fill: new Fill({ color: 'rgba(224, 242, 254, 0.95)' }),
        stroke: new Stroke({ color: '#0284C7', width: 2.0 }),
      })
    );
    source.addFeature(landFeat);

    // Label
    const spFeat = new Feature({ geometry: new Point(to3031(0, -90)) });
    spFeat.setStyle(
      new Style({
        text: new Text({
          text: 'SOUTH POLE\n(Offline Mode)',
          font: 'bold 11px "Inter", sans-serif',
          fill: new Fill({ color: '#EF4444' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
        }),
      })
    );
    source.addFeature(spFeat);

    return new VectorLayer({ source, zIndex: 1 });
  }
}
