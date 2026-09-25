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

export type BasemapSourceType = 'BAS_ANTARCTIC' | 'NASA_GIBS_WMTS';

export interface BasemapProviderConfig {
  sourceType: BasemapSourceType;
}

/**
 * Tile Load Handler: converts black/white no-data tile margins to the
 * continuous Southern Ocean background color (#DCEAF0 = rgb(220, 234, 240)).
 *
 * This prevents NASA GIBS JPEG black corners or ESRI/BAS white tile margins
 * from rendering as a visual polar circle inside the rectangular viewport.
 */
function applyTileNoDataCleaning(source: XYZ, oceanRGB: [number, number, number] = [220, 234, 240]) {
  source.setTileLoadFunction((tile, src) => {
    const img = (tile as any).getImage() as HTMLImageElement;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || 256;
        const h = img.naturalHeight || 256;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        let modified = false;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          // GIBS JPEG out-of-bounds pixels are black (r<18, g<18, b<18)
          // Out-of-bounds white margins are (r>252, g>252, b>252)
          if ((r < 18 && g < 18 && b < 18) || (r > 252 && g > 252 && b > 252)) {
            d[i] = oceanRGB[0];
            d[i + 1] = oceanRGB[1];
            d[i + 2] = oceanRGB[2];
            d[i + 3] = 255;
            modified = true;
          }
        }
        if (modified) {
          ctx.putImageData(imgData, 0, 0);
          img.src = canvas.toDataURL();
        }
      } catch (e) {
        // Fall back gracefully if canvas manipulation is restricted
      }
    };
    img.src = src;
  });
}

/**
 * AntarcticMapProvider
 *
 * Abstraction for Antarctic basemap tiles in EPSG:3031.
 *
 * Online:  BAS Antarctic & Southern Ocean basemap (real tile service)
 * Fallback: NASA GIBS Blue Marble
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
  public createBasemapLayer(): TileLayer<XYZ> {
    if (this.config.sourceType === 'NASA_GIBS_WMTS') {
      return this.createNASAGIBSLayer();
    }

    return this.createBASLayer();
  }

  // ─── BAS Antarctic & Southern Ocean (Official Tile Service) ────────────────
  private createBASLayer(): TileLayer<XYZ> {
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

    const source = new XYZ({
      url: 'https://tiles.arcgis.com/tiles/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/Antarctica_and_the_Southern_Ocean/MapServer/tile/{z}/{y}/{x}',
      projection: 'EPSG:3031',
      tileGrid: basTileGrid,
      crossOrigin: 'anonymous',
    });

    applyTileNoDataCleaning(source);

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }

  // ─── NASA GIBS BlueMarble Shaded Relief Bathymetry in EPSG:3031 ──────────────
  private createNASAGIBSLayer(): TileLayer<XYZ> {
    const origin: [number, number] = [-4194304, 4194304];
    const resolutions = [8192, 4096, 2048, 1024, 512]; // EXACTLY 5 levels: TileMatrix 0-4

    const gibsTileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [512, 512],
      extent: [-4194304, -4194304, 4194304, 4194304],
    });

    const source = new XYZ({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
      projection: 'EPSG:3031',
      tileGrid: gibsTileGrid,
      crossOrigin: 'anonymous',
    });

    applyTileNoDataCleaning(source);

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }
}

