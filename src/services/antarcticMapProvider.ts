/**
 * POLARIS — Antarctic Basemap Provider
 *
 * Provides rectangular, void-free basemap layers for EPSG:3031.
 *
 * DEFAULT: NASA GIBS BlueMarble Shaded Relief + Bathymetry (Antarctic Polar)
 * FALLBACK: BAS ArcGIS Antarctic tile service
 *
 * PERFORMANCE NOTE:
 *   The old applyTileNoDataCleaning() function called getImageData() on every
 *   single tile load, which triggered the Canvas2D willReadFrequently warning.
 *   It has been removed. The ocean background VectorLayer (rendered at zIndex 0
 *   in OpenLayersPolarMap) achieves the same void-hiding effect without any
 *   canvas pixel readback operations.
 */

import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import XYZ from 'ol/source/XYZ';

export type BasemapSourceType = 'NASA_GIBS_WMTS' | 'BAS_ANTARCTIC';

export interface BasemapProviderConfig {
  sourceType: BasemapSourceType;
}

export class AntarcticMapProvider {
  private config: BasemapProviderConfig;

  constructor(config: BasemapProviderConfig = { sourceType: 'NASA_GIBS_WMTS' }) {
    this.config = config;
  }

  public setSourceType(sourceType: BasemapSourceType): void {
    this.config.sourceType = sourceType;
  }

  public getSourceType(): BasemapSourceType {
    return this.config.sourceType;
  }

  /**
   * Creates the primary rectangular basemap layer for EPSG:3031.
   * All providers share the same rectangular viewport — no circular footprint.
   */
  public createBasemapLayer(): TileLayer<XYZ> {
    switch (this.config.sourceType) {
      case 'NASA_GIBS_WMTS':
        return this.createNASAGIBSLayer();
      case 'BAS_ANTARCTIC':
      default:
        return this.createBASLayer();
    }
  }

  // ─── NASA GIBS — BlueMarble Shaded Relief + Bathymetry — EPSG:3031 ──────────
  //
  // Tile URL format (XYZ driver mapped to WMTS TileMatrix):
  //   https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/
  //     BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg
  //
  // TileMatrix set "500m" for EPSG:3031:
  //   Level 0: 8192 m/px  (1 tile  = 4194304 m)
  //   Level 1: 4096 m/px
  //   Level 2: 2048 m/px
  //   Level 3: 1024 m/px
  //   Level 4:  512 m/px
  //
  // Origin for GIBS EPSG:3031: [-4194304, 4194304] (top-left corner)
  // Full extent: [-4194304, -4194304, 4194304, 4194304]
  //
  private createNASAGIBSLayer(): TileLayer<XYZ> {
    const origin: [number, number] = [-4194304, 4194304];
    const resolutions = [8192, 4096, 2048, 1024, 512];

    const tileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [512, 512],
      extent: [-4194304, -4194304, 4194304, 4194304],
    });

    const source = new XYZ({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
      projection: 'EPSG:3031',
      tileGrid,
      crossOrigin: 'anonymous',
      // No getImageData tile-cleaning — ocean background layer covers voids
    });

    return new TileLayer({
      source,
      zIndex: 1,
      // Opacity set to 0.98 to let very thin ocean bg seep through at projection edges
      opacity: 0.98,
    });
  }

  // ─── BAS ArcGIS Antarctic & Southern Ocean tile service ──────────────────────
  //
  // Official BAS Antarctic tile server at EPSG:3031.
  // Tile origin and resolution set from ArcGIS tiling scheme for this service.
  //
  private createBASLayer(): TileLayer<XYZ> {
    const origin: [number, number] = [-30635955.4472718, 30635955.4472718];
    const resolutions = [
      239343.40193181095, // Level 0
      119671.70096590547, // Level 1
       59835.85048295274, // Level 2
       29917.92524147637, // Level 3
       14958.962620738184, // Level 4
        7479.481310369092, // Level 5
        3739.740655184546, // Level 6
        1869.870327592273, // Level 7
         934.9351637961365, // Level 8
    ];

    const tileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [256, 256],
      extent: [-4898635.244666592, -4898635.24466659, 4898635.24466659, 4898635.244666592],
    });

    const source = new XYZ({
      url: 'https://tiles.arcgis.com/tiles/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/Antarctica_and_the_Southern_Ocean/MapServer/tile/{z}/{y}/{x}',
      projection: 'EPSG:3031',
      tileGrid,
      crossOrigin: 'anonymous',
    });

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }

  // ─── Offline fallback — same tile grid as NASA GIBS for consistent view ──────
  //
  // Uses a publicly available GBIF polar vector tile that works offline-ish.
  // No getImageData processing.
  //
  private createOfflineLayer(): TileLayer<XYZ> {
    // Same origin/extent pattern as NASA to keep camera aligned on switch
    const origin: [number, number] = [-4194304, 4194304];
    const resolutions = [8192, 4096, 2048, 1024, 512];

    const tileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [512, 512],
      extent: [-4194304, -4194304, 4194304, 4194304],
    });

    const source = new XYZ({
      url: 'https://tile.gbif.org/3031/omt/{z}/{x}/{y}@2x.png?style=gbif-light',
      projection: 'EPSG:3031',
      tileGrid,
      crossOrigin: 'anonymous',
    });

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }
}
